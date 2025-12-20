import os
import sys
import psycopg2
import argparse
from pathlib import Path
from dotenv import load_dotenv
import json
from typing import List
from pydantic import BaseModel

# Setup Environment
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
sys.path.append(str(data_pipeline_root))
load_dotenv(data_pipeline_root / '.env')

"""
Script: populate_periods.py
Description:
    Parses a JSON file containing historical period data (compatible with HistoricalPeriodModel schema)
    and populates them into the specified database environment's 'historical_periods' table.
    It also manages the Many-to-Many relationships in 'period_areas' (primary/associated roles).
    It supports upsert operations (insert or update on conflict).

Parameters:
    --instance {prod,dev,staging}:
        The target database instance.
        - 'prod': Targets 'historical_periods', 'period_areas'.
        - 'dev': Targets 'historical_periods_dev', 'period_areas_dev'.
        - 'staging': Targets 'historical_periods_staging', 'period_areas_staging'.

    --input PATH:
        Path to a single JSON file OR a directory containing multiple JSON files.
        - If a file: Populates periods from that specific file.
          Example JSON structure: 
          { 
              "periods": [ 
                  { 
                      "period_id": "qing_dynasty", 
                      "primary_area_ids": ["qing_1820"], 
                      ... 
                  } 
              ] 
          }
        - If a directory: Populates from all *.json files in that directory.
    
    --existing {overwrite,skip}:
        Behavior when a period_id already exists in the database.
        - 'skip': (Default) Skips the existing period and its relationships.
        - 'overwrite': Updates the period and its relationships (Primary/Associated areas).

Usage Examples:
    # 1. Populate 'dev' environment from a file
    python data-pipeline/scripts/populate_periods.py --instance dev --input data-pipeline/data/periods_europe.json

    # 2. Populate 'prod' from a folder
    python data-pipeline/scripts/populate_periods.py --instance prod --input data-pipeline/data/periods_batch/

    # 3. Interactive mode
    python data-pipeline/scripts/populate_periods.py
"""

from shared.models import HistoricalPeriodModel

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not set")
    sys.exit(1)

def get_connection():
    return psycopg2.connect(DATABASE_URL)

class PeriodsData(BaseModel):
    periods: List[HistoricalPeriodModel]

def populate_periods(data: PeriodsData, instance: str, existing_policy: str = 'skip'):
    print(f"Connecting to DB (Instance: {instance})...")
    conn = get_connection()
    cur = conn.cursor()

    # Determine table names
    if instance == 'dev':
        suffix = "_dev"
    elif instance == 'staging':
        suffix = "_staging"
    else:
        suffix = ""

    table_areas = f"areas{suffix}"
    table_periods = f"historical_periods{suffix}"
    table_period_areas = f"period_areas{suffix}"

    print(f"Targeting tables: {table_periods}, {table_period_areas} (linking to {table_areas})")

    try:
        print(f"Processing {len(data.periods)} Periods...")
        total_periods = len(data.periods)
        for index, period in enumerate(data.periods, 1):
            print(f"[{index}/{total_periods}] Processing period: {period.period_id}")
             # Check existence for warning
            cur.execute(f"SELECT id FROM {table_periods} WHERE period_id = %s", (period.period_id,))
            exists = cur.fetchone()
            if exists:
                if existing_policy == 'skip':
                    print(f"  [INFO] Skipping existing period: {period.period_id}")
                    continue
                print(f"  [WARN] Overwriting existing period: {period.period_id}")

            cur.execute(f"""
                INSERT INTO {table_periods} (period_id, display_name, description, start_astro_year, end_astro_year, importance)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (period_id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    description = EXCLUDED.description,
                    start_astro_year = EXCLUDED.start_astro_year,
                    end_astro_year = EXCLUDED.end_astro_year,
                    importance = EXCLUDED.importance
                RETURNING id;
            """, (period.period_id, period.display_name, period.description, period.start_astro_year, period.end_astro_year, period.importance))
            
            period_db_id = cur.fetchone()[0]

            # Handle Junctions
            cur.execute(f"DELETE FROM {table_period_areas} WHERE period_id = %s", (period_db_id,))
            
            # Insert Primary Areas
            for area_slug in period.primary_area_ids:
                cur.execute(f"SELECT id FROM {table_areas} WHERE area_id = %s", (area_slug,))
                res = cur.fetchone()
                if res:
                    area_db_id = res[0]
                    cur.execute(f"""
                        INSERT INTO {table_period_areas} (period_id, area_id, role)
                        VALUES (%s, %s, 'primary')
                        ON CONFLICT (period_id, area_id) DO UPDATE SET role = 'primary'
                    """, (period_db_id, area_db_id))
                else:
                    print(f"  [Error] Primary Area '{area_slug}' not found for period '{period.period_id}'")

            # Insert Associated Areas
            for area_slug in period.associated_area_ids:
                if area_slug in period.primary_area_ids:
                    continue # specific area is already primary

                cur.execute(f"SELECT id FROM {table_areas} WHERE area_id = %s", (area_slug,))
                res = cur.fetchone()
                if res:
                    area_db_id = res[0]
                    cur.execute(f"""
                        INSERT INTO {table_period_areas} (period_id, area_id, role)
                        VALUES (%s, %s, 'associated')
                        ON CONFLICT (period_id, area_id) DO UPDATE SET role = 'associated'
                    """, (period_db_id, area_db_id))
                else:
                    print(f"  [Error] Associated Area '{area_slug}' not found for period '{period.period_id}'")

        conn.commit()
        print("✅ Periods population complete.")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        raise e
    finally:
        cur.close()
        conn.close()

def main():
    parser = argparse.ArgumentParser(description="Populate Historical Periods Data")
    parser.add_argument("--instance", choices=['prod', 'dev', 'staging'], help="Target instance (prod, dev, staging)")
    parser.add_argument("--input", help="Path to JSON file or folder containing periods")
    parser.add_argument("--existing", choices=['overwrite', 'skip'], default='skip', help="Behavior for existing periods (overwrite/skip). Default: skip")
    args = parser.parse_args()

    # Interactive Prompts
    instance = args.instance
    if not instance:
        while True:
            val = input("Target instance (prod/dev/staging): ").strip().lower()
            if val in ['prod', 'dev', 'staging']:
                instance = val
                break
            print("Invalid instance. Please choose 'prod', 'dev' or 'staging'.")

    # Collect input files
    json_files = []
    input_path_str = args.input

    if not input_path_str:
        input_path_str = input("Path to JSON file or folder: ").strip()

    input_path = Path(input_path_str)
    if not input_path.exists():
        print(f"Error: Path not found: {input_path}")
        sys.exit(1)

    if input_path.is_dir():
        json_files = sorted(list(input_path.glob("*.json")))
        print(f"Found {len(json_files)} JSON files in folder.")
    elif input_path.is_file():
         json_files = [input_path]
    else:
         print(f"Error: Path is neither file nor directory: {input_path}")
         sys.exit(1)

    # Load and Aggregated Data
    all_raw_periods = []
    
    for jp in json_files:
        try:
            with open(jp, 'r') as f:
                raw_data = json.load(f)
            
            # Extract 'periods' list
            if isinstance(raw_data, dict) and "periods" in raw_data:
                all_raw_periods.extend(raw_data["periods"])
            else:
                print(f"⚠️  Skipping {jp.name}: No 'periods' key found.")
                
        except Exception as e:
            print(f"❌ Failed to load {jp.name}: {e}")

    if not all_raw_periods:
        print("No periods found to populate.")
        sys.exit(0)

    try:
        # Validate Aggregated Data
        print(f"Validating {len(all_raw_periods)} periods...")
        data = PeriodsData(periods=all_raw_periods)
        populate_periods(data, instance, existing_policy=args.existing)
    except Exception as e:
        print(f"Validation Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
