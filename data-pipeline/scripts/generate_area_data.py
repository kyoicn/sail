"""
Script: generate_area_data.py
Description:
    Downloads vector boundaries from Natural Earth or custom sources, optimizes them for web display
    (filtering small islands, simplifying geometry), and outputs a Sail-compatible JSON file.

Detailed Parameter Guide:

    --dataset (default: 'country'):
        * 'country': Modern Sovereign States (Admin 0).
        * 'state': Provinces/States (Admin 1).
        * 'marine': Oceans, Seas, Bays.
        * 'region': Physical Continents/Regions.
        * 'custom': fetch from any GeoJSON I/O URL.

    --query_key (default: 'ISO_A3'):
        The property in the GeoJSON Feature to match against.
        * For 'country': 'ISO_A3' (e.g. JPN, USA), 'NAME' (e.g. Japan), 'ADM0_A3'.
        * For 'state': 'name' (e.g. California), 'postal' (e.g. CA), 'adm1_code'.
        * For 'marine': 'name' (e.g. Pacific Ocean).
        * DATA DICTIONARY: https://www.naturalearthdata.com/features/

    --query_value:
        The value to search for. Case-insensitive string matching.
        * e.g. 'JPN', 'California', 'Pacific Ocean', 'Asia'.

    --simplify (default: 0.05):
        The tolerance for the Ramer-Douglas-Peucker algorithm in degrees.
        * 0.05 deg (~5.5km): Very rough, good for global views.
        * 0.01 deg (~1.1km): Moderate detail.
        * 0.001 deg (~110m): High detail (larger file size).

    --filter_area (default: 0.05):
        The minimum area (in square degrees) required to keep a polygon (island/enclave).
        * 0.05 sq deg (~600 sq km): Removes small islands (e.g. Isle of Man, smaller Japanese islands).
        * 0.001: Keeps almost everything.
        * 1.0: Keeps only major landmasses.

    --custom_url:
        Required if --dataset=custom.
        * Historical Maps: Search 'historical boundaries geojson' (e.g. github.com/aequilibrae/historic_boundaries).
        * Micro Regions: Search 'stanford campus geojson' or use http://geojson.io to draw one.

Usage Examples:
    # 1. Country (Default)
    python generate_area_data.py --dataset country --query_value JPN --area_id modern_japan --display_name "Modern Japan"

    # 2. State (California) - Higher detail (--simplify 0.01)
    python generate_area_data.py --dataset state --query_key name --query_value California --area_id ca_state --display_name "California" --simplify 0.01

    # 3. Ocean
    python generate_area_data.py --dataset marine --query_key name --query_value "Pacific Ocean" --area_id pacific_ocean --display_name "Pacific Ocean"
    
    # 4. Custom (Historical)
    python generate_area_data.py --dataset custom --custom_url "https://raw.githubusercontent.com/..." --area_id babylon --display_name "Babylon"
"""

import json
import requests
import math
import argparse
import sys
from pathlib import Path

# --- Imports for Models ---
# Add parent directory to sys.path to allow importing from shared
# Assuming script is run from project root: python data-pipeline/scripts/generate_area_data.py
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))

from shared.models import AreaModel

# Natural Earth 10m Admin 0 Countries
URL = "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_0_countries.json"

# --- Core Logic ---

def fetch_and_optimize(country_code, area_id, display_name, min_area, tolerance, output_file=None):
    # ... (existing download logic omitted for brevity in diff, assume it's same) ...
    # Re-implementing just the necessary parts to show where AreaModel is used.
    # Ideally I should not overwrite the whole function if possible, but for imports I need top level.
    # Wait, replace_file_content replaces a block.
    # I will replace the top to add imports, and the bottom to use# --- Configuration ---
SOURCES = {
    "country": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_0_countries.json",
    "state": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_1_states_provinces.json",
    "marine": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/physical/ne_10m_geography_marine_polys.json",
    "region": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/physical/ne_10m_geography_regions_polys.json"
}

# --- Core Logic ---

def fetch_and_optimize(dataset_key, query_key, query_value, area_id, display_name, min_area, tolerance, output_file=None, custom_url=None):
    
    # 1. Determine URL
    if dataset_key == "custom":
        if not custom_url:
            print("❌ Error: --custom_url is required when dataset is 'custom'")
            return
        target_url = custom_url
    else:
        target_url = SOURCES.get(dataset_key)
        if not target_url:
             print(f"❌ Error: Unknown dataset '{dataset_key}'. Choices: {list(SOURCES.keys())}, custom")
             return

    print(f"1. Downloading Data from {dataset_key} ({target_url})....")
    try:
        resp = requests.get(target_url)
        resp.raise_for_status()
        source_data = resp.json()
    except Exception as e:
        print(f"❌ Failed to download: {e}")
        return

    print(f"2. Searching for {query_key} = '{query_value}'...")
    target_feature = None
    
    # Normalize query value for string comparison
    q_val_str = str(query_value).lower().strip()
    
    for feature in source_data.get('features', []):
        props = feature.get('properties', {})
        # Check against the query key
        # Handle flexible matching? For now, strict or loose string match.
        prop_val = props.get(query_key)
        
        if prop_val is None:
             pass 
        elif str(prop_val).lower().strip() == q_val_str:
            target_feature = feature
            break
        # Fallback: check standard codes if using default query_key
        elif query_key == "ISO_A3" and (props.get('ADM0_A3') == query_value or props.get('ISO_A3') == query_value):
             target_feature = feature
             break

    if not target_feature:
        print(f"❌ Feature not found. (searched {len(source_data.get('features', []))} items)")
        return

    raw_geometry = target_feature.get('geometry')
    raw_type = raw_geometry.get('type')
    raw_coords = raw_geometry.get('coordinates')
    
    # Normalize to List of Polygons -> List[List[Ring]]
    polygons = []
    if raw_type == 'Polygon':
        polygons = [raw_coords]
    elif raw_type == 'MultiPolygon':
        polygons = raw_coords
    
    print(f"   Found {len(polygons)} polygons. Starting optimization...")

    # 3. Optimize
    final_polygons = []
    total_verts_before = 0
    total_verts_after = 0
    total_area = 0
    kept_area = 0
    
    for poly in polygons:
        outer_ring = poly[0]
        area = calculate_ring_area(outer_ring)
        total_area += area
        total_verts_before += sum(len(r) for r in poly)

        if area < min_area:
            continue
        
        kept_area += area
        
        # Simplify Rings
        simplified_poly = []
        for ring in poly:
            simple_ring = ramer_douglas_peucker(ring, tolerance)
            
            # Ensure validity
            if len(simple_ring) < 3: continue
            if simple_ring[0] != simple_ring[-1]:
                simple_ring.append(simple_ring[0])
            
            simplified_poly.append(simple_ring)
            total_verts_after += len(simple_ring)
        
        if simplified_poly:
            final_polygons.append(simplified_poly)

    percentage_area = (kept_area / total_area * 100) if total_area > 0 else 0
    reduction = (1 - total_verts_after / total_verts_before * 100) if total_verts_before > 0 else 0

    print(f"3. Optimization Results:")
    print(f"   - Polygons: {len(polygons)} -> {len(final_polygons)} (Filter: >{min_area} sq deg)")
    print(f"   - Area Kept: {percentage_area:.1f}%")
    print(f"   - Vertices: {total_verts_before} -> {total_verts_after} (Reduction: {reduction:.1f}%)")

    # 4. Save
    # Determine output path
    if output_file:
        output_path = Path(output_file)
    else:
        output_path = Path(f"{area_id}.json")
    
    print(f"4. Saving to {output_path}...")

    # Load existing if available
    areas_data = {"areas": []}
    if output_path.exists():
        try:
            with open(output_path, 'r') as f:
                content = json.load(f)
                if isinstance(content, dict) and "areas" in content:
                    areas_data = content
        except:
            pass
    
    # Upsert Logic
    found = False
    
    # Validate with Pydantic Model
    try:
        area_model = AreaModel(
            area_id=area_id,
            display_name=display_name,
            description=f"Source: {dataset_key}. Optimized {total_verts_after} pts.",
            geometry=final_polygons
        )
        new_entry = area_model.model_dump()
    except Exception as e:
        print(f"❌ Validation Error: {e}")
        return

    for i, area in enumerate(areas_data['areas']):
        if area.get('area_id') == area_id:
            areas_data['areas'][i] = new_entry
            found = True
            break
    
    if not found:
        areas_data['areas'].append(new_entry)

    # Ensure directory exists
    if output_path.parent != Path('.'):
        output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(areas_data, f, indent=2)
    
    print(f"✅ Data saved successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fetch and Optimize Area Boundary",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
        # 1. Country
        python generate_area_data.py --dataset country --query_value JPN --area_id modern_japan --display_name "Modern Japan"

        # 2. State/Province (e.g. California)
        python generate_area_data.py --dataset state --query_key name --query_value California --area_id ca_state --display_name "California"

        # 3. Marine (e.g. Pacific Ocean)
        python generate_area_data.py --dataset marine --query_key name --query_value "Pacific Ocean" --area_id pacific_ocean --display_name "Pacific Ocean"
        """
    )
    
    parser.add_argument("--dataset", default="country", choices=["country", "state", "marine", "region", "custom"], 
                        help="Dataset source. See script header for details. (default: country)")
    parser.add_argument("--query_key", default="ISO_A3", help="Property key to search (e.g. ISO_A3, name). Data specific.")
    parser.add_argument("--query_value", help="Value to match (e.g. JPN, California).")
    parser.add_argument("--custom_url", help="URL for custom GeoJSON (required if dataset=custom)")
    
    parser.add_argument("--area_id", help="Target Area ID (slug) for database.")
    parser.add_argument("--display_name", help="Human-readable name.")
    parser.add_argument("--output", help="Output JSON file path.")
    parser.add_argument("--simplify", type=float, default=0.05, help="RDP Tolerance in degrees. (default: 0.05, lower=more detail)")
    parser.add_argument("--filter_area", type=float, default=0.05, help="Min Area Threshold in sq degrees. (default: 0.05, lower=keep small islands)")
    
    args = parser.parse_args()

    # Interactive Mode Fallbacks
    d_set = args.dataset
    if not args.query_value:
         args.query_value = input(f"Enter Search Value (for {args.query_key}): ").strip()
    
    if not args.area_id:
         args.area_id = input("Enter Target Area ID (slug): ").strip()
    
    if not args.display_name:
         args.display_name = input("Enter Display Name: ").strip()

    fetch_and_optimize(
        d_set, 
        args.query_key, 
        args.query_value, 
        args.area_id, 
        args.display_name, 
        args.filter_area, 
        args.simplify, 
        args.output,
        args.custom_url
    )
