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
        * For 'country': 'ISO_A3' (e.g. JPN, USA), 'NAME'.
        * For 'state': 'name' (e.g. California).
        * For 'marine': 'name'.

    --query_value:
        The value to search for. Case-insensitive.

    --simplify (default: 0.05):
        RDP Tolerance in degrees. Higher = rougher.

    --filter_area (default: 0.05):
        Min area (sq degrees) to keep.

    --buffer (float, default 0.0):
        Expand (positive) or Shrink (negative) by degrees.
        Uses Shapely for robust boolean union (merges overlaps).
        * 0.5 (~55km) works gracefully by merging islands.

    --round (int, default 0):
        Resolution of rounded corners (if buffer != 0).
        Higher = more vertices in curves.

Usage Examples:
    python generate_area_data.py --query_value JPN --buffer 0.5 --filter_area 0.5
"""

import json
import requests
import math
import argparse
import sys
from pathlib import Path
from shapely.geometry import shape, mapping, MultiPolygon, Polygon
from shapely.ops import unary_union

# --- Imports for Models ---
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))

from shared.models import AreaModel

# Natural Earth 10m Admin 0 Countries
SOURCES = {
    "country": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_0_countries.json",
    "state": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_1_states_provinces.json",
    "marine": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/physical/ne_10m_geography_marine_polys.json",
    "region": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/physical/ne_10m_geography_regions_polys.json"
}

def fetch_and_optimize(dataset_key, query_key, query_value, area_id, display_name, min_area, tolerance, 
                       output_file=None, custom_url=None, buffer_deg=0.0, round_iter=0, description=None):
    
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
    q_val_str = str(query_value).lower().strip()
    
    for feature in source_data.get('features', []):
        props = feature.get('properties', {})
        prop_val = props.get(query_key)
        
        if prop_val is None:
             pass 
        elif str(prop_val).lower().strip() == q_val_str:
            target_feature = feature
            break
        elif query_key == "ISO_A3" and (props.get('ADM0_A3') == query_value or props.get('ISO_A3') == query_value):
             target_feature = feature
             break

    if not target_feature:
        print(f"❌ Feature not found.")
        return

    # 3. Optimize with Shapely
    try:
        raw_geom = shape(target_feature['geometry'])
        
        # Valid / Cleaning
        if not raw_geom.is_valid:
            raw_geom = raw_geom.buffer(0)
            
        # Simplify (RDP)
        optimized = raw_geom.simplify(tolerance, preserve_topology=True)
        
        # Buffer (Soften/Expand/Merge)
        if buffer_deg != 0:
            # Join style 1 (round), 2 (mitre). 
            # Resolution determines smoothness of curves.
            # Using simple heuristic: resolution=16 if smoothing desired.
            resolution = 16 if round_iter > 0 else 4
            join = 1 if round_iter > 0 else 2
            
            optimized = optimized.buffer(buffer_deg, resolution=resolution, join_style=join)
            
            # Re-simplify slightly to remove redundancy in curves if needed?
            # optimized = optimized.simplify(tolerance/2)

        # Filter by Area (Remove small islands)
        parts = []
        if isinstance(optimized, MultiPolygon):
            parts = list(optimized.geoms)
        elif isinstance(optimized, Polygon):
            parts = [optimized]
        elif optimized.is_empty:
             parts = []
             
        filtered_parts = [p for p in parts if p.area >= min_area]
        
        if not filtered_parts:
            print(f"❌ Warning: Resulting geometry is empty (min_area filter too high?).")
            return

        final_shape = unary_union(filtered_parts) # Should already be unioned by buffer, but ensures validity
        if isinstance(final_shape, Polygon):
            final_shape = MultiPolygon([final_shape])

        # Stats
        total_verts_after = 0
        if not final_shape.is_empty:
             for p in final_shape.geoms:
                  total_verts_after += len(p.exterior.coords)
                  for interior in p.interiors:
                       total_verts_after += len(interior.coords)
        
        # Convert to Coordinates List for AreaModel
        # mapping() returns {'type': 'MultiPolygon', 'coordinates': (((x,y)...),)}
        # We need the 'coordinates' list.
        final_polygons = mapping(final_shape)['coordinates']
        
        print(f"3. Optimization Results:")
        print(f"   - Polygons: {len(filtered_parts)}")
        print(f"   - Vertices: {total_verts_after}")

    except Exception as e:
        print(f"❌ Geometry Error: {e}")
        return

    # 4. Save
    if output_file:
        output_path = Path(output_file)
    else:
        output_path = Path(f"{area_id}.json")
    
    print(f"4. Saving to {output_path}...")

    areas_data = {"areas": []}
    if output_path.exists():
        try:
            with open(output_path, 'r') as f:
                content = json.load(f)
                if isinstance(content, dict) and "areas" in content:
                    areas_data = content
        except:
            pass
    
    found = False
    
    final_description = description if description else f"Source: {dataset_key}. Optimized {total_verts_after} pts."
    
    try:
        area_model = AreaModel(
            area_id=area_id,
            display_name=display_name,
            description=final_description,
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

    if output_path.parent != Path('.'):
        output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(areas_data, f, indent=2)
    
    print(f"✅ Data saved successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch and Optimize Area Bounds (Shapely Powered)")
    parser.add_argument("--dataset", default="country", choices=["country", "state", "marine", "region", "custom"])
    parser.add_argument("--query_key", default="ISO_A3")
    parser.add_argument("--query_value")
    parser.add_argument("--custom_url")
    parser.add_argument("--area_id")
    parser.add_argument("--display_name")
    parser.add_argument("--description", help="Custom description for the area.")
    parser.add_argument("--output")
    parser.add_argument("--simplify", type=float, default=0.05)
    parser.add_argument("--filter_area", type=float, default=0.05)
    parser.add_argument("--buffer", type=float, default=0.0)
    parser.add_argument("--round", type=int, default=0)

    args = parser.parse_args()

    # Interactive Mode Fallbacks
    if not args.query_value:
         args.query_value = input(f"Enter Search Value (for {args.query_key}): ").strip()
    if not args.area_id:
         args.area_id = input("Enter Target Area ID (slug): ").strip()
    if not args.display_name:
         args.display_name = input("Enter Display Name: ").strip()

    fetch_and_optimize(
        args.dataset, 
        args.query_key, 
        args.query_value, 
        args.area_id, 
        args.display_name, 
        args.filter_area, 
        args.simplify, 
        args.output,
        args.custom_url,
        args.buffer,
        args.round,
        args.description
    )
