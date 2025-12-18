import json
import logging
import os
import sys
import re
from pathlib import Path
from typing import List, Optional
from pydantic import ValidationError
from dotenv import load_dotenv
import ollama

# Adjust path and imports
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[2]
if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))

from shared.models import EventSchema, LocationEntry, TimeEntry, Link
from src.tool_search import search_web

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
OLLAMA_HOST = os.environ.get("OLLAMA_HOST")

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web for information about an event, location, or logic.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query, e.g. 'coordinates of Battle of Hastings', 'Battle of Hastings images'"
                    }
                },
                "required": ["query"],
            },
        },
    }
]

# --- PROMPTS ---

SYSTEM_PROMPT_LOCATION = """
You are an expert Historical Geographer.
Your goal is to enrich the **LOCATION** information of a historical event based on context and your knowledge.

### INPUT DATA:
Event JSON: {event_json}
Source Text: {source_text}

### CRITICAL SCHEMA RULES (READ CAREFULLY)
You must strictly adhere to the allowed values below. **Any value outside these lists makes the JSON invalid.**

**1. Location coordinates** (`location.latitude`, `location.longitude`)
   - ALLOWED VALUES: Decimal degrees (-90.0 to 90.0 for latitude, -180.0 to 180.0 for longitude)
   - Try your best to figure out the coordinates based on the location name, don't just stick to the source text.

**2. Location Precision** (`location.precision`)
   - ALLOWED VALUES: "spot", "area", "unknown"
   - *Note: "spot" = specific coordinate/building; "area" = city/region/country.*

**3. Location Certainty** (`location.certainty`)
   - ALLOWED VALUES: "definite", "approximate", "unknown"

### INSTRUCTIONS:
1. **Analyze:** Check if the event has missing location info (coordinates, name, precision, certainty).
2. **Enrich:** Use your internal knowledge to fill gaps. Use the 'search_web' tool if needed.
3. **Validate:** Check `precision` and `certainty` against allowed values.
4. **Fallback:** If you cannot find any new info, return the original `LocationEntry` data.

### RESPONSE FORMAT:
You must strictly follow this format.

<THOUGHTS>
(Step-by-step reasoning:
1. What location info is missing?
2. Reasoning for precision/certainty...
3. Final check against allowed values.)
</THOUGHTS>

```json
(The final valid JSON object for EventSchema goes here)
```
"""

SYSTEM_PROMPT_TIME = """
You are an expert Historical Chronologist.
Your goal is to enrich the **TIME** information (start and end) of a historical event.

### INPUT DATA:
Event JSON: {event_json}
Source Text: {source_text}

### CRITICAL SCHEMA RULES (READ CAREFULLY)
You must strictly adhere to the allowed values below. **Any value outside these lists makes the JSON invalid.**

**1. Time Precision** (`start_time.precision`, `end_time.precision`)
   - ALLOWED VALUES: "millennium", "century", "decade", "year", "month", "day", "hour", "minute", "second", "millisecond", "unknown"
   - *Note: Do NOT use "definite" or "exact" here.*

**2. Time Format**
   - For years in BCE/BC, use NEGATIVE integers (e.g. 1700 BCE -> -1700). For AD/CE, use positive integers.

### INSTRUCTIONS:
1. **Analyze:** Check `start_time` and `end_time`. Are fields like month/day/year missing?
2. **Enrich:** Use your internal knowledge to fill gaps. Use 'search_web' if needed.
3. **Validate:** Check `precision` against allowed values.
4. **Fallback:** If you cannot find any new info, return the original data.

### RESPONSE FORMAT:
You must strictly follow this format.

<THOUGHTS>
(Step-by-step reasoning...
1. What time info is missing?
2. Reasoning for precision...
3. Final check against allowed values.)
</THOUGHTS>

```json
(The final valid JSON object for EventSchema goes here)
```
"""

class LLMOrchestrator:
    def __init__(self, model_name: str, timeout: int):
        self.model_name = model_name
        self.client = ollama.Client(host=OLLAMA_HOST, timeout=timeout)
        self.max_turns = 2

    def enrich_events(self, events: List[EventSchema], orignal_text: str) -> List[EventSchema]:
        enriched = []
        total = len(events)
        for i, event in enumerate(events):
            try:
                enriched_event = self.enrich_single_event(event, orignal_text, i + 1, total)
                enriched.append(enriched_event)
            except Exception as e:
                logger.error(f"Failed to enrich event {event.title}: {e}")
                enriched.append(event)
        return enriched

    def enrich_single_event(self, event: EventSchema, original_text: str, index: int = 1, total: int = 1) -> EventSchema:
        separator = "=" * 60
        logger.info(f"\n{separator}\nENRICHING EVENT [{index}/{total}]: {event.title}\n{separator}")
        
        # Step 1: Enrich Location
        event = self._enrich_location(event, original_text)
        
        # Step 2: Enrich Time
        event = self._enrich_time(event, original_text)
        
        logger.info(f"Successfully enriched event: \033[97;48;5;22m{event.title}\033[0m with:\n\033[97;48;5;22m{json.dumps(event.model_dump(), indent=2)}\033[0m")
        return event

    def _enrich_location(self, event: EventSchema, original_text: str) -> EventSchema:
        logger.info("--- Enriching Location ---")
        prompt = SYSTEM_PROMPT_LOCATION.format(
            event_json=event.model_dump_json(),
            source_text=original_text
        )
        
        result_json, thoughts = self._run_enrichment_loop(prompt, "LocationEntry")
        
        if result_json:
            try:
                # result_json should be an EventSchema-like dict
                # We need to extract the 'location' field from it
                loc_data = result_json.get("location")
                if loc_data:
                    loc = LocationEntry(**loc_data)
                    event.location = loc
                    logger.info(f"Updated Location: \033[97;48;5;22m{loc}\033[0m")
            except ValidationError as ve:
                logger.warning(f"Validation failed for LocationEntry: {ve}")
        
        return event

    def _enrich_time(self, event: EventSchema, original_text: str) -> EventSchema:
        logger.info("--- Enriching Time ---")
        prompt = SYSTEM_PROMPT_TIME.format(
            event_json=event.model_dump_json(),
            source_text=original_text
        )
        
        result_json, thoughts = self._run_enrichment_loop(prompt, "TimeEntry")
        
        if result_json:
            try:
                # result_json should be an EventSchema-like dict
                # Extract start_time and end_time
                if "start_time" in result_json:
                    event.start_time = TimeEntry(**result_json["start_time"])
                if "end_time" in result_json:
                    if result_json["end_time"]:
                        event.end_time = TimeEntry(**result_json["end_time"])
                    else:
                        event.end_time = None
                logger.info(f"Updated Time: \033[97;48;5;22mStart={event.start_time}, End={event.end_time}\033[0m")
            except ValidationError as ve:
                logger.warning(f"Validation failed for TimeEntry: {ve}")

        return event

    def _run_enrichment_loop(self, system_prompt: str, context_label: str) -> (Optional[dict], str):
        """
        Runs the ReAct loop for a specific enrichment task.
        Returns (parsed_json_dict, thoughts_str).
        """
        messages = [
            {"role": "user", "content": system_prompt} 
            # Note: We put the whole prompt in user message as Ollama sometimes handles system prompts strictly
            # But adhering to previous pattern, let's try strict system if preferred, but user prompt is often safer for complex instructions + context in one go.
            # Actually, let's stick to the previous working pattern: System + User?
            # The previous code used SYSTEM_PROMPT_ALT in 'user' role. So I will do the same.
        ]
        
        final_json = None
        final_thoughts = ""
        success = False

        sub_sep = "-" * 40

        for turn in range(self.max_turns):
            logger.info(f"{context_label} Turn {turn + 1}/{self.max_turns}")

            response = self.client.chat(
                model=self.model_name,
                messages=messages,
                # tools=TOOLS,
            )
            
            message = response['message']
            messages.append(message)
            logger.info(f"LLM full response: {message}\n")

            if message.get('tool_calls'):
                logger.info(f"LLM requested tool execution ({len(message['tool_calls'])} calls).")
                for tool_call in message['tool_calls']:
                    if tool_call['function']['name'] == "search_web":
                        args = tool_call['function']['arguments']
                        if isinstance(args, str):
                            args = json.loads(args)
                        
                        logger.info(f"Tool Call 'search_web' Args:\n{json.dumps(args, indent=2)}")

                        query = args.get("query")
                        search_res = search_web(query)
                        
                        logger.info(f"Tool Result:\n{json.dumps(search_res, indent=2)}")

                        messages.append({
                            "role": "tool",
                            "content": json.dumps(search_res),
                        })
            else:
                content = message.get('content', '')
                
                # Extract thoughts
                thoughts_match = re.search(r'<THOUGHTS>(.*?)</THOUGHTS>', content, re.DOTALL)
                if thoughts_match:
                    final_thoughts = thoughts_match.group(1).strip()
                    logger.info(f"LLM Thoughts:\n{final_thoughts}\n")
                
                # Extract JSON
                json_content = ""
                json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
                if json_match:
                    json_content = json_match.group(1).strip()
                elif "```" in content:
                    json_content = re.sub(r'```\s*|\s*```', '', content).strip()
                
                if json_content:
                    logger.info(f"LLM JSON output:\n{json_content}\n")
                    try:
                        final_json = json.loads(json_content)
                        return final_json, final_thoughts
                    except json.JSONDecodeError as e:
                        logger.warning(f"Invalid JSON in response: {e}. Retrying...")
                        continue
                else:
                     logger.warning("No JSON found in response. Retrying...")
        
        logger.warning(f"Max turns reached for {context_label} enrichment.")
        return final_json, final_thoughts
