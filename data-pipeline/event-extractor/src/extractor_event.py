import json
import logging
import os
from typing import List
from pydantic import ValidationError
from dotenv import load_dotenv
import ollama

# Adjust path to import shared models
import sys
from pathlib import Path

# Add data-pipeline root to sys.path to allow importing shared modules
# Assuming this file is in sail/data-pipeline/event-extractor/src/
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[2] # up to event-extractor, then data-pipeline
if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))

try:
    from shared.models import EventSchema
except ImportError:
    logging.error("Failed to import EventSchema. Ensure shared/models.py is accessible.")
    raise

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
OLLAMA_HOST = os.environ.get("OLLAMA_HOST")

SYSTEM_PROMPT = """
You are an expert Event Extractor. Your task is to extract historical or significant events from the provided text.

Output must be a JSON object containing a list of events under the key "events".
Each event must adhere to the following structure (JSON Schema):

{
  "title": "string (REQUIRED)",
  "summary": "string (REQUIRED, summary of the event)",
  "start_time": {
    "year": int (REQUIRED),
    "month": int (optional),
    "day": int (optional),
    "hour": int (optional),
    "minute": int (optional),
    "second": int (optional),
    "precision": "string (one of: millennium, century, decade, year, month, day, hour, minute, second)"
  },
  "location": {
    "latitude": float (REQUIRED if known, otherwise omit),
    "longitude": float (REQUIRED if known, otherwise omit),
    "location_name": "string (optional)",
    "precision": "string (one of: spot, area)",
    "certainty": "string (one of: definite, approximate)"
  },
  "importance": float (0.0 to 10.0),
  "sources": [
    {"label": "string", "url": "string"}
  ]
}

# Rules:
1. Extract ALL relevant events mentioned in the text.
2. If exact coordinates are not mentioned, omit latitude/longitude in the extraction (Enrichment step will fix this).
3. If year is not mentioned, you may try to infer from context if unambiguous, otherwise omit the event or time.
4. 'title' and 'summary' are MANDATORY.
5. Output valid JSON only. No markdown formatting.
"""

def extract_events(clean_text: str, model_name: str, collection: str = None) -> List[EventSchema]:
    """
    Extracts events from clean text using a local LLM.
    Returns a list of EventSchema objects.
    """
    logger.info(f"Extracting events from text (length: {len(clean_text)}) using model {model_name}...")
    
    try:
        client = ollama.Client(host=OLLAMA_HOST, timeout=60.0)
        response = client.chat(
            model=model_name,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Extract events from the following text:\n\n{clean_text}"}
            ],
            format='json',
            options={'temperature': 0.1},
        )
        
        content = response['message']['content']
        try:
            data = json.loads(content)
            logger.debug(f"LLM Raw Output:\n{json.dumps(data, indent=2)}")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM output as JSON: {e}\nContent: {content}")
            return []
        events_data = data.get("events", [])
        
        parsed_events = []
        for event_dict in events_data:
            try:
                # Validate against Pydantic model
                # Note: helper logic might be needed if LLM outputs partial structures
                # For now, we assume LLM follows schema or we handle validation errors.
                # We interpret "omit latitude/longitude" as not providing the fields.
                # But LocationEntry requires lat/lon. If missing, we might need dummy values or exclude location.
                # However, EventSchema requires location.
                # So if LLM cannot find location, we might need a dummy location or handle it.
                # Strategy: If location missing, set dummy 0.0, 0.0 and mark as low certainty? 
                # Or better, let's ask LLM to provide best guess or 0.0 if unknown.
                
                # Correction: "location" field in EventSchema is: location: LocationEntry.
                # LocationEntry in models.py: latitude: float, longitude: float ...
                # So lat/lon are required.
                
                # If LLM didn't provide lat/lon, we inject 0.0 to satisfy schema, 
                # knowing Enrichment will fix it.
                # Sanitize location fields
                if "location" in event_dict:
                    loc = event_dict["location"]
                    # Convert empty strings to None for Pydantic validation
                    if loc.get("latitude") == "": loc["latitude"] = None
                    if loc.get("longitude") == "": loc["longitude"] = None
                    
                    # Ensure keys exist
                    if "latitude" not in loc: loc["latitude"] = None
                    if "longitude" not in loc: loc["longitude"] = None
                else:
                    # Create default empty location
                    event_dict["location"] = {
                        "latitude": None,
                        "longitude": None,
                        "location_name": "Unknown",
                        "certainty": "approximate"
                    }
                
                # Sanitize start_time year if it's an empty string
                if "start_time" in event_dict and isinstance(event_dict["start_time"], dict):
                     if event_dict["start_time"].get("year") == "":
                         event_dict["start_time"]["year"] = None

                event = EventSchema(**event_dict)
                
                # Assign Collection if provided
                if collection:
                     if event.collections is None:
                         event.collections = []
                     if collection not in event.collections:
                         event.collections.append(collection)

                parsed_events.append(event)
            except ValidationError as ve:
                logger.error(f"Validation error for event: {ve} - Data: {event_dict}")
                continue
        
        logger.info(f"Successfully extracted {len(parsed_events)} events.")
        return parsed_events

    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        return []
