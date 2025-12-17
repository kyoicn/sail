import os
import sys
import psycopg2
import argparse
from pathlib import Path
from dotenv import load_dotenv
import json
from typing import List
from pydantic import BaseModel

"""
Script to populate Area data into the database.

Example Usage:
    python data-pipeline/scripts/populate_areas.py --instance dev --file data-pipeline/areas.json
"""
# Setup Environment
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
sys.path.append(str(data_pipeline_root))
load_dotenv(data_pipeline_root / '.env')

from shared.models import AreaModel, MultiPolygon

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not set")
    sys.exit(1)

def get_connection():
    return psycopg2.connect(DATABASE_URL)

class AreasData(BaseModel):
    areas: List[AreaModel]

def populate_areas(data: AreasData, instance: str):
    print(f"Connecting to DB (Instance: {instance})...")
    conn = get_connection()
    cur = conn.cursor()

    # Determine table names
    suffix = f"_{instance}" if instance == 'dev' else ""
    table_areas = f"areas{suffix}"

    print(f"Targeting table: {table_areas}")

    try:
        print(f"Processing {len(data.areas)} Areas...")
        for area in data.areas:
            # Check existence for warning
            cur.execute(f"SELECT id FROM {table_areas} WHERE area_id = %s", (area.area_id,))
            exists = cur.fetchone()
            if exists:
                print(f"  [WARN] Overwriting existing area: {area.area_id}")

            # Construct MultiPolygon WKT
            # coordinates is List[List[List[List[float]]]] -> Polygons -> Rings -> Points -> [x, y]
            
            polygons_wkt = []
            for polygon in area.geometry:
                rings_wkt = []
                for ring in polygon:
                    points_str = ", ".join([f"{p[0]} {p[1]}" for p in ring])
                    rings_wkt.append(f"({points_str})")
                
                # A polygon is defined by (outer, inner, ...)
                polygons_wkt.append(f"({', '.join(rings_wkt)})")
            
            wkt = f"MULTIPOLYGON({', '.join(polygons_wkt)})"
            
            cur.execute(f"""
                INSERT INTO {table_areas} (area_id, display_name, description, geometry)
                VALUES (%s, %s, %s, ST_GeogFromText(%s))
                ON CONFLICT (area_id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    description = EXCLUDED.description,
                    geometry = EXCLUDED.geometry
                RETURNING id;
            """, (area.area_id, area.display_name, area.description, wkt))

        conn.commit()
        print("✅ Areas population complete.")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        raise e
    finally:
        cur.close()
        conn.close()

def main():
    parser = argparse.ArgumentParser(description="Populate Areas Data")
    parser.add_argument("--instance", choices=['prod', 'dev'], help="Target instance (prod or dev)")
    parser.add_argument("--file", help="Path to JSON file containing areas")
    args = parser.parse_args()

    # Interactive Prompts
    instance = args.instance
    if not instance:
        while True:
            val = input("Target instance (prod/dev): ").strip().lower()
            if val in ['prod', 'dev']:
                instance = val
                break
            print("Invalid instance. Please choose 'prod' or 'dev'.")

    file_path = args.file
    if not file_path:
        file_path = input("Path to JSON file containing areas: ").strip()

    input_path = Path(file_path)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    with open(input_path, 'r') as f:
        raw_data = json.load(f)
    
    try:
        # Support reading either {"areas": [...]} or just the "areas" part of a larger file
        # But Pydantic makes validation easy if we stick to a schema. 
        # Let's assume the file HAS an 'areas' key.
        data = AreasData(**raw_data)
        populate_areas(data, instance)
    except Exception as e:
        print(f"Validation Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
