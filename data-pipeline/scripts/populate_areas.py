import os
import sys
import psycopg2
import argparse
from pathlib import Path
from dotenv import load_dotenv
import json
from typing import List
from pydantic import BaseModel
from shapely.geometry import shape, MultiPolygon, Polygon, box
from shapely.ops import unary_union
from shapely import wkt

"""
Script: populate_areas.py
Description:
    Parses one or more JSON files containing area data (compatible with AreaModel schema)
    and populates them into the specified database environment's 'areas' table.
    It supports upsert operations (insert or update on conflict).

Parameters:
    --instance {prod,dev,staging}:
        The target database instance.
        - 'prod': Targets the 'areas' table.
        - 'dev': Targets the 'areas_dev' table.
        - 'staging': Targets the 'areas_staging' table (if configured).

    --input PATH:
        Path to a single JSON file OR a directory containing multiple JSON files.
        - If a file: Populates areas from that specific file.
        - If a directory: Populates from all *.json files in that directory.

    --existing {skip,overwrite}:
        Action to take when an area_id already exists in the database.
        - 'skip' (default): Ignores the new data and keeps the existing record.
        - 'overwrite': Updates the existing record with the new data.

Usage Examples:
    # 1. Populate 'dev', skipping existing records (default)
    python data-pipeline/scripts/populate_areas.py --instance dev --input data-pipeline/data/generated/qing_1820.json

    # 2. Populate 'prod', forcing overwrite of existing records
    python data-pipeline/scripts/populate_areas.py --instance prod --input data-pipeline/data/batch_output/ --existing overwrite
"""
# Setup Environment
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
sys.path.append(str(data_pipeline_root))
load_dotenv(data_pipeline_root / '.env')

from shared.models import AreaModel

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not set")
    sys.exit(1)

def get_connection():
    return psycopg2.connect(DATABASE_URL)

class AreasData(BaseModel):
    areas: List[AreaModel]

def fix_dateline_geometry(geometry_data: List[List[List[List[float]]]]) -> str:
    """
    Fixes geometry that crosses the dateline (-180/180) by splitting it.
    Returns WKT string.
    """
    # 1. Convert input (GeoJSON-like List structure) to Shapely Geometry
    # AreaModel.geometry is List[Polygon], where Polygon is List[Ring], Ring is List[Point]
    polys = []
    for poly_coords in geometry_data:
        # poly_coords[0] is exterior, [1:] are interiors
        shell = poly_coords[0]
        holes = poly_coords[1:] if len(poly_coords) > 1 else []
        polys.append(Polygon(shell, holes))
    
    mp = MultiPolygon(polys)

    # 2. Check bounds. If strictly within -180/180 and not wrapping, returned as is?
    # But checking for wrapping is hard on raw coords. 
    # Strategy: Shift to 0-360, then split at 180.
    
    def shift_coords(x, y, z=None):
        # Shift longitudes to 0-360 range
        x = x % 360
        return (x, y)

    # Transform geometry to 0-360 space
    # We use buffer(0) to fix potential self-intersections after transform if needed, 
    # but strictly transform is safer first.
    from shapely.ops import transform
    shifted_mp = transform(shift_coords, mp)

    # 3. Create Splitter Boxes
    # Box A: 0 to 180 (Eastern Hemisphere + Prime Meridian)
    # Box B: 180 to 360 (Western Hemisphere, shifted)
    box_a = box(0, -90, 180, 90)
    box_b = box(180, -90, 360, 90)

    # 4. Intersect
    part_a = shifted_mp.intersection(box_a)
    part_b = shifted_mp.intersection(box_b)

    # 5. Shift Part B back to -180..0 (subtract 360)
    def shift_back(x, y, z=None):
        return (x - 360, y)
    
    parts = []
    if not part_a.is_empty:
        parts.append(part_a)
    
    if not part_b.is_empty:
        part_b_shifted = transform(shift_back, part_b)
        parts.append(part_b_shifted)

    # 6. Union and Return WKT
    if not parts:
        return "MULTIPOLYGON EMPTY"
    
    final_geom = unary_union(parts)
    
    # Ensure MultiPolygon
    if final_geom.geom_type == 'Polygon':
        final_geom = MultiPolygon([final_geom])
    elif final_geom.geom_type != 'MultiPolygon':
        # Fallback for GeometryCollection etc?
        # Usually unary_union of polygons returns Polygon or MultiPolygon.
        pass

    return final_geom.wkt

def populate_areas(data: AreasData, instance: str, existing_policy: str = 'skip'):
    print(f"Connecting to DB (Instance: {instance}, Existing Policy: {existing_policy})...")
    conn = get_connection()
    cur = conn.cursor()

    # Determine table names
    suffix = f"_{instance}" if instance == 'dev' else ""
    table_areas = f"areas{suffix}"

    print(f"Targeting table: {table_areas}")

    try:
        print(f"Processing {len(data.areas)} Areas...")
        skipped_count = 0
        updated_count = 0
        inserted_count = 0
        
        for area in data.areas:
            # Check existence
            cur.execute(f"SELECT id FROM {table_areas} WHERE area_id = %s", (area.area_id,))
            exists = cur.fetchone()
            
            should_update = False
            if exists:
                if existing_policy == 'skip':
                    print(f"  [SKIP] Area exists: {area.area_id}")
                    skipped_count += 1
                    continue
                else:
                    print(f"  [OVERWRITE] Updating area: {area.area_id}")
                    should_update = True
                    updated_count += 1
            else:
                 inserted_count += 1

            # Fix Geometry (Dateline splitting)
            try:
                wkt_str = fix_dateline_geometry(area.geometry)
            except Exception as e:
                print(f"  [ERROR] Failed to process geometry for {area.area_id}: {e}")
                continue
            
            cur.execute(f"""
                INSERT INTO {table_areas} (area_id, display_name, description, geometry)
                VALUES (%s, %s, %s, ST_GeogFromText(%s))
                ON CONFLICT (area_id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    description = EXCLUDED.description,
                    geometry = EXCLUDED.geometry
                RETURNING id;
            """, (area.area_id, area.display_name, area.description, wkt_str))

        conn.commit()
        print(f"✅ Areas population complete. (Inserted: {inserted_count}, Updated: {updated_count}, Skipped: {skipped_count})")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error: {e}")
        raise e
    finally:
        cur.close()
        conn.close()

def main():
    parser = argparse.ArgumentParser(description="Populate Areas Data")
    parser.add_argument("--instance", choices=['prod', 'dev', 'staging'], help="Target instance (prod, dev, staging)")
    parser.add_argument("--input", help="Path to JSON file or folder containing JSON files")
    parser.add_argument("--existing", choices=['skip', 'overwrite'], default='skip', help="Policy for existing records (default: skip)")
    
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
        print(f"Found {len(json_files)} JSON files in folder: {input_path}")
    elif input_path.is_file():
         json_files = [input_path]
    else:
         print(f"Error: Path is neither file nor directory: {input_path}")
         sys.exit(1)

    # Load and Aggregated Data
    all_raw_areas = []
    
    for jp in json_files:
        try:
            with open(jp, 'r') as f:
                raw_data = json.load(f)
            
            # Extract 'areas' list
            if isinstance(raw_data, dict) and "areas" in raw_data:
                all_raw_areas.extend(raw_data["areas"])
            else:
                print(f"⚠️  Skipping {jp.name}: No 'areas' key found.")
                
        except Exception as e:
            print(f"❌ Failed to load {jp.name}: {e}")

    if not all_raw_areas:
        print("No areas found to populate.")
        sys.exit(0)

    try:
        # Validate Aggregated Data
        print(f"Validating {len(all_raw_areas)} areas...")
        data = AreasData(areas=all_raw_areas)
        populate_areas(data, instance, existing_policy=args.existing)
    except Exception as e:
        print(f"Validation Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
