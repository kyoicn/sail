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

def scan_db_objects(migrations_dir):
    """
    Scans all SQL files in migrations_dir to discover table and function names.
    Returns lists of tables and functions to be transformed.
    """
    tables = set()
    functions = set()
    
    # Regex to capture identifiers
    # Assumes standard formatting: "CREATE TABLE name" or "CREATE TABLE IF NOT EXISTS name"
    re_table = re.compile(r'^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)', re.IGNORECASE | re.MULTILINE)
    
    # "CREATE [OR REPLACE] FUNCTION name"
    re_func = re.compile(r'^\s*CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_]+)', re.IGNORECASE | re.MULTILINE)
    
    for sql_file in migrations_dir.glob('*.sql'):
        try:
            with open(sql_file, 'r') as f:
                content = f.read()
                
            # Tables
            for match in re_table.finditer(content):
                name = match.group(1)
                # Exclude system or migration tables if any (though unlikely to be created here)
                tables.add(name)
                
            # Functions
            for match in re_func.finditer(content):
                functions.add(match.group(1))
                
        except Exception as e:
            print(f"Warning: Failed to scan {sql_file.name}: {e}")
            
    return list(tables), list(functions)

def transform_sql(sql: str, suffix: str, tables: list, functions: list) -> str:
    """
    Transforms SQL to target specific table versions (prod/dev).
    Uses dynamically discovered tables and functions.
    """
    if not suffix:
        return sql
    
    # Transform Functions
    for func in functions:
        # Avoid double-suffixing if the SQL already uses the suffixed name (e.g. in a fix script)
        # Regex: \bfunc_name\b matches explicit word.
        # But if we have func_name_dev, \bfunc_name\b MIGHT match the prefix?
        # No. \b matches boundary between word and non-word. "_" is word char.
        # So "my_func" in "my_func_dev" -> "my_func" is followed by "_", no boundary.
        # So \bmy_func\b matches "my_func(" but NOT "my_func_dev(".
        # SAFE.
        sql = re.sub(rf'\b{func}\b', f'{func}{suffix}', sql)

    # Transform Tables
    for table in tables:
        sql = re.sub(rf'\b{table}\b', f'{table}{suffix}', sql)

    return sql

def main():
    parser = argparse.ArgumentParser(description="Run DB migrations.")
    parser.add_argument("--instance", choices=['prod', 'dev', 'staging'], help="Instance to migrate: prod, dev, or staging")
    args = parser.parse_args()
    
    instance = args.instance
    if not instance:
        instance = input("Please enter the target instance (prod, dev, or staging): ")
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
        
        # [NEW] Auto-discover tables and functions from ALL migration files
        custom_tables, custom_functions = scan_db_objects(migrations_dir)
        # Add legacy hardcoding if needed? No, scanning should cover it if files exist.
        # But for base tables created in initial migration, ensure they are found.
        # Assuming 000000_create_tables.sql exists.
        
        print(f"Auto-discovered {len(custom_tables)} tables and {len(custom_functions)} functions to manage.")

        
        new_migrations_count = 0
        
        for mf in migration_files:
            version = mf.name 
            if version not in applied:
                print(f"applying {version}...")
                try:
                    with open(mf, 'r') as f:
                        raw_sql = f.read()
                    
                    final_sql = transform_sql(raw_sql, suffix, custom_tables, custom_functions)
                    
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
