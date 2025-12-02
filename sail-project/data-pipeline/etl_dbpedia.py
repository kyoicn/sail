import os
import sys
import requests
import json
from datetime import datetime
from supabase import create_client, Client
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") 

# [NEW] Configurable Table Name
# Default to 'events_dev' to prevent accidental writes to prod
TARGET_TABLE = os.getenv("TARGET_TABLE", "events_dev")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials in .env file")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ... (Extractor / Transformer functions remain unchanged) ...
# ... (fetch_dbpedia_events, parse_date, transform_event) ...

# --- 3. Loader: Write to Supabase ---
def load_to_db(events):
    if not events:
        print("⚠️ No valid events to load.")
        return

    print(f"🚚 Loading {len(events)} events to table '{TARGET_TABLE}'...")
    
    try:
        response = supabase.table(TARGET_TABLE).upsert(
            events, 
            on_conflict="source_id"
        ).execute()
        
        print(f"✅ Successfully upserted {len(response.data)} events to '{TARGET_TABLE}'!")
    except Exception as e:
        print(f"❌ Database Error: {e}")
        # Hint: If table doesn't exist, warn the user
        if '404' in str(e) or 'relation' in str(e):
            print(f"👉 Tip: Does table '{TARGET_TABLE}' exist? run the migration SQL to create it.")

if __name__ == "__main__":
    # Allow passing limit as arg
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    
    raw_data = fetch_dbpedia_events(limit=limit)
    clean_events = []
    
    for item in raw_data:
        event = transform_event(item)
        if event:
            clean_events.append(event)
            # print(f"🔹 Prepared: {event['title']}")
    
    load_to_db(clean_events)