import os
import sys
import json
import argparse
import logging
import re
import psycopg2
from pathlib import Path
from dotenv import load_dotenv
from pydantic import ValidationError
from typing import List

"""
Script: populate_events.py
Description:
    Bulk imports EventSchema-structured JSON data into the Supabase database.
    It supports creating new events and updating existing ones (Upsert) 
    based on a deterministic 'source_id'.

    Features:
    - Reads single JSON file or scans a folder for *.json.
    - Validates data against EventSchema (via Pydantic).
    - Generates 'source_id' from filename + title to ensure easy updates.
    - interactive mode for choosing Prod/Dev instance.

Detailed Parameter Guide:
    --instance:
        Target database instance: 'prod', 'dev', 'staging'.
        - prod: targets 'events' table.
        - dev: targets 'events_dev' table.
    
    --input:
        Path to a single JSON file OR a directory containing JSON files.
        If a directory is provided, it globs all `*.json` files.
    
    --batch (default: 200):
        Number of events to process before committing a transaction batch.

    --tags:
        Comma-separated list of tags to append to all imported events.
        Example: "import_2023,reviewed"

Usage Examples:
    # 1. Import Folder to DEV (Default Batch Size 200):
    python data-pipeline/scripts/populate_events.py --input data-pipeline/events --instance dev

    # 2. Import File to PROD with Custom Batch and Tags:
    python data-pipeline/scripts/populate_events.py --input data-pipeline/all.json --instance prod --batch 1000 --tags "unified_import,v2"
"""

# Adjust path to allow importing from src/shared
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))

from shared.models import EventSchema
from shared.utils import calculate_astro_year

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv(os.path.join(data_pipeline_root, ".env"))

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    logger.error("DATABASE_URL not found in environment variables.")
    sys.exit(1)

def slugify(text):
    text = str(text).lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def get_connection():
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        logger.error(f"Failed to connect to Database: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Populate Events Data")
    parser.add_argument("--instance", choices=['prod', 'dev', 'staging'], help="Target instance (prod, dev, staging)")
    
    parser.add_argument("--input", help="Path to JSON file or folder containing JSON files")
    parser.add_argument("--batch", type=int, default=200, help="Batch commit size (default: 200)")
    parser.add_argument("--tags", help="Comma-separated tags to add to events")

    args = parser.parse_args()

    # Interactive Prompts for Instance
    instance = args.instance
    if not instance:
        while True:
            val = input("Target instance (prod/dev/staging): ").strip().lower()
            if val in ['prod', 'dev', 'staging']:
                instance = val
                break
            print("Invalid instance. Please choose 'prod', 'dev' or 'staging'.")

    # Determine Target Table
    if instance == 'dev':
        table_name = "events_dev"
    elif instance == 'staging':
        table_name = "events_staging"
    else:
        table_name = "events"
    
    # Collect Input Files
    json_files = []
    
    # Determine input path
    input_path_str = args.input
    if not input_path_str:
        # Fallback interactive
        input_path_str = input("Path to JSON file or folder: ").strip()
    
    path_obj = Path(input_path_str)
    if not path_obj.exists():
            print(f"Error: Path not found: {path_obj}")
            sys.exit(1)
    
    if path_obj.is_dir():
        json_files = sorted(list(path_obj.glob("*.json")))
        print(f"Found {len(json_files)} JSON files in folder.")
    else:
        json_files = [path_obj]

    # Load and Prepare Data
    events_to_upsert = {}
    
    print(f"\nProcessing {len(json_files)} files...")
    
    for jp in json_files:
        try:
            with open(jp, 'r') as f:
                raw_data = json.load(f)
            
            # Helper to normalize input to list
            event_list = []
            if isinstance(raw_data, list):
                event_list = raw_data
            elif isinstance(raw_data, dict):
                # Maybe wrapped in {"events": [...]}?
                if "events" in raw_data and isinstance(raw_data["events"], list):
                    event_list = raw_data["events"]
                else:
                    # Provide single dict fallback?
                    event_list = [raw_data]
            
            for item in event_list:
                try:
                    event = EventSchema(**item)
                    
                    # Prepare for DB
                    # Identity
                    # Use filename + title slug for ID stability
                    source_id = f"{slugify(jp.stem)}:{slugify(event.title)}"
                    
                    # Time
                    start_astro = calculate_astro_year(event.start_time)
                    start_json = event.start_time.model_dump(exclude_none=True)
                    
                    end_astro = None
                    end_json = None
                    if event.end_time:
                        end_astro = calculate_astro_year(event.end_time)
                        end_json = event.end_time.model_dump(exclude_none=True)

                    # Location
                    lat = event.location.latitude
                    lng = event.location.longitude
                    
                    if lat is None or lng is None:
                        logger.warning(f"Skipping '{event.title}': Missing lat/lng.")
                        continue
                        
                    wkt = f"POINT({lng} {lat})"
                    
                    # Links/Images
                    links_json = json.dumps([l.model_dump() for l in (event.sources or [])])
                    image_urls = [img.url for img in (event.images or [])]
                    
                    row = {
                        "source_id": source_id,
                        "title": event.title,
                        "summary": event.summary,
                        "image_urls": image_urls,
                        "links": links_json,
                        "start_astro_year": start_astro,
                        "end_astro_year": end_astro,
                        "start_time_entry": json.dumps(start_json),
                        "end_time_entry": json.dumps(end_json) if end_json else None,
                        "location_wkt": wkt,
                        "place_name": event.location.location_name,
                        "granularity": event.location.precision,
                        "certainty": event.location.certainty,
                        "importance": event.importance,
                        "importance": event.importance,
                        "collections": event.collections or [],
                        "area_id": event.location.area_id
                    }
                    
                    # Apply CLI tags
                    if args.tags:
                        new_tags = [t.strip() for t in args.tags.split(',') if t.strip()]
                        # Combine and Deduplicate
                        current_tags = set(row["collections"])
                        current_tags.update(new_tags)
                        row["collections"] = list(current_tags)

                    if source_id in events_to_upsert:
                        logger.debug(f"Duplicate source_id found: {source_id}. Overwriting with latest.")
                    
                    events_to_upsert[source_id] = row
                    
                except ValidationError as ve:
                    logger.warning(f"Validation Error in {jp.name}: {ve}")
                except Exception as e:
                    logger.warning(f"Error processing item in {jp.name}: {e}")

        except Exception as e:
            logger.error(f"Failed to read file {jp.name}: {e}")

    # Summary and Confirmation
    # Convert back to list for processing
    events_to_upsert = list(events_to_upsert.values())

    if not events_to_upsert:
        print("No valid events found to import.")
        sys.exit(0)

    print(f"\n--- Import Summary ---")
    print(f"Target Instance: {instance.upper()} (Table: {table_name})")
    print(f"Total Events to Upsert: {len(events_to_upsert)}")
    print("Sample Events:")
    for i, e in enumerate(events_to_upsert[:5]):
        print(f"  - {e['title']} ({e['start_astro_year']}) [ID: {e['source_id']}]")
    if len(events_to_upsert) > 5:
        print(f"  ... and {len(events_to_upsert) - 5} more.")

    confirm = input("\nProceed with import? [y/N]: ").strip().lower()
    if confirm != 'y':
        print("Cancelled.")
        sys.exit(0)

    # Execution
    print(f"Inserting into {table_name}...")
    conn = get_connection()
    cur = conn.cursor()
    
    from psycopg2.extras import execute_values
    
    inserted = 0
    updated = 0 # With bulk upsert, precise updated count is hard, we track 'processed'
    
    try:
        total_events = len(events_to_upsert)
        batch_size = args.batch
        
        # Prepare Batch
        # We need to ensure the columns match the template
        columns = [
            "source_id", "title", "summary", "image_urls", "links",
            "start_astro_year", "end_astro_year", "start_time_entry", "end_time_entry",
            "location_wkt", "place_name", "granularity", "certainty", "importance", "collections", "area_id"
        ]
        
        # Convert dict rows to tuples in correct order
        values_list = []
        for row in events_to_upsert:
            values_list.append((
                row["source_id"], row["title"], row["summary"], row["image_urls"], row["links"],
                row["start_astro_year"], row["end_astro_year"], row["start_time_entry"], row["end_time_entry"],
                row["location_wkt"], row["place_name"], row["granularity"], row["certainty"], row["importance"], row["collections"], row["area_id"]
            ))

        query = f"""
            INSERT INTO {table_name} (
                source_id, title, summary, image_urls, links,
                start_astro_year, end_astro_year, start_time_entry, end_time_entry,
                location, place_name, granularity, certainty, importance, collections, area_id
            ) VALUES %s
            ON CONFLICT (source_id) DO UPDATE SET
                title = EXCLUDED.title,
                summary = EXCLUDED.summary,
                image_urls = EXCLUDED.image_urls,
                links = EXCLUDED.links,
                start_astro_year = EXCLUDED.start_astro_year,
                end_astro_year = EXCLUDED.end_astro_year,
                start_time_entry = EXCLUDED.start_time_entry,
                end_time_entry = EXCLUDED.end_time_entry,
                location = EXCLUDED.location,
                place_name = EXCLUDED.place_name,
                granularity = EXCLUDED.granularity,
                certainty = EXCLUDED.certainty,
                importance = EXCLUDED.importance,
                collections = EXCLUDED.collections,
                area_id = EXCLUDED.area_id
        """
        
        # We process in chunks to avoid blowing up memory with huge value lists if total_events is massive
        # although for <100k it's fine.
        
        for i in range(0, total_events, batch_size):
            batch = values_list[i : i + batch_size]
            
            # Note: ST_GeogFromText is a function call. existing execute_values supports templates.
            # However, our values list has the WKT string.
            # We need a template that wraps the WKT param.
            # Template must match the number of columns in the tuple.
            # The column 'location_wkt' (index 9) needs wrapping.
            
            # %s for all except index 9 which is ST_GeogFromText(%s)
            # Tuple has 16 items.
            template = "(" + ", ".join(["%s"] * 16) + ")"
            # Wait, execute_values effectively does "VALUES (v1, v2, ...), (u1, u2, ...)"
            # If we want a function call on one value, we need to modify the template.
            # We can't easily map one column to a function in the default template unless we craft it carefully.
            # Alternative: Construct the template string manually.
            
            # Index 9 is location_wkt.
            # template = "(%s, %s, ..., ST_GeogFromText(%s), ...)"
            
            placeholders = ["%s"] * 16
            placeholders[9] = "ST_GeogFromText(%s)" # Wrap location WKT
            template = "(" + ", ".join(placeholders) + ")"
            
            execute_values(cur, query, batch, template=template, page_size=batch_size)
            
            conn.commit()
            
            current_count = min(i + batch_size, total_events)
            sys.stdout.write(f"\r[Progress] Committed {current_count}/{total_events} events...")
            sys.stdout.flush()
            
        print(f"\n✅ Success! Processed {total_events} events.")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ Database Transaction Failed: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
