import json
import logging
import os
import sys
from pathlib import Path
from typing import List, Optional
from dotenv import load_dotenv
import ollama

# Adjust path and imports
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[2]
if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))

from shared.models import EventSchema, LocationEntry, Link
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

SYSTEM_PROMPT = """
You are an intelligent Event Enricher.
Your goal is to fill in missing information for historical events.
You have access to a search engine.

You will be given an event JSON, and a block of text where the event is extracted from.
Check if:
1. Location information (coordinates, name, precision, certainty) are missing.
2. Start, end time of the event are incomplete.

If you can provide the missing info from your own knowledge, do so and output the Final Answer.
You should try your best to infer the missing information, meanwhile only provide info that you are absolutely sure of.
Here is an example:
  - Assume the event talks about "D-Day in World War II".
  - If it only has the month and day, which is June 6th, you should provide the year information, which is missing, 1944.
  - If it only has the location name information, which is Normandy, you should provide the coordinates, precision, and certainty.
If you need validation or don't know, use the 'search_web' tool.

Here are some guidelines:
1. DO NOT MAKE UP ANY FAKE INFORMATION.
2. If the event time is incomplete, try your best to figure out the most precise time that you're 100 percent sure of, and set the time precision accordingly. If it's really unknown, set the precision to 'unknown'.
3. If the event location is incomplete, try your best to first figure out location name (if missing), then determine the location precision ("spot", "area", "unknown"), then figure out coordinates, and finally populate your certainty accordingly ("definite", "approximate", "unknown").

When you have the information, output the FINAL JSON with the filled fields.
IMPORTANT: The final output MUST be the valid JSON of the single EventSchema object.
"""

class LLMOrchestrator:
    def __init__(self, model_name: str):
        self.model_name = model_name

    def enrich_events(self, events: List[EventSchema]) -> List[EventSchema]:
        enriched = []
        for event in events:
            try:
                enriched_event = self.enrich_single_event(event)
                enriched.append(enriched_event)
            except Exception as e:
                logger.error(f"Failed to enrich event {event.title}: {e}")
                enriched.append(event)
        return enriched

    def enrich_single_event(self, event: EventSchema) -> EventSchema:
        logger.info(f"Enriching event: {event.title}")
        
        # Enriche every event
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Enrich this event:\n{event.model_dump_json()}"}
        ]

        # Max turns to prevent infinite loops
        client = ollama.Client(host=OLLAMA_HOST)
        for _ in range(5):
            response = client.chat(
                model=self.model_name,
                messages=messages,
                # tools=TOOLS,
            )
            
            message = response['message']
            messages.append(message)

            if message.get('tool_calls'):
                logger.info(f"LLM requested tool execution ({len(message['tool_calls'])} calls).")
                for tool_call in message['tool_calls']:
                    if tool_call['function']['name'] == "search_web":
                        args = tool_call['function']['arguments']
                        # args might be a dict already or string depending on version, usually dict in ollama-python
                        if isinstance(args, str):
                            args = json.loads(args)
                        
                        logger.info(f"Tool Call 'search_web' Args:\n{json.dumps(args, indent=2)}")

                        query = args.get("query")
                        search_res = search_web(query)
                        
                        logger.info(f"Tool Result:\n{json.dumps(search_res, indent=2)}")

                        # Ollama expects tool outputs with role 'tool'
                        messages.append({
                            "role": "tool",
                            "content": json.dumps(search_res),
                            # "name": "search_web" # optional in some versions, good practice
                        })
            else:
                # No tool call, assume final answer or text
                content = message.get('content', '')
                try:
                    parsed = json.loads(content)
                    logger.info(f"LLM Final Answer:\n{json.dumps(parsed, indent=2)}")
                except:
                    logger.debug(f"LLM Final Answer (Raw): {content}")

                try:
                    # Try to parse as JSON
                    data = json.loads(content)
                    
                    # Sometimes LLM wraps in "event": {...}
                    if "events" in data and isinstance(data["events"], list):
                         updated_data = data["events"][0]
                    elif "event" in data:
                        updated_data = data["event"]
                    else:
                        updated_data = data

                    # Validate and return
                    
                    # Ensure location structure is correct
                    if "location" in updated_data:
                         loc = updated_data["location"]
                         # Ensure enums are valid strings or default
                         if "precision" not in loc: loc["precision"] = "spot"
                         if "certainty" not in loc: loc["certainty"] = "definite"

                    return EventSchema(**updated_data)
                except json.JSONDecodeError as e:
                    logger.warning(f"LLM response was not valid JSON. Error: {e}\nContent: {content}\nContinuing/Retrying...")
                    continue
                except ValidationError as ve:
                    logger.warning(f"Validation failed on enriched data: {ve}")
                    # Might try to ask LLM to fix, or just return original
                    return event

        logger.warning("Max enrichment turns reached.")
        return event
