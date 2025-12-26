from .models import TimeEntry
from shapely.geometry import MultiPolygon, Polygon, box
from shapely.ops import unary_union, transform
from shapely.validation import make_valid
from typing import List
import re

def slugify(text):
    text = str(text).lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def fix_wikimedia_url(url: str) -> str:
    if not url:
        return url
    
    # 1. Wikipedia/Wikimedia File pages
    # e.g. en.wikipedia.org/wiki/File:..., commons.wikimedia.org/wiki/File:...
    wiki_file_pattern = r'^(https?://)?([a-z0-9-]+\.)?(wikipedia|wikimedia)\.org/wiki/File:(.+)$'
    match = re.match(wiki_file_pattern, url, re.IGNORECASE)
    if match:
        file_name = match.group(4)
        return f"https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/{file_name}"

    # 2. upload.wikimedia.org (thumbnails or direct)
    # e.g. https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Massachusetts_1775_map.jpg/800px-Massachusetts_1775_map.jpg
    # e.g. https://upload.wikimedia.org/wikipedia/commons/f/f1/Massachusetts_1775_map.jpg
    upload_pattern = r'^(https?://)?upload\.wikimedia\.org/wikipedia/commons/(thumb/)?(?:[a-f0-9]/[a-f0-9]{2}/)?([^/]+)(/.*)?$'
    match = re.match(upload_pattern, url, re.IGNORECASE)
    if match:
        file_name = match.group(3)
        return f"https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/{file_name}"
        
    return url

def calculate_astro_year(entry: TimeEntry) -> float:
    """
    Calculates float year for indexing.
    1 AD = 1.0, 1 BC = 0.0, 2 BC = -1.0
    """
    y = entry.year
    if y is None:
        return 0.0 # Fallback should typically not happen if validated, but safety first
        
    # Adjust for BC logic (Astronomical Year numbering)
    # If input is AD (y > 0): Base is y
    # If input is BC (y < 0): Base is y + 1 (e.g. -1 BC becomes 0.0)
    # Note: If JSON uses "negative year" for BC, we assume:
    # -1 = 1 BC. 
    
    astro_base = y if y > 0 else y + 1
    
    # Fraction of year
    if not entry.month or not entry.day:
        return float(astro_base)
        
    # Leap year logic (Gregorian simplified)
    is_leap = (y % 4 == 0 and y % 100 != 0) or (y % 400 == 0)
    if y < 1582: # Julian simplified
         is_leap = (y % 4 == 0)

    days_in_year = 366 if is_leap else 365
    days_in_months = [0, 31, 29 if is_leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    
    day_of_year = sum(days_in_months[:entry.month]) + entry.day
    fraction = (day_of_year - 1) / days_in_year
    
    return astro_base + fraction

def fix_dateline_geometry(geometry_data: List[List[List[List[float]]]]) -> str:
    """
    Fixes geometry that crosses the dateline (-180/180) by splitting it.
    Returns WKT string.
    """
    # Helper for extracting polygons from any geometry
    def extract_polygons(geom):
        if geom.is_empty: return []
        if geom.geom_type == 'Polygon': return [geom]
        if geom.geom_type == 'MultiPolygon': return list(geom.geoms)
        if geom.geom_type == 'GeometryCollection':
            pieces = []
            for g in geom.geoms: pieces.extend(extract_polygons(g))
            return pieces
        return []

    # 1. Flatten Polygons (Ensure spatial continuity)
    flattened_polys = []
    for poly_coords in geometry_data:
        # Process shell and holes
        processed_rings = []
        for ring_coords in poly_coords:
            if not ring_coords: continue
            new_ring = [ring_coords[0]]
            for i in range(1, len(ring_coords)):
                prev_x = new_ring[-1][0]
                curr_x, curr_y = ring_coords[i]
                # Shift curr_x by ±360 to be closest to prev_x
                diff = curr_x - prev_x
                if diff > 180: curr_x -= 360
                elif diff < -180: curr_x += 360
                new_ring.append((curr_x, curr_y))
            processed_rings.append(new_ring)
        
        poly = Polygon(processed_rings[0], processed_rings[1:])
        if not poly.is_valid:
            poly = make_valid(poly)
            flattened_polys.extend(extract_polygons(poly))
        else:
            flattened_polys.append(poly)
    
    # 2. Split at Dateline Boundaries (-180 and 180)
    # We use three boxes to stay robust
    box_left = box(-540, -90, -180, 90)
    box_world = box(-180, -90, 180, 90)
    box_right = box(180, -90, 540, 90)

    final_pieces = []

    for poly in flattened_polys:
        # Intersection with World
        p_world = poly.intersection(box_world)
        final_pieces.extend(extract_polygons(p_world))

        # Intersection with Left (Shift +360)
        p_left = poly.intersection(box_left)
        if not p_left.is_empty:
            p_left_shifted = transform(lambda x, y, z=None: (x + 360, y), p_left)
            final_pieces.extend(extract_polygons(p_left_shifted))

        # Intersection with Right (Shift -360)
        p_right = poly.intersection(box_right)
        if not p_right.is_empty:
            p_right_shifted = transform(lambda x, y, z=None: (x - 360, y), p_right)
            final_pieces.extend(extract_polygons(p_right_shifted))

    # 3. Final Union and cleanup
    if not final_pieces:
        return "MULTIPOLYGON EMPTY"
        
    final_geom = unary_union(final_pieces)
    if not final_geom.is_valid:
        final_geom = make_valid(final_geom)
        
    if final_geom.geom_type == 'Polygon':
        final_geom = MultiPolygon([final_geom])
    elif final_geom.geom_type == 'GeometryCollection':
        final_polys = extract_polygons(final_geom)
        final_geom = MultiPolygon(final_polys)

    return final_geom.wkt
