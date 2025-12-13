import argparse
import json
import logging
import os
import sys
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime

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

def process_url(url: str, output_file: str, output_dir: str):
    """
    Orchestrates the extraction process for a single URL.
    """
    current_time = datetime.now().strftime("%Y%m%d%H%M%S")
    
    try:
        # 1. Parse
        clean_text = fetch_and_parse(url)
        print(f"--- Extracted Text ---\n{clean_text}\n")

        # 2. Extract
        events = extract_events(clean_text, OLLAMA_MODEL)
        print(f"--- Extracted {len(events)} Events ---")
        for e in events:
            if e.sources is None:
                e.sources = []
            e.sources.append(Link(label="Original Source", url=url))
            # Default all extracted events to importance 11.0
            e.importance = 11.0
            print(f"- {e.title}: {e.summary}")

        # 3. Enrich
        orchestrator = LLMOrchestrator(OLLAMA_MODEL)
        enriched_events = orchestrator.enrich_events(events, clean_text)
        
        # 4. Output
        record = ExtractionRecord(
            source_url=url,
            model_name=OLLAMA_MODEL,
            clean_text=clean_text,
            events=enriched_events
        )
        
        output_data = json.loads(record.model_dump_json())
        
        filename = output_file
        if not filename:
            filename = f"{url.replace('/', '|')}__{current_time}_{len(enriched_events)}_events.json"
            
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, filename)
        else:
            output_path = filename
        
        with open(output_path, "w") as f:
            json.dump(output_data, f, indent=2)
            
        print(f"\nSuccessfully saved extraction record with {len(enriched_events)} events to {output_path}")

    except Exception as e:
        logger.error(f"Pipeline failed for {url}: {e}")
        # We don't exit here so other URLs in batch can proceed, but for single run checking main() return matters
        raise e

def main():
    parser = argparse.ArgumentParser(description="Event Extractor & Enricher")
    parser.add_argument("--url", help="URL to extract events from", required=False)
    parser.add_argument("--input_file", help="File containing list of URLs to process", required=False)
    parser.add_argument("--output_file", help="Output filename for JSON", default="")
    parser.add_argument("--output_dir", help="Output directory for JSON", default="")
    
    args = parser.parse_args()

    # Priority 1: Single URL
    if args.url:
        try:
            process_url(args.url, args.output_file, args.output_dir)
        except Exception:
            sys.exit(1)
            
    # Priority 2: Batch Input File
    elif args.input_file:
        if not os.path.exists(args.input_file):
            logger.error(f"Input file not found: {args.input_file}")
            sys.exit(1)
            
        with open(args.input_file, 'r') as f:
            urls = [line.strip() for line in f if line.strip()]
            
        print(f"Found {len(urls)} URLs in {args.input_file}")
        
        failures = 0
        for url in urls:
            try:
                print(f"\nProcessing: {url}")
                # For batch processing, we force output_file to empty each time so it auto-generates 
                # unique filenames based on the URL, unless user specifically wants to overwrite/handle it differently.
                # Usually batch processing implies auto-naming. If args.output_file is set, it would overwrite provided file for every URL.
                # So we should probably ignore args.output_file for batch mode to be safe, or let user decide.
                # Given the user didn't specify, passing "" (auto-name) is safer for batch.
                process_url(url, "", args.output_dir)
            except Exception as e:
                logger.error(f"Failed to process {url}")
                failures += 1
                
        if failures > 0:
            print(f"\nCompleted with {failures} failures.")
            sys.exit(1)
        else:
            print("\nAll URLs processed successfully.")
            
    else:
        parser.print_help()
        sys.exit(1)

if __name__ == "__main__":
    main()
