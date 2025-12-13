import os
import sys
import psycopg2
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Load env from data-pipeline/.env
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
load_dotenv(data_pipeline_root / '.env')

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not set in .env")
    print("Please add your PostgreSQL connection string to data-pipeline/.env")
    sys.exit(1)

def get_connection():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"Failed to connect to DB: {e}")
        sys.exit(1)

def ensure_migration_table(cur, table_suffix):
    """
    Creates a specific version table for the target table.
    e.g. if target='events', table='schema_migrations'
         if target='events_dev', table='schema_migrations_events_dev'
    """
    # Sanitize table_suffix
    if table_suffix == 'events':
        migration_table = 'schema_migrations'
    else:
        migration_table = f'schema_migrations_{table_suffix}'
        
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {migration_table} (
            version text PRIMARY KEY,
            applied_at timestamptz DEFAULT now()
        );
    """)
    return migration_table

def get_applied_migrations(cur, migration_table):
    cur.execute(f"SELECT version FROM {migration_table} ORDER BY version ASC;")
    return {row[0] for row in cur.fetchall()}

def record_migration(cur, migration_table, version):
    cur.execute(f"INSERT INTO {migration_table} (version) VALUES (%s);", (version,))

def run_migration_file_content(cur, sql_content):
    if sql_content.strip():
        cur.execute(sql_content)

import re

def transform_sql(sql: str, target_table: str) -> str:
    """
    Replaces generic 'events' references with 'target_table'.
    Also adjusts function names if target_table != 'events'.
    """
    if target_table == 'events':
        return sql
    
    # 1. Standardize Function Names First (Before 'events' replacement messes them up)
    # This ensures "get_events_in_view" -> "get_events_in_view_dev"
    # instead of "get_events_dev_in_view"
    
    suffix = target_table.replace('events', '') # e.g. '_dev'
    if suffix:
        # Replace function definitions and calls
        # Use regex to be safe, matching specific function names
        sql = re.sub(r'\bget_events_in_view\b', f'get_events_in_view{suffix}', sql)
        sql = re.sub(r'\bget_all_collections\b', f'get_all_collections{suffix}', sql)
    
    # 2. Replace table name using Word Boundary
    # This prevents matching "events" inside "get_events_in_view" (if step 1 didn't catch it or for other cases)
    # \bevents\b matches " events " or "events," but not "my_events_table" or "get_events"
    sql = re.sub(r'\bevents\b', target_table, sql)

    return sql

def main():
    parser = argparse.ArgumentParser(description="Run DB migrations.")
    parser.add_argument("--table", help="Target table to migrate.")
    args = parser.parse_args()
    
    target_table = args.table
    if not target_table:
      target_table = input("Please enter the target table name: ")
    print(f"Targeting table: {target_table}")

    conn = get_connection()
    conn.autocommit = False # Use transactions
    
    try:
        cur = conn.cursor()
        migration_table_name = ensure_migration_table(cur, target_table)
        conn.commit()

        applied = get_applied_migrations(cur, migration_table_name)
        
        migrations_dir = data_pipeline_root / 'migrations'
        if not migrations_dir.exists():
            print(f"Migrations directory not found: {migrations_dir}")
            sys.exit(1)

        # Get all .sql files, sorted
        migration_files = sorted(migrations_dir.glob('*.sql'))
        
        new_migrations_count = 0
        
        for mf in migration_files:
            version = mf.name 
            if version not in applied:
                print(f"applying {version}...")
                try:
                    with open(mf, 'r') as f:
                        raw_sql = f.read()
                    
                    final_sql = transform_sql(raw_sql, target_table)
                    
                    run_migration_file_content(cur, final_sql)
                    record_migration(cur, migration_table_name, version)
                    conn.commit()
                    print(f"✔ Successfully applied {version}")
                    new_migrations_count += 1
                except Exception as e:
                    conn.rollback()
                    print(f"❌ Failed to apply {version}")
                    print(f"Error: {e}")
                    sys.exit(1)
        
        if new_migrations_count == 0:
            print("Database is up to date.")
        else:
            print(f"Done. Applied {new_migrations_count} migrations.")

        cur.close()
        conn.close()

    except Exception as e:
        print(f"Unexpected error: {e}")
        if conn:
            conn.close()
        sys.exit(1)

if __name__ == "__main__":
    main()
