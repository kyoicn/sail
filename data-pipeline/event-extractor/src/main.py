import argparse
import json
import logging
import os
import sys
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
load_dotenv()
OLLAMA_HOST = os.environ.get("OLLAMA_HOST")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL")

# Adjust path
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[2] # .../data-pipeline
event_extractor_root = current_file.parents[1] # .../event-extractor

if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))
if str(event_extractor_root) not in sys.path:
    sys.path.append(str(event_extractor_root))

from src.parser_web import fetch_and_parse
from src.extractor_event import extract_events
from src.enricher_orchestrator import LLMOrchestrator
from shared.models import ExtractionRecord, Link



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main():
    parser = argparse.ArgumentParser(description="Event Extractor & Enricher")
    parser.add_argument("--url", help="URL to extract events from", required=True)
    parser.add_argument("--output", help="Output file for JSON", default="output.json")
    
    args = parser.parse_args()
    
    try:
        # 1. Parse
        clean_text = fetch_and_parse(args.url)
        print(f"--- Extracted Text ---\n{clean_text}\n")

        # 2. Extract
        events = extract_events(clean_text, OLLAMA_MODEL)
        print(f"--- Extracted {len(events)} Events ---")
        for e in events:
            if e.sources is None:
                e.sources = []
            e.sources.append(Link(label="Original Source", url=args.url))
            # Default all extracted events to importance 11.0
            e.importance = 11.0
            print(f"- {e.title}: {e.summary}")

        # 3. Enrich
        orchestrator = LLMOrchestrator(OLLAMA_MODEL)
        enriched_events = orchestrator.enrich_events(events, clean_text)
        
        # 4. Output
        record = ExtractionRecord(
            source_url=args.url,
            model_name=OLLAMA_MODEL,
            clean_text=clean_text,
            events=enriched_events
        )
        
        output_data = json.loads(record.model_dump_json())
        
        with open(args.output, "w") as f:
            json.dump(output_data, f, indent=2)
            
        print(f"\nSuccessfully saved extraction record with {len(enriched_events)} events to {args.output}")

    except Exception as e:
        logger.error(f"Pipeline failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
