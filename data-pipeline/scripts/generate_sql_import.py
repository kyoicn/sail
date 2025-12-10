import json
import os
import uuid
import re
import sys

# Add parent directory to path to allow importing from src
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from typing import Optional, List, Literal
from src.models import TimeEntry, Link, EventSchema

# --- 1. Configuration ---
# Absolute paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(BASE_DIR, "../data/gemini_10000.json")
OUTPUT_DIR = os.path.join(BASE_DIR, "../sql")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "import_events.sql")

# --- 2. Data Models (Pydantic) ---
# Moved to src.models


# --- 3. Helper Functions ---

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def calculate_astro_year(entry: TimeEntry) -> float:
    """
    Calculates float year for indexing.
    1 AD = 1.0, 1 BC = 0.0, 2 BC = -1.0
    """
    y = entry.year
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

def escape_sql(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    return "'" + str(value).replace("'", "''") + "'"

def escape_jsonb(data):
    if data is None:
        return "NULL"
    json_str = json.dumps(data)
    return "'" + json_str.replace("'", "''") + "'::jsonb"

# --- 4. Main Processing ---

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    print(f"Reading {INPUT_FILE}...")
    with open(INPUT_FILE, 'r') as f:
        raw_events = json.load(f)
        
    sql_statements = []
    
    print(f"Processing {len(raw_events)} events...")
    
    for raw in raw_events:
        try:
            # Validate with Pydantic
            event = EventSchema(**raw)
            
            # --- Transform Data ---
            
            # 1. Identity
            source_id = f"gemini:{slugify(event.title)}"
            
            # 2. Time
            # 2. Time
            start_te = event.start_time
            start_astro = calculate_astro_year(start_te)
            start_json = start_te.model_dump(exclude_none=True)
            
            end_astro = "NULL"
            end_json = "NULL"
            if event.end_time:
                end_te = event.end_time
                end_astro = calculate_astro_year(end_te)
                end_json = escape_jsonb(end_te.model_dump(exclude_none=True))
            
            # 3. Location
            lat = event.location.latitude
            lng = event.location.longitude
            place_name = event.location.location_name
            
            # Map Precision/Certainty from Model
            granularity = event.location.precision
            certainty = event.location.certainty
            
            if lat is None or lng is None:
                continue # Skip invalid location
                
            location_sql = f"ST_GeomFromText('POINT({lng} {lat})', 4326)"
            
            # 4. Links & Images
            links = []
            if event.sources:
                for s in event.sources:
                    links.append(s.model_dump())
            
            image_urls = []
            if event.images:
                for img in event.images:
                    image_urls.append(img.url)
            
            image_urls_sql = "'{" + ",".join([f'"{u}"' for u in image_urls]) + "}'"
            
            # --- Generate INSERT ---
            sql = f"""
INSERT INTO events (
    source_id, title, summary, image_urls, links,
    start_astro_year, end_astro_year, start_time_entry, end_time_entry,
    location, place_name, granularity, certainty, importance
) VALUES (
    {escape_sql(source_id)},
    {escape_sql(event.title)},
    {escape_sql(event.summary)},
    {image_urls_sql},
    {escape_jsonb(links)},
    {start_astro},
    {end_astro},
    {escape_jsonb(start_json)},
    {end_json},
    {location_sql},
    {escape_sql(place_name)},
    {escape_sql(granularity)},
    {escape_sql(certainty)},
    {escape_sql(event.importance)}
)
ON CONFLICT (source_id) DO UPDATE SET
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    start_astro_year = EXCLUDED.start_astro_year,
    start_time_entry = EXCLUDED.start_time_entry,
    location = EXCLUDED.location,
    importance = EXCLUDED.importance;
"""
            sql_statements.append(sql.strip())
            
        except Exception as e:
            # print(f"Skipping event {raw.get('event_title', 'Unknown')}: {e}")
            pass

    print(f"Writing {len(sql_statements)} statements to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w') as f:
        f.write("-- Auto-generated by generate_sql_import.py\n")
        f.write("\n\n".join(sql_statements))
        
    print("Done.")

if __name__ == "__main__":
    main()
