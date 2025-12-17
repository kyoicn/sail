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

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    logger.error("DATABASE_URL not found in environment variables.")
    sys.exit(1)

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def get_connection():
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        logger.error(f"Failed to connect to Database: {e}")
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Bulk Import Events to Database (via psycopg2)")
    parser.add_argument("--input_dir", help="Directory containing ExtractionRecord JSON files", required=True)
    parser.add_argument("--table_name", help="Target table name", default=None)
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
            pass 

    files = list(input_dir.glob("*.json"))
    logger.info(f"Found {len(files)} JSON files in {input_dir}")

    all_payloads_data = [] # List of tuples/dicts ready for SQL
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
                    
                    # Format WKT
                    location_wkt = f"POINT({lng} {lat})" 
                    
                    # 4. Links & Images
                    links = [s.model_dump() for s in event.sources] if event.sources else []
                    image_urls = [img.url for img in event.images] if event.images else []
                    
                    # Store as dictionary for easy inspection before insert
                    row_data = {
                        "source_id": source_id,
                        "title": event.title,
                        "summary": event.summary,
                        "image_urls": image_urls,
                        "links": json.dumps(links), # JSONB needs string or dict, psycopg2 handles dicts often, but dumps is safer for debugging
                        "start_astro_year": start_astro,
                        "end_astro_year": end_astro,
                        "start_time_entry": json.dumps(start_json),
                        "end_time_entry": json.dumps(end_json) if end_json else None,
                        "location_wkt": location_wkt, 
                        "place_name": place_name,
                        "granularity": granularity,
                        "certainty": certainty,
                        "importance": event.importance,
                        "collections": event.collections,
                        "area_id": event.location.area_id
                    }
                    all_payloads_data.append(row_data)

                except Exception as e:
                    logger.error(f"Error preparing event '{event.title}': {e}")
                    failed_imports += 1
            
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON in {file_path.name}")
        except Exception as e:
            logger.error(f"Unexpected error processing {file_path.name}: {e}")

    # Confirmation Step
    if all_payloads_data:
        print(f"\n--- Ready to Import {len(all_payloads_data)} Events ---")
        for i, p in enumerate(all_payloads_data):
            # Simple check for missing critical data
            missing_loc = ""
            if not p['place_name']:
                 missing_loc = " [NO LOC NAME]"

            print(f"{i+1}. {p['title']} ({p['source_id']}){missing_loc}")
            
        print(f"\nTarget Table: {table_name}")
        confirm = input("Proceed with import? [y/N]: ").strip().lower()
        if confirm != 'y':
            logger.info("Import cancelled by user.")
            sys.exit(0)

    # Bulk Insert
    if all_payloads_data:
        conn = get_connection()
        cur = conn.cursor()
        
        logger.info(f"Starting bulk import of {len(all_payloads_data)} events...")
        
        # We process item by item or batch, but using Executemany or simple loop is fine unless scale is massive.
        # For better error handling/reporting matching the previous script, a loop with individual upserts (or small batches) is safer.
        
        try:
            inserted_count = 0
            for p in all_payloads_data:
                try:
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
                        RETURNING id;
                    """
                    # Note: collections might need to be cast if it's an array literal or jsonb depending on schema.
                    # Assuming collections is text[]:
                    # Psycopg2 adapts lists to arrays automatically.
                    
                    # Adjust collections to be just list if it's None
                    if p['collections'] is None:
                        p['collections'] = []

                    cur.execute(query, p)
                    inserted_count += 1
                except Exception as e:
                    logger.error(f"Failed to insert {p['source_id']}: {e}")
                    failed_imports += 1
            
            conn.commit()
            successful_imports = inserted_count
            logger.info(f"Successfully committed {successful_imports} events.")

        except Exception as e:
            conn.rollback()
            logger.error(f"Transaction failed: {e}")
        finally:
            cur.close()
            conn.close()

    else:
        logger.info("No valid events found to import.")

    logger.info("--- Import Summary ---")
    logger.info(f"Total Events Found: {total_events}")
    logger.info(f"Successfully Imported: {successful_imports}")
    logger.info(f"Failed: {failed_imports}")

if __name__ == "__main__":
    main()
