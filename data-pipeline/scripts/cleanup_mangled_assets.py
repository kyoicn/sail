"""
Script: cleanup_mangled_assets.py
Description:
    Corrects naming collisions in Postgres indexes and constraints that occur during
    table renames (e.g. promoting staging to prod). It renames assets to follow
    a deterministic canonical pattern: {table_name}_{column_name}_{suffix}.

    Why this is needed:
    Postgres automatically renames indexes when a table is renamed, but often appends
    arbitrary digits (e.g., events_pkey1) if a collision occurs. This script cleans
    up those messy names to keep the schema clean and predictable.

Usage Examples:
    python data-pipeline/scripts/cleanup_mangled_assets.py
"""

import os
import psycopg2
import re
from dotenv import load_dotenv
from pathlib import Path

# Setup Environment
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
load_dotenv(data_pipeline_root / '.env')

DATABASE_URL = os.environ.get("DATABASE_URL")

def get_base_name(mangled, table_name):
    # Strip known suffixes and trailing digits
    # Remove _staging, _backup, and any trailing sequence of numbers added by PG (e.g. events_pkey1)
    base = mangled
    base = base.replace("_staging", "").replace("_backup", "")
    # Remove trailing digits added by Postgres naming collisions
    base = re.sub(r'\d+$', '', base)
    
    # Ensure it starts with the pure table name (stripping suffix from table_name too)
    pure_table = table_name.replace("_staging", "").replace("_backup", "")
    if not base.startswith(pure_table):
        base = f"{pure_table}_{base}"
    return base

def cleanup():
    print("🧹 Starting SUPER Cleanup: Restoring Canonical Table-Prefixed Names")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    try:
        # Get all public tables
        cur.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        tables = [row[0] for row in cur.fetchall()]

        for table in tables:
            suffix = ""
            if table.endswith("_staging"): suffix = "_staging"
            elif table.endswith("_backup"): suffix = "_backup"
            
            # 1. Cleanup Indexes
            cur.execute(f"""
                SELECT DISTINCT i.relname
                FROM pg_index x
                JOIN pg_class c ON c.oid = x.indrelid
                JOIN pg_class i ON i.oid = x.indexrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = '{table}'
                  AND n.nspname = 'public';
            """)
            indexes = [row[0] for row in cur.fetchall()]
            for idx in indexes:
                base = get_base_name(idx, table)
                canonical = f"{base}{suffix}"
                if idx != canonical:
                    print(f"  [{table}] Index: {idx} -> {canonical}")
                    try:
                        cur.execute(f'ALTER INDEX "{idx}" RENAME TO "{canonical}";')
                    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedObject, psycopg2.errors.DuplicateTable, psycopg2.errors.DuplicateObject):
                        print(f"    - Index {idx} already renamed, missing, or target exists; skipping")
                        conn.rollback()
                        cur = conn.cursor()

            # 2. Cleanup Constraints
            cur.execute(f"""
                SELECT DISTINCT conname
                FROM pg_constraint con
                JOIN pg_class c ON con.conrelid = c.oid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relname = '{table}'
                  AND n.nspname = 'public';
            """)
            constraints = [row[0] for row in cur.fetchall()]
            for con in constraints:
                base = get_base_name(con, table)
                canonical = f"{base}{suffix}"
                if con != canonical:
                    print(f"  [{table}] Constraint: {con} -> {canonical}")
                    try:
                        cur.execute(f'ALTER TABLE "{table}" RENAME CONSTRAINT "{con}" TO "{canonical}";')
                    except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedObject, psycopg2.errors.DuplicateTable, psycopg2.errors.DuplicateObject):
                        print(f"    - Constraint {con} already renamed, missing, or target exists; skipping")
                        conn.rollback()
                        cur = conn.cursor()
        
        conn.commit()
        print("✅ Super Cleanup Successful!")
    except Exception as e:
        conn.rollback()
        print(f"❌ Super Cleanup Failed: {e}")
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    cleanup()
