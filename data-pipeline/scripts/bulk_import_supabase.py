import os
import sys
import json
import argparse
import logging
import re
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client
from pydantic import ValidationError

# Adjust path to allow importing from src/shared
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))

from shared.models import ExtractionRecord
from shared.utils import calculate_astro_year

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv(os.path.join(data_pipeline_root, ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    logger.error("SUPABASE_URL or SUPABASE_SERVICE_KEY not found in environment variables.")
    sys.exit(1)

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def connect_supabase() -> Client:
    try:
        return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    except Exception as e:
        logger.error(f"Failed to connect to Supabase: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Bulk Import Events to Supabase")
    parser.add_argument("--input_dir", help="Directory containing ExtractionRecord JSON files", required=True)
    parser.add_argument("--table_name", help="Target table name in Supabase", default=None)
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.exists() or not input_dir.is_dir():
        logger.error(f"Input directory does not exist: {input_dir}")
        sys.exit(1)

    # Determine target table
    table_name = args.table_name
    if not table_name:
        try:
            table_name = input("Enter target table name: ").strip()
        except EOFError:
            pass # Handle non-interactive environments

    # Connect to DB
    supabase = connect_supabase()
    
    files = list(input_dir.glob("*.json"))
    logger.info(f"Found {len(files)} JSON files in {input_dir}")

    all_payloads = []
    total_events = 0
    successful_imports = 0
    failed_imports = 0

    for file_path in files:
        logger.info(f"Processing {file_path.name}...")
        try:
            with open(file_path, "r") as f:
                data = json.load(f)
            
            # Validate
            try:
                record = ExtractionRecord(**data)
            except ValidationError as ve:
                logger.warning(f"Skipping {file_path.name}: Validation error - {ve}")
                continue
                
            for event in record.events:
                total_events += 1
                try:
                    # 1. Identity
                    source_id = f"{slugify(file_path.stem)}:{slugify(event.title)}"
                    
                    # 2. Time
                    start_te = event.start_time
                    start_astro = calculate_astro_year(start_te)
                    start_json = start_te.model_dump(exclude_none=True)
                    
                    end_astro = None
                    end_json = None
                    if event.end_time:
                        end_te = event.end_time
                        end_astro = calculate_astro_year(end_te)
                        end_json = end_te.model_dump(exclude_none=True)
                    
                    # 3. Location
                    lat = event.location.latitude
                    lng = event.location.longitude
                    place_name = event.location.location_name
                    granularity = event.location.precision
                    certainty = event.location.certainty
                    
                    if lat is None or lng is None:
                        logger.warning(f"Event '{event.title}' missing coordinates. Skipping.")
                        continue
                    
                    # Format as WKT for Supabase/PostGIS
                    location_wkt = f"POINT({lng} {lat})" 
                    
                    # 4. Links & Images
                    links = [s.model_dump() for s in event.sources] if event.sources else []
                    image_urls = [img.url for img in event.images] if event.images else []
                    
                    payload = {
                        "source_id": source_id,
                        "title": event.title,
                        "summary": event.summary,
                        "image_urls": image_urls,
                        "links": links,
                        "start_astro_year": start_astro,
                        "end_astro_year": end_astro,
                        "start_time_entry": start_json,
                        "end_time_entry": end_json,
                        "location": location_wkt, 
                        "place_name": place_name,
                        "granularity": granularity,
                        "certainty": certainty,
                        "importance": event.importance,
                        "collections": event.collections
                    }
                    all_payloads.append(payload)

                except Exception as e:
                    logger.error(f"Error preparing event '{event.title}': {e}")
                    failed_imports += 1
            
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in {file_path.name}")
        except Exception as e:
            logger.error(f"Unexpected error processing {file_path.name}: {e}")

    # Confirmation Step
    if all_payloads:
        print(f"\n--- Ready to Import {len(all_payloads)} Events ---")
        for i, p in enumerate(all_payloads): # Show all events
            # Metrics for indicators
            missing_time = ""
            if not p.get('start_time_entry', {}).get('year'):
                 # Red background for visibility
                 missing_time = "\033[41m [NO TIME] \033[0m"
            
            missing_loc = ""
            if not p.get('place_name'):
                 # Red background for visibility
                 missing_loc = "\033[41m [NO LOC NAME] \033[0m"

            print(f"{i+1}. {p['title']} ({p['source_id']}){missing_time}{missing_loc}")
            
        print(f"\nTarget Table: {table_name}")
        confirm = input("Proceed with import? [y/N]: ").strip().lower()
        if confirm != 'y':
            logger.info("Import cancelled by user.")
            sys.exit(0)

    # Upsert in chunks (e.g., 1000 events per request) to avoid payload limits
    BATCH_SIZE = 1000
    if all_payloads:
        logger.info(f"Starting bulk import of {len(all_payloads)} events (Batch size: {BATCH_SIZE})...")
        
        for i in range(0, len(all_payloads), BATCH_SIZE):
            batch = all_payloads[i:i + BATCH_SIZE]
            try:
                response = supabase.table(table_name).upsert(batch, on_conflict='source_id').execute()
                if response.data:
                    count = len(response.data)
                    successful_imports += count
                    logger.info(f"Imported batch {i//BATCH_SIZE + 1}: {count} events")
                else:
                    logger.warning(f"Batch {i//BATCH_SIZE + 1} returned no data.")
            except Exception as e:
                logger.error(f"Supabase Upsert failed for batch {i//BATCH_SIZE + 1}: {e}")
                failed_imports += len(batch)
    else:
        logger.info("No valid events found to import.")

    logger.info("--- Import Summary ---")
    logger.info(f"Total Events Found: {total_events}")
    logger.info(f"Successfully Imported: {successful_imports}")
    logger.info(f"Failed: {failed_imports}")

if __name__ == "__main__":
    main()
