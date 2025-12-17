"""
Script: generate_area_data.py
Description:
    Downloads administrative boundaries from Natural Earth (10m resolution), minimizes detail
    via area filtering and RDP simplification, and generates a JSON file compatible with the
    Sail data pipeline.

Parameters:
    --country_code (str): ISO 3166-1 alpha-3 country code (e.g., 'JPN', 'USA', 'CHN').
    --area_id (str): Unique identifier for the area (slug), used as the key in the database (e.g., 'modern_japan').
    --display_name (str): Human-readable name for the area (e.g., 'Modern Japan').
    --output (str): Optional path to output JSON file. Defaults to '[area_id].json' in the current directory.
    --simplify (float): Tolerance for Ramer-Douglas-Peucker simplification (degrees). 
                        Default 0.05 (~5km) is good for illustrative maps. 
                        Lower values = more detail, higher = fewer points.
    --filter_area (float): Minimum area threshold (approx sq degrees) to retain an island/polygon.
                           Default 0.05 filters out small islands.

Data Source:
    Natural Earth 10m Admin 0 Countries:
    https://github.com/martynafford/natural-earth-geojson

Usage Examples:
    # 1. Generate Modern Japan data (default output: modern_japan.json)
    python data-pipeline/scripts/generate_area_data.py --country_code JPN --area_id modern_japan --display_name "Modern Japan"

    # 2. Generate China with custom output file
    python data-pipeline/scripts/generate_area_data.py --country_code CHN --area_id china_proper --display_name "China" --output data-pipeline/china.json

    # 3. Interactive Mode (Just run without args)
    python data-pipeline/scripts/generate_area_data.py
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
    # I will replace the top to add imports, and the bottom to use validation.
    pass

# ... (skipping to the end of the file for the actual replacement of the saving logic) ...


# --- Geometry Utils ---

def calculate_ring_area(coords):
    area = 0.0
    if len(coords) < 3: return 0.0
    for i in range(len(coords)):
        j = (i + 1) % len(coords)
        area += coords[i][0] * coords[j][1]
        area -= coords[j][0] * coords[i][1]
    return abs(area) / 2.0

def perpendicular_distance(point, start, end):
    if start == end:
        return math.hypot(point[0] - start[0], point[1] - start[1])
    
    numerator = abs((end[1] - start[1]) * point[0] - (end[0] - start[0]) * point[1] + end[0] * start[1] - end[1] * start[0])
    denominator = math.hypot(end[1] - start[1], end[0] - start[0])
    return numerator / denominator

def ramer_douglas_peucker(points, epsilon):
    dmax = 0.0
    index = 0
    end = len(points) - 1
    for i in range(1, end):
        d = perpendicular_distance(points[i], points[0], points[end])
        if d > dmax:
            index = i
            dmax = d
    
    if dmax > epsilon:
        rec_results1 = ramer_douglas_peucker(points[:index+1], epsilon)
        rec_results2 = ramer_douglas_peucker(points[index:], epsilon)
        return rec_results1[:-1] + rec_results2
    else:
        return [points[0], points[end]]

# --- Core Logic ---

def fetch_and_optimize(country_code, area_id, display_name, min_area, tolerance, output_file=None):
    print(f"1. Downloading Natural Earth 10m Data...")
    try:
        resp = requests.get(URL)
        resp.raise_for_status()
        world_data = resp.json()
    except Exception as e:
        print(f"❌ Failed to download: {e}")
        return

    print(f"2. Searching for Country Code '{country_code}'...")
    target_feature = None
    for feature in world_data.get('features', []):
        props = feature.get('properties', {})
        if props.get('ADM0_A3') == country_code or props.get('ISO_A3') == country_code:
            target_feature = feature
            break
    
    if not target_feature:
        print(f"❌ Country '{country_code}' not found.")
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

    # Load existing if available to preserve other areas (only if file exists)
    areas_data = {"areas": []}
    if output_path.exists():
        try:
            with open(output_path, 'r') as f:
                content = json.load(f)
                # Check structure
                if isinstance(content, dict) and "areas" in content:
                    areas_data = content
                elif isinstance(content, dict) and "area_id" in content:
                    # Single object file, wrap it if we are replacing it, or just keep format?
                    # Strategy: Always normalize to {"areas": []} for populate_areas.py compatibility.
                    # But if user expects single object file...
                    # populate_areas.py expects {areas: [...]}.
                    # If existing file is different, we might overwrite or error.
                    # Safety: If existing file has 'areas', we append/update. Else we overwrite with new structure.
                    pass
        except:
            pass
    
    # Upsert Logic
    found = False
    
    # Validate with Pydantic Model
    try:
        area_model = AreaModel(
            area_id=area_id,
            display_name=display_name,
            description=f"Natural Earth 10m (Optimized). {total_verts_after} pts.",
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
        epilog="Example: python generate_area_data.py --country_code JPN --area_id modern_japan"
    )
    parser.add_argument("--country_code", help="ISO A3 Country Code (e.g. JPN)")
    parser.add_argument("--area_id", help="Target Area ID (e.g. modern_japan)")
    parser.add_argument("--display_name", help="Display Name")
    parser.add_argument("--output", help="Output JSON file path (default: [area_id].json)")
    parser.add_argument("--simplify", type=float, default=0.05, help="Simplification Tolerance (default 0.05)")
    parser.add_argument("--filter_area", type=float, default=0.05, help="Min Area Threshold (default 0.05)")
    
    args = parser.parse_args()

    # Interactive Mode
    c_code = args.country_code or input("Enter Country Code (e.g. JPN): ").strip().upper()
    a_id = args.area_id or input("Enter Target Area ID (e.g. modern_japan): ").strip()
    d_name = args.display_name or input("Enter Display Name: ").strip()

    fetch_and_optimize(c_code, a_id, d_name, args.filter_area, args.simplify, args.output)
