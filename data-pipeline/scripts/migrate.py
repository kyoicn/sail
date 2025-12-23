"""
Script: migrate.py
Description:
    Manages database schema migrations for the Sail application using Postgres Schemas.
    It applies SQL files from `data-pipeline/migrations/` unmodified, ensuring
    they run within the correct `search_path` (Namespace).

    Key Features:
    - Environment/Schema Isolation: Supports `prod` (public), `dev`, and `staging` schemas.
    - Idempotency: Checks `schema_migrations` to avoid double-application.
    - Rollback/Reset: Supports un-applying a specific migration record (forcing a re-run).
    - Zero Regex: SQL files are executed exactly as written; isolation is handled by `search_path`.

Detailed Parameter Guide:
    --env:
        The target environment for the migration. Choices: 'prod', 'dev', 'staging'.
        - prod: Applies to the `public` schema.
        - dev: Applies to the `dev` schema.
        - staging: Applies to the `staging` schema.
        Note: The script automatically creates the schema if it doesn't exist.

    --instance:
        Alias for --env (maintained for backward compatibility with older CI scripts).

    --reset:
        The filename (version) of a specific migration to "un-apply" (mark as not applied).
        NOTE: This does NOT run down-migrations (SQL reversal). It only removes the 
        record from the `schema_migrations` tracking table in the specified schema.
        Use this if you manually fixed a migration or want to force a re-run during dev.

Usage Examples:
    # 1. Migrate Development Environment:
    #    Applies all pending migrations to the 'dev' schema.
    python data-pipeline/scripts/migrate.py --env dev

    # 2. Migrate Production:
    #    Applies all pending migrations to the 'public' schema.
    python data-pipeline/scripts/migrate.py --env prod

    # 3. Reset a Migration in Staging:
    #    If '20241201_init.sql' failed partway and was manually cleaned:
    python data-pipeline/scripts/migrate.py --env staging --reset 20241201_init.sql
"""

import sys
import psycopg2
import argparse
from pathlib import Path
from dotenv import load_dotenv
import os

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

def resolve_schema(env_name: str) -> str:
    """Methods mapping environment names to postgres schemas."""
    if env_name == 'prod':
        return 'public'
    if env_name in ['dev', 'staging']:
        return env_name
    raise ValueError(f"Unknown environment: {env_name}")

def ensure_schema_and_table(cur, schema_name):
    """
    1. Creates the schema if it doesn't exist.
    2. Creates the schema_migrations table INSIDE that schema.
    """
    # 1. Create Schema
    if schema_name != 'public':
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS \"{schema_name}\";")
    
    # 2. Create Migration Table
    # Table is always just 'schema_migrations', but usually referenced via search_path.
    # explicit paths are safer for creation.
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS "{schema_name}".schema_migrations (
            version text PRIMARY KEY,
            applied_at timestamptz DEFAULT now()
        );
    """)

def get_applied_migrations(cur, schema_name):
    cur.execute(f"SELECT version FROM \"{schema_name}\".schema_migrations ORDER BY version ASC;")
    return {row[0] for row in cur.fetchall()}

def record_migration(cur, schema_name, version):
    cur.execute(f"INSERT INTO \"{schema_name}\".schema_migrations (version) VALUES (%s);", (version,))

def reset_migration(cur, schema_name, version):
    print(f"Resetting migration {version} in schema '{schema_name}'...")
    cur.execute(f"DELETE FROM \"{schema_name}\".schema_migrations WHERE version = %s", (version,))
    row_count = cur.rowcount
    if row_count > 0:
        print(f"✔ Successfully removed record for {version}.")
    else:
        print(f"⚠ Migration {version} was not found in history.")

def run_migration_file(cur, file_path, schema_name):
    """
    Executes the SQL file with the correct search_path set.
    """
    with open(file_path, 'r') as f:
        sql_content = f.read()
            
    if not sql_content.strip():
        return

    # Critical: Set search_path so that 'CREATE TABLE events' creates it in the target schema.
    # We include 'public' secondarily so that extensions (PostGIS) or shared assets are visible.
    cur.execute(f"SET search_path TO \"{schema_name}\", public;")
    
    cur.execute(sql_content)

def main():
    parser = argparse.ArgumentParser(description="Run (or reset) DB migrations using Schemas.")
    parser.add_argument("--env", choices=['prod', 'dev', 'staging'], 
                        help="Target Environment: prod (public), dev, or staging")
    parser.add_argument("--instance", choices=['prod', 'dev', 'staging'], help="Alias for --env")
    parser.add_argument("--reset", help="Version (filename) of the migration to reset/un-apply.")
    args = parser.parse_args()
    
    env = args.env or args.instance
    if not env:
        # Fallback for old scripts calling --instance
        # argparse doesn't natively support alias arg names easily without custom action,
        # but let's just check sys.argv or force user to use --env.
        # Actually, let's just allow the user to continue using --instance if they did.
        # But wait, I added aliases param above? No, argparse doesn't have aliases kwarg.
        # Let's fix that.
        pass

    # Re-parse manually to handle back-compat if needed, or just enforce --env.
    # Let's trust the user or fix the parser.
    # I'll just change the argument definition to be clean.
    
    if not env:
         env = input("Please enter the target environment (prod, dev, staging): ")

    try:
        target_schema = resolve_schema(env)
    except ValueError as e:
        print(e)
        sys.exit(1)

    print(f"Targeting Environment: {env} -> Schema: {target_schema}")

    conn = get_connection()
    conn.autocommit = False # Use transactions
    
    try:
        cur = conn.cursor()
        
        # 1. Setup
        ensure_schema_and_table(cur, target_schema)
        conn.commit()

        # 2. Reset Mode
        if args.reset:
            reset_migration(cur, target_schema, args.reset)
            conn.commit()
            print("Reset complete. Note: This only removed the history record. You may need to manually drop tables/functions if the SQL file didn't include down-migrations.")
            return

        # 3. Apply Mode
        applied = get_applied_migrations(cur, target_schema)
        
        migrations_dir = data_pipeline_root / 'migrations'
        if not migrations_dir.exists():
            print(f"Migrations directory not found: {migrations_dir}")
            sys.exit(1)

        migration_files = sorted(migrations_dir.glob('*.sql'))
        
        new_migrations_count = 0
        
        for mf in migration_files:
            version = mf.name 
            if version not in applied:
                print(f"applying {version}...")
                try:
                    run_migration_file(cur, mf, target_schema)
                    record_migration(cur, target_schema, version)
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
