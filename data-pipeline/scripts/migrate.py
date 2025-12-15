import os
import sys
import psycopg2
import argparse
from pathlib import Path
from dotenv import load_dotenv
import re

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

def ensure_migration_table(cur, instance):
    """
    Creates a specific version table for the target instance.
    prod -> schema_migrations
    dev  -> schema_migrations_dev
    """
    if instance == 'prod':
        migration_table = 'schema_migrations'
    else:
        migration_table = f'schema_migrations_{instance}'
        
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

def transform_sql(sql: str, suffix: str) -> str:
    """
    Transforms SQL to target specific table versions (prod/dev).
    
    Logic:
    If suffix is empty (Prod):
        No changes needed.
    
    If suffix is present (e.g. '_dev'):
        1. Append Suffix to KNOWN table names:
           - events -> events_dev
           - areas -> areas_dev
           - historical_periods -> historical_periods_dev
           - period_areas -> period_areas_dev
        2. Append Suffix to KNOWN function names:
           - get_events_in_view -> get_events_in_view_dev
           - get_all_collections -> get_all_collections_dev
           - get_active_periods -> get_active_periods_dev
    """
    if not suffix:
        return sql
    
    # List of Tables/Functions to Transform
    # Order matters? Not heavily, but good to likely be specific
    tables = ['events', 'areas', 'historical_periods', 'period_areas']
    functions = ['get_events_in_view', 'get_all_collections', 'get_active_periods']

    # Apply Transformations
    
    # Transform Functions
    for func in functions:
        # Regex: \bfunc_name\b -> func_name_suffix
        sql = re.sub(rf'\b{func}\b', f'{func}{suffix}', sql)

    # Transform Tables
    for table in tables:
        # Regex: \btable_name\b -> table_name_suffix
        sql = re.sub(rf'\b{table}\b', f'{table}{suffix}', sql)

    return sql

def main():
    parser = argparse.ArgumentParser(description="Run DB migrations.")
    parser.add_argument("--instance", choices=['prod', 'dev'], help="Instance to migrate: prod or dev")
    args = parser.parse_args()
    
    instance = args.instance
    if not instance:
        instance = input("Please enter the target instance (prod or dev): ")
    print(f"Targeting instance: {instance}")

    # Determine suffix
    if instance == 'prod':
        suffix = ""
    else:
        suffix = f"_{instance}" # e.g. '_dev'

    conn = get_connection()
    conn.autocommit = False # Use transactions
    
    try:
        cur = conn.cursor()
        migration_table_name = ensure_migration_table(cur, instance)
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
                    
                    final_sql = transform_sql(raw_sql, suffix)
                    
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
