import json
import os
import uuid
import re
import math

# --- Configuration ---
INPUT_FILE = os.path.join(os.path.dirname(__file__), "../gemini_10000.json")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../sql")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "import_events.sql")

def slugify(text):
    """Simple slugify for source_id generation."""
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    text = text.strip('_')
    return text

def calculate_astro_year(year, month, day):
    """
    Calculates the astronomical year as a float.
    Formula: Year + (DayOfYear - 1) / DaysInYear
    """
    if year is None:
        return None
    
    # Default to mid-year or start of year if month/day missing? 
    # Logic says: if precision is year, maybe .0 is fine.
    # If precision is month, maybe mid-month?
    # For now, if month/day missing, treat as Jan 1 for calculation base (x.0) or implement more specific logic.
    # The requirement is "precise" logic where possible.
    
    y = year
    m = month if month else 1
    d = day if day else 1
    
    # Check for leap year
    # Julian calendar rule (every 4 years) applies for historical dates often, 
    # but here we might want simple Gregorian-like logic or just simple 365/366.
    # Let's use standard logic: divisible by 4, not 100 unless 400. 
    # Note: 1 BC, 2 BC etc handling. 
    # Year 0 does not exist in standard history, but storage might use 0.
    # ChronosTime says: year -1 is 1 BC.
    # AstroYear: 1 BC = 0.0.
    
    # Let's map strict ChronosTime year to integer for calculation if needed.
    # But usually 'year' in JSON is int. 
    
    is_leap = (y % 4 == 0 and y % 100 != 0) or (y % 400 == 0)
    days_in_year = 366 if is_leap else 365
    
    # Calculate Day of Year
    days_in_months = [0, 31, 29 if is_leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    
    day_of_year = sum(days_in_months[:m]) + d
    
    # Formula: astro_year = year + (day_of_year - 1) / days_in_year
    # NOTE: ChronosTime definition says:
    # 1 AD = 1.0
    # 1 BC = 0.0
    # So if year > 0, astro_base is year.
    # If year < 0, astro_base is year + 1? No, 1 BC is year -1. 
    # If year is -1 => 0.0.
    # If year is -2 => -1.0.
    # So astro_base = year if year > 0 else year + 1.
    
    astro_base = y
    if y < 0:
        astro_base = y + 1
    
    # However, types/index.ts says:
    # 1 AD = 1.000
    # 1 BC = 0.000
    # 2 BC = -1.000
    # So:
    # 1 AD + jan 1 = 1.0
    # 1 BC + jan 1 = 0.0
    
    fraction = (day_of_year - 1) / days_in_year
    
    return astro_base + fraction

def escape_sql(value):
    """Escapes single quotes for SQL."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    # String escaping: replace ' with ''
    return "'" + str(value).replace("'", "''") + "'"

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    print(f"Reading from {INPUT_FILE}...")
    with open(INPUT_FILE, 'r') as f:
        events = json.load(f)
    
    print(f"Processing {len(events)} events...")
    
    sql_statements = []
    
    for event in events:
        # 1. IDs
        gen_uuid = str(uuid.uuid4())
        title = event.get("event_title", "Untitled")
        source_id = f"gemini:{slugify(title)}"
        
        # 2. Time
        start = event.get("start_time", {})
        year = start.get("year")
        month = start.get("month")
        day = start.get("day")
        precision = start.get("precision")
        
        astro_year = calculate_astro_year(year, month, day)
        
        # Clean start object for JSONB
        # Ensure minimal fields are present
        start_obj = {
            "year": year,
            "month": month,
            "day": day,
            "hour": start.get("hour"),
            "minute": start.get("minute"),
            "second": start.get("second"),
            "precision": precision,
            "astro_year": astro_year
        }
        # Filter out None values
        start_obj = {k: v for k, v in start_obj.items() if v is not None}
        start_json = json.dumps(start_obj)
        
        # 3. Location
        loc = event.get("location", {})
        lat = loc.get("latitude")
        lng = loc.get("longitude")
        place_name = loc.get("location_name")
        granularity = loc.get("precision") # JSON uses 'precision' for loc too? Let's check. Yes: "precision": "city"
        # Map JSON 'precision' to schema 'granularity'?
        # JSON: precision: city, spot
        # Schema: granularity: spot, city, territory, continent
        
        location_geom = f"POINT({lng} {lat})"
        
        # 4. Others
        summary = event.get("event_description", "")
        importance = event.get("importance", 1.0)

        # 5. Certainty (Location)
        # Missing in JSON, defaulting to 'definite'
        certainty = "definite"
        
        # Construct SQL
        # Using ON CONFLICT (source_id) DO UPDATE
        
        # Columns based on upload.py mapping:
        # source_id, title, summary, image_url, start_year, end_year, precision, 
        # start_astro_year, end_astro_year, start_time_body, end_time_body, 
        # location, place_name, granularity, certainty, region_id, importance, sources, pipeline
        
        # We need to be careful with schema. 'events' table.
        # Assuming table columns are snake_case.
        
        sql = f"""
INSERT INTO events (
    source_id, 
    title, 
    summary, 
    start_year, 
    precision, 
    start_astro_year, 
    start_time_body, 
    location, 
    place_name, 
    granularity,
    certainty, 
    importance
) VALUES (
    {escape_sql(source_id)},
    {escape_sql(title)},
    {escape_sql(summary)},
    {escape_sql(year)},
    {escape_sql(precision)},
    {escape_sql(astro_year)},
    {escape_sql(start_json)}::jsonb,
    ST_GeomFromText({escape_sql(location_geom)}, 4326),
    {escape_sql(place_name)},
    {escape_sql(granularity)},
    {escape_sql(certainty)},
    {escape_sql(importance)}
)
ON CONFLICT (source_id) DO UPDATE SET
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    start_year = EXCLUDED.start_year,
    precision = EXCLUDED.precision,
    start_astro_year = EXCLUDED.start_astro_year,
    start_time_body = EXCLUDED.start_time_body,
    location = EXCLUDED.location,
    place_name = EXCLUDED.place_name,
    granularity = EXCLUDED.granularity,
    certainty = EXCLUDED.certainty,
    importance = EXCLUDED.importance;
"""
        sql_statements.append(sql.strip())
        
    print(f"Generating SQL file at {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w') as f:
        f.write("-- Auto-generated import script for Gemini 10k events\n")
        f.write("-- Generated by Sail Data Pipeline\n\n")
        f.write("\n\n".join(sql_statements))
        f.write("\n")
        
    print("Done.")

if __name__ == "__main__":
    main()
