import os
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Setup
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
load_dotenv(data_pipeline_root / '.env')

DATABASE_URL = os.environ.get("DATABASE_URL")

def clean_slate():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    
    print("!!! DANGER ZONE !!!")
    print("This script will DESTROY ALL DATA in columns: public, dev, staging, backup.")
    print("This cannot be undone.")
    confirmation = input("Are you absolutely sure you want to proceed? Type 'delete everything' to continue: ")
    
    if confirmation != 'delete everything':
        print("Aborted.")
        return

    cur = conn.cursor()
    
    schemas = ['public', 'dev', 'staging', 'backup']
    
    print("WARNING: This will DROP all data in schemas: ", schemas)
    
    for s in schemas:
        print(f"Dropping schema {s}...")
        cur.execute(f"DROP SCHEMA IF EXISTS {s} CASCADE;")
    
    # Recreate public because it's standard
    print("Recreating empty public schema...")
    cur.execute("CREATE SCHEMA public;")
    cur.execute("GRANT ALL ON SCHEMA public TO postgres;") 
    cur.execute("GRANT ALL ON SCHEMA public TO public;")
    
    # PostGIS (Safe create in public)
    try:
        print("Enabling PostGIS in public...")
        cur.execute("CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;")
    except Exception as e:
        print(f"Warning: Could not enable PostGIS: {e}")

    print("Deep Clean Complete.")
    cur.close()
    conn.close()

if __name__ == "__main__":
    clean_slate()
