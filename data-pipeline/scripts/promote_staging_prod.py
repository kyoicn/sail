"""
Script: promote_staging_prod.py
Description:
    Execute the critical "Staging -> Production" promotion workflow.
    It performs an ATOMIC SWAP of tables to minimize downtime.

    Workflow:
    1. Verifies staging tables exist.
    2. Transactions BEGIN:
        a. Rename current `table` -> `table_backup`.
        b. Rename `table_staging` -> `table`.
    3. Commit Transaction (Atomic Swap).
    4. Run Production Migrations (to fix RPCs/OIDs).
    5. Re-create new empty Staging tables (`migrate.py`).
    6. "Persistent Staging": Sync Prod data BACK to new Staging tables.

    Tables handled: events, areas, historical_periods, period_areas.

Usage Examples:
    python data-pipeline/scripts/promote_staging_prod.py
"""

import sys
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Setup Environment
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
sys.path.append(str(data_pipeline_root))
load_dotenv(data_pipeline_root / '.env')

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not set")
    sys.exit(1)

def get_connection():
    return psycopg2.connect(DATABASE_URL)

def normalize_table_assets(cur, table_name, target_suffix):
    """
    Deterministically renames all indexes and constraints for a table
    to {pure_table}_{base_name}{target_suffix}.
    """
    import re
    def get_base(name, t_name):
        # Strip _staging, _backup, and any trailing PG version numbers
        b = name.replace("_staging", "").replace("_backup", "")
        b = re.sub(r'\d+$', '', b)
        # Ensure it starts with the pure table name
        pure_t = t_name.replace("_staging", "").replace("_backup", "")
        if not b.startswith(pure_t):
            b = f"{pure_t}_{b}"
        return b

    # 1. Normalize Indexes
    cur.execute(f"""
        SELECT DISTINCT i.relname
        FROM pg_index x
        JOIN pg_class c ON c.oid = x.indrelid
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = '{table_name}'
          AND n.nspname = 'public';
    """)
    indexes = [row[0] for row in cur.fetchall()]
    for idx in indexes:
        base = get_base(idx, table_name)
        canonical = f"{base}{target_suffix}"
        if idx != canonical:
            print(f"    - Index: {idx} -> {canonical}")
            try:
                cur.execute(f'ALTER INDEX "{idx}" RENAME TO "{canonical}";')
            except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedObject, psycopg2.errors.DuplicateTable, psycopg2.errors.DuplicateObject):
                # This happens if a constraint rename already renamed the index or target exists
                print(f"      (Index {idx} already renamed, missing, or target exists; skipping)")
                cur.connection.rollback()
                cur = cur.connection.cursor()

    # 2. Normalize Constraints
    cur.execute(f"""
        SELECT DISTINCT conname
        FROM pg_constraint con
        JOIN pg_class c ON con.conrelid = c.oid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = '{table_name}'
          AND n.nspname = 'public';
    """)
    constraints = [row[0] for row in cur.fetchall()]
    for con in constraints:
        base = get_base(con, table_name)
        canonical = f"{base}{target_suffix}"
        if con != canonical:
            print(f"    - Constraint: {con} -> {canonical}")
            try:
                cur.execute(f'ALTER TABLE "{table_name}" RENAME CONSTRAINT "{con}" TO "{canonical}";')
            except (psycopg2.errors.UndefinedTable, psycopg2.errors.UndefinedObject, psycopg2.errors.DuplicateTable, psycopg2.errors.DuplicateObject):
                print(f"      (Constraint {con} already renamed, missing, or target exists; skipping)")
                cur.connection.rollback()
                cur = cur.connection.cursor()

def promote_staging():
    print("🚀 Starting Promotion: Staging -> Prod")
    conn = get_connection()
    cur = conn.cursor()

    try:
        # 1. Verify existence of staging tables
        tables = ['events', 'areas', 'historical_periods', 'period_areas', 'schema_migrations']
        for t in tables:
            cur.execute(f"SELECT to_regclass('{t}_staging');")
            if not cur.fetchone()[0]:
                raise Exception(f"Staging table {t}_staging does not exist!")

        print("verified staging tables exist.")

        # 2. Atomic Swap Transaction
        print("Performing Atomic Swap...")
        cur.execute("BEGIN;")

        # A. Backup Current Prod
        print("  - Backing up current Prod tables...")
        for t in tables:
            cur.execute(f"DROP TABLE IF EXISTS {t}_backup CASCADE;")
            # Canonicalize prod constraints to _backup before renaming the table
            normalize_table_assets(cur, t, "_backup")
            cur.execute(f"ALTER TABLE {t} RENAME TO {t}_backup;")

        # B. Promote Staging
        print("  - Promoting Staging tables...")
        for t in tables:
            cur.execute(f"ALTER TABLE {t}_staging RENAME TO {t};")
            # Canonicalize staging constraints back to clean prod names
            normalize_table_assets(cur, t, "")
        
        # COMMIT the Atomic Swap now.
        # This releases locks so that migrate.py can run without blocking/timeout.
        conn.commit()
        print("✅ Atomic Swap Committed.")

        # B2. Run Production Migrations
        # After the swap, the new tables have production names. 
        # We must run migrations to create/update RPCs that bind to these new OIDs.
        print("  - Running Production migrations to update RPCs...")
        try:
            import subprocess
            migrate_script = data_pipeline_root / 'scripts' / 'migrate.py'
            cmd = [sys.executable, str(migrate_script), '--instance', 'prod']
            subprocess.check_call(cmd)
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to run production migrations: {e}")

        # C. Re-create Staging (Fresh Schema via Migrate)
        print("  - Re-creating fresh Staging tables via migrate.py...")
        try:
            import subprocess
            migrate_script = data_pipeline_root / 'scripts' / 'migrate.py'
            cmd = [sys.executable, str(migrate_script), '--instance', 'staging']
            subprocess.check_call(cmd)
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to re-run migrations for staging: {e}")

        # D. Sync Back: Prod -> Staging (Persistent Staging)
        print("  - Syncing data back: Prod -> Staging (Persistent Staging)...")
        
        # Start a NEW transaction for the sync back
        cur = conn.cursor()
        
        # Define correct dependency order for population
        sync_order = ['areas', 'historical_periods', 'period_areas', 'events', 'schema_migrations']
        
        for t in sync_order:
            print(f"    - Syncing {t}...")
            source_table = t
            dest_table = f"{t}_staging"
            
            # Get columns for source
            cur.execute(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = '{source_table}' 
                  AND table_schema = 'public'
                  AND is_generated = 'NEVER';
            """)
            source_cols = set(row[0] for row in cur.fetchall())
            
            # Get columns for destination
            cur.execute(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = '{dest_table}' 
                  AND table_schema = 'public'
                  AND is_generated = 'NEVER';
            """)
            dest_cols = set(row[0] for row in cur.fetchall())
            
            # Common columns only
            common_cols = sorted(list(source_cols.intersection(dest_cols)))
            
            if not common_cols:
                print(f"      Warning: No common insertable columns for {t}, skipping copy.")
                continue
                
            cols_str = ", ".join([f'"{c}"' for c in common_cols])
            
            # Copy from PROD to STAGING
            cur.execute(f"TRUNCATE {dest_table} CASCADE;")
            query = f'INSERT INTO {dest_table} ({cols_str}) SELECT {cols_str} FROM {source_table};'
            cur.execute(query)
            
            cur.execute(f"SELECT count(*) FROM {dest_table};")
            cnt = cur.fetchone()[0]
            print(f"      ✔ Copied {cnt} rows.")

        conn.commit()
        print("✅ Persistence Sync Successful!")
        print("  - Prod is now updated with Staging data.")
        print("  - Staging has been rebuilt and re-synced from Prod.")
        print("  - You are ready to continue working in Staging.")

    except Exception as e:
        conn.rollback()
        print(f"❌ Promotion Failed: {e}")
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    choice = input("Are you sure you want to promote STAGING to PROD? This is destructive. (yes/no): ")
    if choice.lower() == "yes":
        promote_staging()
    else:
        print("Aborted.")
