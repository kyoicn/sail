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
import os

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

def promote_staging():
    print("🚀 Starting Promotion: Staging (Schema) -> Prod (prod)")
    print("   Strategy: Move current Prod tables to 'backup' schema.")
    
    conn = get_connection()
    cur = conn.cursor()

    try:
        # Tables to promote
        # Note: 'schema_migrations' is also promoted to carry history forward
        tables = ['events', 'areas', 'historical_periods', 'period_areas', 'schema_migrations']

        # Custom Types to promote (Enums)
        # We must swap types because tables reference them by OID.
        types = ['granularity_type', 'certainty_type']

        # (Function Auto-Redeploy moved to after Atomic Swap)

        # ---------------------------------------------------------
        # D. User Data Protection (Future Proofing)
        # ---------------------------------------------------------
        # If we had 'users' table, we would NOT include it in the 'tables' list above.
        # The 'tables' list should only contain the "Static Content" we are publishing (Events/Periods).
        # We rely on the initial definition of 'tables' at the top of main() to exclude user data.
        
        # 1. Verify existence of staging tables
        print("Checking Staging schema...")
        for t in tables:
            cur.execute(f"SELECT to_regclass('staging.{t}');")
            if not cur.fetchone()[0]:
                raise Exception(f"Table staging.{t} does not exist! Have you populated staging?")
        print("Verified staging tables exist.")

        # 2. Atomic Swap Transaction
        print("Performing Atomic Schema Swap...")
        cur.execute("BEGIN;")
        
        cur.execute("CREATE SCHEMA IF NOT EXISTS backup;")

        # A. Backup Current Prod (Prod -> Backup)
        print("  - Backing up current Prod assets to 'backup'...")
        
        # A1. Move Types (Prod -> Backup)
        for t in types:
            cur.execute(f"SELECT to_regtype('prod.{t}');")
            if cur.fetchone()[0]:
                cur.execute(f"DROP TYPE IF EXISTS backup.{t} CASCADE;")
                cur.execute(f'ALTER TYPE prod."{t}" SET SCHEMA backup;')
        
        # A2. Move Tables (Prod -> Backup)
        for t in tables:
            cur.execute(f"SELECT to_regclass('prod.{t}');")
            if cur.fetchone()[0]:
                cur.execute(f"DROP TABLE IF EXISTS backup.{t} CASCADE;")
                cur.execute(f'ALTER TABLE prod."{t}" SET SCHEMA backup;')

        # B. Promote Staging (Staging -> Prod)
        print("  - Moving Staging assets to Prod...")
        
        # B1. Move Types (Staging -> Prod)
        for t in types:
            cur.execute(f'ALTER TYPE staging."{t}" SET SCHEMA prod;')
            
        # B2. Move Tables (Staging -> Prod)
        for t in tables:
            cur.execute(f'ALTER TABLE staging."{t}" SET SCHEMA prod;')
        
        # COMMIT the Atomic Swap now.
        conn.commit()
        print("✅ Atomic Swap Committed.")

        # B2. Run Production Migrations (RPCs / Permissions)
        # The moved tables are now in public. We run 'migrate.py --env prod' 
        # to ensure any "ON public" logic (like RPCs) matches the new tables.
        # It updates 'schema_migrations' (which we just moved) to mark them as applied.
        print("  - Running Production migrations (RPCs/Permissions)...")
        try:
            import subprocess
            migrate_script = data_pipeline_root / 'scripts' / 'migrate.py'
            cmd = [sys.executable, str(migrate_script), '--env', 'prod']
            subprocess.check_call(cmd)
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to run production migrations: {e}")

        # ---------------------------------------------------------
        # B3. Function Auto-Redeploy (The "Code" Phase) - MOVED HERE
        # ---------------------------------------------------------
        # We re-apply their definitions NOW, after tables are in Public.
        # This ensures they bind to the NEW Public tables.
        
        print("  - Auto-Redeploying Functions from Migrations...")
        
        # Re-get cursor just in case
        cur = conn.cursor()
        
        migrations_dir = data_pipeline_root / 'migrations'
        sql_files = sorted([f for f in migrations_dir.glob('*.sql')])
        
        functions_redefined = 0
        cur.execute("SET search_path TO prod;")
        
        for sql_file in sql_files:
            with open(sql_file, 'r') as f:
                content = f.read()
                
            if "CREATE OR REPLACE FUNCTION" in content.upper():
                try:
                    cur.execute(content)
                    functions_redefined += 1
                except Exception as e:
                    print(f"    ⚠ Warning: Failed to re-apply {sql_file.name}: {e}")
                    pass

        print(f"    ✔ Re-defined functions from {functions_redefined} migration files.")
        conn.commit()

        # C. Re-create Staging (Fresh Schema via Migrate)
        # Since we moved the tables out, 'staging' schema is now empty (or contains leftovers).
        print("  - Re-building Staging environment...")
        try:
            cmd = [sys.executable, str(migrate_script), '--env', 'staging']
            subprocess.check_call(cmd)
        except subprocess.CalledProcessError as e:
            raise Exception(f"Failed to rebuild staging: {e}")

        # D. Sync Back: Prod -> Staging (Persistent Staging)
        print("  - Syncing data back: Prod -> Staging...")
        
        cur = conn.cursor() # Reuse connection
        
        # Define correct dependency order for population
        sync_order = ['areas', 'historical_periods', 'period_areas', 'events', 'schema_migrations']
        
        for t in sync_order:
            # Skip if table wasn't in our core list
            if t not in tables: continue
            
            print(f"    - Syncing {t}...")
            source = f'prod."{t}"'
            dest = f'staging."{t}"'
            
            # Simple Insert Select
            # We assume schemas are identical since we just ran migrations on both.
            cur.execute(f'TRUNCATE {dest} CASCADE;')
            
            # Fetch columns that are NOT generated (STORED)
            # This is critical for tables like 'events' with generated Lat/Lng
            cur.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'prod' 
                  AND table_name = %s 
                  AND is_generated = 'NEVER';
            """, (t,))
            cols = [r[0] for r in cur.fetchall()]
            
            if not cols:
                print(f"      ⚠ No syncable columns found for {t}")
                continue

            cols_str = ", ".join(f'"{c}"' for c in cols)
            
            # Build Select Expression with Casting for Enums
            select_parts = []
            for c in cols:
                if c == 'granularity':
                    select_parts.append(f'"{c}"::text::staging.granularity_type')
                elif c == 'certainty':
                    select_parts.append(f'"{c}"::text::staging.certainty_type')
                else:
                    select_parts.append(f'"{c}"')
            
            select_str = ", ".join(select_parts)
            
            sql = f'INSERT INTO {dest} ({cols_str}) SELECT {select_str} FROM {source};'
            cur.execute(sql)
            
            cur.execute(f"SELECT count(*) FROM {dest};")
            cnt = cur.fetchone()[0]
            print(f"      ✔ Copied {cnt} rows.")
 
        conn.commit()
        # Final Step: Notify PostgREST to reload schema cache
        print("  - Notifying PostgREST to reload schema...")
        cur.execute("NOTIFY pgrst, 'reload schema';")
        conn.commit()
        
        print("✅ Promotion & Persistence Sync Successful!")
        
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
