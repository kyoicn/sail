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

Usage Examples:
    
    1. Import Folder to DEV:
       python data-pipeline/scripts/populate_events.py --folder data-pipeline/events --instance dev

    2. Import File to PROD:
       python data-pipeline/scripts/populate_events.py --file data-pipeline/all_events.json --instance prod

Arguments:
    --instance : 'prod' or 'dev' (Required or interactive).
    --folder   : Path to folder of JSON files.
    --file     : Path to single JSON file.
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
    parser.add_argument("--instance", choices=['prod', 'dev'], help="Target instance (prod or dev)")
    
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--file", help="Path to JSON file containing list of events")
    group.add_argument("--folder", help="Path to folder containing multiple JSON files")

    args = parser.parse_args()

    # Interactive Prompts for Instance
    instance = args.instance
    if not instance:
        while True:
            val = input("Target instance (prod/dev): ").strip().lower()
            if val in ['prod', 'dev']:
                instance = val
                break
            print("Invalid instance. Please choose 'prod' or 'dev'.")

    # Determine Target Table
    table_name = "events_dev" if instance == 'dev' else "events"
    
    # Collect Input Files
    json_files = []
    if args.folder:
        folder_path = Path(args.folder)
        if not folder_path.exists() or not folder_path.is_dir():
             print(f"Error: Folder not found: {folder_path}")
             sys.exit(1)
        json_files = sorted(list(folder_path.glob("*.json")))
        print(f"Found {len(json_files)} JSON files in folder.")
    elif args.file:
        input_path = Path(args.file)
        if not input_path.exists():
            print(f"Error: File not found: {input_path}")
            sys.exit(1)
        json_files = [input_path]
    else:
        # Fallback interactive
        path_str = input("Path to JSON file or folder: ").strip()
        path_obj = Path(path_str)
        if not path_obj.exists():
             print(f"Error: Path not found: {path_obj}")
             sys.exit(1)
        
        if path_obj.is_dir():
            json_files = sorted(list(path_obj.glob("*.json")))
            print(f"Found {len(json_files)} JSON files in folder.")
        else:
            json_files = [path_obj]

    # Load and Prepare Data
    events_to_upsert = []
    
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
                        "collections": event.collections or [],
                        "area_id": event.location.area_id
                    }
                    events_to_upsert.append(row)
                    
                except ValidationError as ve:
                    logger.warning(f"Validation Error in {jp.name}: {ve}")
                except Exception as e:
                    logger.warning(f"Error processing item in {jp.name}: {e}")

        except Exception as e:
            logger.error(f"Failed to read file {jp.name}: {e}")

    # Summary and Confirmation
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
    
    inserted = 0
    updated = 0
    
    try:
        for row in events_to_upsert:
            # We use ON CONFLICT DO UPDATE to handle both inserts and updates
            # How to distinguish? RETURNING xmax? 
            # Or just count "processed".
            # Simple approach: just upsert.
            
            query = f"""
                INSERT INTO {table_name} (
                    source_id, title, summary, image_urls, links,
                    start_astro_year, end_astro_year, start_time_entry, end_time_entry,
                    location, place_name, granularity, certainty, importance, collections, area_id
                ) VALUES (
                    %(source_id)s, %(title)s, %(summary)s, %(image_urls)s, %(links)s,
                    %(start_astro_year)s, %(end_astro_year)s, %(start_time_entry)s, %(end_time_entry)s,
                    ST_GeogFromText(%(location_wkt)s), %(place_name)s, %(granularity)s, %(certainty)s, %(importance)s, %(collections)s, %(area_id)s
                )
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
                RETURNING (xmax = 0) AS inserted;
            """
            
            cur.execute(query, row)
            res = cur.fetchone()
            if res and res[0]:
                inserted += 1
            else:
                updated += 1
                
        conn.commit()
        print(f"✅ Success! Inserted: {inserted}, Updated: {updated}.")
        
    except Exception as e:
        conn.rollback()
        print(f"❌ Database Transaction Failed: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
