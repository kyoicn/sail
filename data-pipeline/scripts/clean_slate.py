"""
Script: clean_slate.py
Description:
    Utilities to completely wipe database schemas to a fresh state. 
    Useful for local development resets or "scorched earth" debugging.

Flags:
    --instance <instance1,instance2,...>:
        REQUIRED. Specifies one or more instances (schemas) to clean, COMMA SEPARATED.
        - dev: Drops 'dev' schema.
        - staging: Drops 'staging' schema.
        - prod: Drops 'public' schema (and recreates it empty with PostGIS).

Usage Examples:
    # 1. Clean ONLY Staging
    #    Useful if staging is corrupted but you want to keep dev/prod data.
    python data-pipeline/scripts/clean_slate.py --instance staging

    # 2. Clean Dev AND Staging
    python data-pipeline/scripts/clean_slate.py --instance dev,staging

    # 3. Clean EVERYTHING (Manual specification required)
    python data-pipeline/scripts/clean_slate.py --instance dev,staging,prod
"""
import os
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

import argparse
import sys

# Setup
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
load_dotenv(data_pipeline_root / '.env')

DATABASE_URL = os.environ.get("DATABASE_URL")

def clean_slate():
    parser = argparse.ArgumentParser(description="Clean up database schemas.")
    parser.add_argument("--instance", required=True,
                        help="Specific instance(s) (schema) to clean. REQUIRED. Comma separated (e.g. dev,staging).")
    args = parser.parse_args()

    # Parse and Validate Instances
    requested_instances = [i.strip() for i in args.instance.split(',')]
    valid_choices = {'dev', 'staging', 'prod'}
    
    for inst in requested_instances:
        if inst not in valid_choices:
            print(f"Error: Invalid instance '{inst}'. Choices are: {', '.join(valid_choices)}")
            sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    
    # Determine targets
    target_schemas = []
    for inst in requested_instances:
        target_schemas.append(inst)
            
    warning_list = ", ".join(target_schemas)
    warning_msg = f"This script will DESTROY ALL DATA in schema(s): {warning_list}."

    print("!!! DANGER ZONE !!!")
    print(warning_msg)
    print("This cannot be undone.")
    
    # Confirmation must match the requested instances for safety
    # We join by comma to make it look like the command arg (normalized)
    joined_instances = ",".join(requested_instances)
    expected_input = f"delete {joined_instances}"
    confirmation = input(f"Are you absolutely sure? Type '{expected_input}' to continue: ")
    
    if confirmation != expected_input:
        print("Aborted.")
        return

    cur = conn.cursor()
    
    print("WARNING: Dropping schemas: ", target_schemas)
    
    for s in target_schemas:
        print(f"Dropping schema {s}...")
        cur.execute(f"DROP SCHEMA IF EXISTS {s} CASCADE;")
    
    # Always ensure public exists and has PostGIS (never drop public!)
    print("Ensuring public schema and PostGIS exist...")
    cur.execute("CREATE SCHEMA IF NOT EXISTS public;")
    cur.execute("GRANT ALL ON SCHEMA public TO postgres;") 
    cur.execute("GRANT ALL ON SCHEMA public TO public;")
    
    # PostGIS (Safe create in public)
    try:
        cur.execute("CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;")
    except Exception as e:
        print(f"Warning: Could not enable PostGIS: {e}")

    print("Clean Complete.")
    cur.close()
    conn.close()

if __name__ == "__main__":
    clean_slate()

