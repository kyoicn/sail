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
    
    
    # regexes for other objects to rename
    # 1. Indexes: "CREATE INDEX [IF NOT EXISTS] name ON table"
    #    or "CREATE INDEX name ON table"
    #    Capture 'name'
    re_index_def = re.compile(r'CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+ON', re.IGNORECASE)
    
    # 2. Constraints (Inline or Alter): "CONSTRAINT name"
    re_constraint = re.compile(r'CONSTRAINT\s+([a-zA-Z0-9_]+)', re.IGNORECASE)
    
    # 3. Sequences (often implicitly named, but if explicit): "CREATE SEQUENCE name"
    re_seq = re.compile(r'CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)', re.IGNORECASE)
    
    # Helper to apply suffixes
    def add_suffix(text, name, sfx):
        # replace standalone word 'name' with 'name_sfx'
        return re.sub(rf'\b{name}\b', f'{name}{sfx}', text)

    # A. Gather all Indexes/Constraints/Sequences declared in THIS sql
    # Note: This is a bit "local", assuming names are unique enough or locally scoped.
    # ideally we'd scan all files, but names like 'events_pkey' are standard convention.
    
    # scan for definitions to adding to replacement list
    defined_names = set()
    for m in re_index_def.finditer(sql):
        defined_names.add(m.group(1))
    for m in re_constraint.finditer(sql):
        defined_names.add(m.group(1))
    for m in re_seq.finditer(sql):
        defined_names.add(m.group(1))
        
    # Also standard primary keys implicit naming? 
    # Valid SQL often names them: CONSTRAINT events_pkey PRIMARY KEY
    # We caught that with re_constraint.
    
    # B. Apply Transformations
    
    # 1. Functions (Global discovery passed in)
    for func in functions:
        sql = add_suffix(sql, func, suffix)

    # 2. Tables (Global discovery passed in)
    for table in tables:
        sql = add_suffix(sql, table, suffix)
        
        # Hardcoded fix for PKEYs if they follow convention "tablename_pkey" and weren't caught explicitly?
        # If "events" -> "events_prod", then "events_pkey" -> "events_pkey_prod"
        # BUT "events_pkey" contains "events".
        # If we replaced "events" with "events_dev", we get "events_dev_pkey".
        # This is actually FINE and unique!
        # "events_pkey" -> "events_dev_pkey".
        # The collision happens if we DON'T rename the pkey but Postgres tries to create "events_pkey" again for a new table?
        # Postgres constraints are per-table, BUT index names (which back pkeys) must be unique schema-wide (usually).
        # So "events_pkey" for "events" and "events_pkey" for "events_dev" -> COLLISION.
        
        # We need to target the pkey name explicitly.
        # If the SQL says "CONSTRAINT events_pkey", we capture it above.
        
        # If the SQL says "PRIMARY KEY (id)" without name, Postgres gen a name.
        # "events_pkey".
        # If we rename table to "events_dev", Postgres gen "events_dev_pkey".
        # So implicit keys are INVALIDATED/AUTO-FIXED by table rename? 
        # YES.
        
        # The ERROR "relation events_pkey already exists" implies the SQL explicitly named it 
        # OR we failed to rename the table reference in the constraint definition?
        # Let's verify the failing SQL (000000).
        # It has: CONSTRAINT events_pkey PRIMARY KEY (id),
        # So we MUST rename 'events_pkey'.
        
    # 3. Rename identified local objects (Indexes, Constraints)
    for name in defined_names:
        sql = add_suffix(sql, name, suffix)

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
