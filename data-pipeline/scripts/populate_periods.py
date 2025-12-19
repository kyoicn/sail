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

from shared.models import HistoricalPeriodModel

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not set")
    sys.exit(1)

def get_connection():
    return psycopg2.connect(DATABASE_URL)

class PeriodsData(BaseModel):
    periods: List[HistoricalPeriodModel]

def populate_periods(data: PeriodsData, instance: str):
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
        for period in data.periods:
             # Check existence for warning
            cur.execute(f"SELECT id FROM {table_periods} WHERE period_id = %s", (period.period_id,))
            exists = cur.fetchone()
            if exists:
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
            
            for area_slug in period.area_ids:
                cur.execute(f"SELECT id FROM {table_areas} WHERE area_id = %s", (area_slug,))
                res = cur.fetchone()
                if res:
                    area_db_id = res[0]
                    cur.execute(f"""
                        INSERT INTO {table_period_areas} (period_id, area_id)
                        VALUES (%s, %s)
                    """, (period_db_id, area_db_id))
                else:
                    print(f"  [Error] Area slug '{area_slug}' not found for period '{period.period_id}'")

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
    parser.add_argument("--file", help="Path to JSON file containing periods")
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

    file_path = args.file
    if not file_path:
        file_path = input("Path to JSON file containing periods: ").strip()

    input_path = Path(file_path)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    with open(input_path, 'r') as f:
        raw_data = json.load(f)
    
    try:
        # Expecting {"periods": [...]}
        data = PeriodsData(**raw_data)
        populate_periods(data, instance)
    except Exception as e:
        print(f"Validation Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
