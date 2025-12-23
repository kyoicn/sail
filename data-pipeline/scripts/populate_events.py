"""
Script: populate_events.py
Description:
    Bulk imports EventSchema-structured JSON data into the Supabase database.
    Inherits from BasePopulator for standardized usage.

    Features:
    - Reads single JSON file or scans a folder for *.json.
    - Validates data against EventSchema (via Pydantic).
    - Generates 'source_id' from filename + title to ensure easy updates.
    - Interactive mode for choosing Prod/Dev/Staging instance if not specified.

Detailed Parameter Guide:
    --instance:
        Target database instance. Choices: 'prod', 'dev', 'staging'.
        - prod: targets 'events' table (PUBLIC schema).
        - dev: targets 'events_dev' table (DEV schema).
        - staging: targets 'events_staging' table (STAGING schema).
    
    --input:
        Path to a single JSON file OR a directory containing JSON files.
        If a directory is provided, the script will process all `*.json` files found within.
    
    --batch (default: 200):
        The number of events to process and commit in a single database transaction. 
        Adjust this based on memory constraints or network latency. 
        Higher values (e.g. 1000) are faster but risk larger rollbacks on error.

    --tags:
        Optional comma-separated list of strings to append to the 'collections' field 
        of all imported events. Useful for marking a specific import batch.
        Example: "import_2023,reviewed"

Usage Examples:
    # 1. Standard Dev Import (Interactive Confirmation):
    #    Imports all JSON files from the 'data-pipeline/data/events' folder into the DEV environment.
    python data-pipeline/scripts/populate_events.py --input data-pipeline/data/events --instance dev

    # 2. Production Import with Tags:
    #    Imports a specific file into PRODUCTION, tagging all events with "v1_launch".
    python data-pipeline/scripts/populate_events.py --input data-pipeline/data/final_export.json --instance prod --tags "v1_launch"

    # 3. Large Batch Import:
    #    Increases batch size to 1000 for faster processing of large datasets.
    python data-pipeline/scripts/populate_events.py --input data-pipeline/data/large_dataset/ --instance dev --batch 1000
"""

import sys
import json
import logging
import re
import argparse
from pathlib import Path
from typing import List
from psycopg2.extras import execute_values

# Adjust path to allow importing from src/shared
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
sys.path.append(str(data_pipeline_root))

from shared.models import EventSchema
from shared.utils import calculate_astro_year
from shared.populator_base import BasePopulator

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def slugify(text):
    text = str(text).lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

class EventPopulator(BasePopulator[EventSchema]):
    def __init__(self):
        # We pass "events" as collection key, though we override load_data so it's less strict
        super().__init__(EventSchema, "events", "events")

    def parse_args(self):
        # Override to add --batch and --tags
        parser = argparse.ArgumentParser(description=f"Populate {self.model_class.__name__} Data")
        parser.add_argument("--instance", choices=['prod', 'dev', 'staging'], help="Target instance (prod, dev, staging)")
        parser.add_argument("--input", help="Path to JSON file or folder containing JSON files")
        parser.add_argument("--existing", choices=['skip', 'overwrite'], default='skip', help="Policy for existing records (default: skip)")
        
        # Custom args
        parser.add_argument("--batch", type=int, default=200, help="Batch commit size (default: 200)")
        parser.add_argument("--tags", help="Comma-separated tags to add to events")
        
        return parser.parse_args()

    def load_data(self, json_files: List[Path]) -> List[dict]:
        """
        Overridden to inject '_source_stem' into items for ID generation.
        """
        all_raw_items = []
        for jp in json_files:
            try:
                with open(jp, 'r') as f:
                    raw_data = json.load(f)
                
                # Normalize input
                event_list = []
                if isinstance(raw_data, list):
                    event_list = raw_data
                elif isinstance(raw_data, dict):
                    if "events" in raw_data and isinstance(raw_data["events"], list):
                        event_list = raw_data["events"]
                    else:
                        event_list = [raw_data]
                
                # Inject Source Metadata
                stem = jp.stem
                for item in event_list:
                    if isinstance(item, dict):
                        item['_source_stem'] = stem
                        all_raw_items.append(item)
                        
            except Exception as e:
                logger.warning(f"Failed to load {jp.name}: {e}")
                
        return all_raw_items

    def populate(self, items: List[EventSchema], instance: str, existing_policy: str):
        # NOTE: This method is not used because we override run() entirely 
        # to handle the pre-validation transformation that relies on '_source_stem'.
        # BasePopulator.run() converts dicts to Models *before* passing them here,
        # which would strip our '_source_stem' hack.
        pass

    def run(self):
        # Custom run to handle the Pydantic conversion WITH metadata preservation
        args = self.parse_args()
        instance, input_path = self.get_instance_and_input(args)
        json_files = self.collect_json_files(input_path)
        
        # Load Raw
        raw_items = self.load_data(json_files)
        if not raw_items:
            print("No events found.")
            sys.exit(0)

        print(f"Validating {len(raw_items)} events...")
        
        valid_rows = []
        
        for item in raw_items:
            source_stem = item.pop('_source_stem', 'unknown')
            try:
                # Validation
                model = EventSchema(**item)
                
                # Prepare DB Row
                source_id = f"{slugify(source_stem)}:{slugify(model.title)}"
                
                # Time
                start_astro = calculate_astro_year(model.start_time)
                start_json = model.start_time.model_dump(exclude_none=True)
                
                end_astro = None
                end_json = None
                if model.end_time:
                    end_astro = calculate_astro_year(model.end_time)
                    end_json = model.end_time.model_dump(exclude_none=True)

                # Location
                lat = model.location.latitude
                lng = model.location.longitude
                
                if lat is None or lng is None:
                    continue

                wkt = f"POINT({lng} {lat})"
                
                # Links/Images
                links_json = json.dumps([l.model_dump() for l in (model.sources or [])])
                image_urls = [img.url for img in (model.images or [])]
                
                row = {
                    "source_id": source_id,
                    "title": model.title,
                    "summary": model.summary,
                    "image_urls": image_urls,
                    "links": links_json,
                    "start_astro_year": start_astro,
                    "end_astro_year": end_astro,
                    "start_time_entry": json.dumps(start_json),
                    "end_time_entry": json.dumps(end_json) if end_json else None,
                    "location_wkt": wkt,
                    "place_name": model.location.location_name,
                    "granularity": model.location.precision,
                    "certainty": model.location.certainty,
                    "importance": model.importance,
                    "collections": model.collections or [],
                    "area_id": model.location.area_id
                }
                valid_rows.append(row)
                
            except Exception as e:
                logger.warning(f"Skipping invalid item: {e}")

        # DEDUPLICATION:
        # Postgres 'ON CONFLICT' fails if the BATCH itself contains duplicates for the same key.
        # We must verify uniqueness of source_id within the payload.
        unique_rows_map = {r['source_id']: r for r in valid_rows}
        valid_rows = list(unique_rows_map.values())
        if len(unique_rows_map) < len(raw_items):
            print(f"Removed {len(raw_items) - len(valid_rows)} duplicate events (by source_id).")

        # Summary
        print(f"\n--- Import Summary ---")
        print(f"Target Instance: {instance.upper()}")
        print(f"Valid Events: {len(valid_rows)}")
        
        if not valid_rows:
            sys.exit(0)

        # Confirm
        confirm = input("\nProceed with import? [y/N]: ").strip().lower()
        if confirm != 'y':
            print("Cancelled.")
            sys.exit(0)

        # Execute
        self.execute_import(valid_rows, instance)

    def execute_import(self, rows: List[dict], instance: str):
        conn = self.get_connection()
        cur = conn.cursor()
        table_name = self.get_table_name(instance)
        
        # Get batch size from args (re-parse since we are inside method)
        # Or better, pass it in. But for now re-parsing is safe enough or we default 200.
        args = self.parse_args()
        batch_size = args.batch
        
        total = len(rows)
        print(f"Inserting {total} events into {table_name} (Batch Size: {batch_size})...")
        
        try:
            for i in range(0, total, batch_size):
                batch = rows[i : i + batch_size]
                current_batch_num = (i // batch_size) + 1
                total_batches = (total + batch_size - 1) // batch_size
                
                print(f"  Processing batch {current_batch_num}/{total_batches} ({len(batch)} events)...")

                # Prepare for execute_values
                values = []
                for r in batch:
                    values.append((
                        r["source_id"], r["title"], r["summary"], r["image_urls"], r["links"],
                        r["start_astro_year"], r["end_astro_year"], r["start_time_entry"], r["end_time_entry"],
                        r["location_wkt"], r["place_name"], r["granularity"], r["certainty"], r["importance"], r["collections"], r["area_id"]
                    ))
                
                # ST_GeogFromText wrapper for location
                # 16 columns total. location_wkt is at index 9 (0-based)
                placeholders = ["%s"] * 16
                placeholders[9] = "ST_GeogFromText(%s)"
                template = "(" + ", ".join(placeholders) + ")"
                
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
                
                execute_values(cur, query, values, template=template)
                conn.commit()
            
            print(f"✅ Successfully inserted/updated {total} events.")
            
        except Exception as e:
            conn.rollback()
            print(f"❌ Database Error: {e}")
            sys.exit(1)
        finally:
            cur.close()
            conn.close()

if __name__ == "__main__":
    EventPopulator().run()
