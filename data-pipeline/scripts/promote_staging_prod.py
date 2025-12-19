import os
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

        # Order matters for FKs: period_areas depends on areas & historical_periods
        # We rename everything to _backup, then _staging to prod.
        
        # A. Backup Current Prod
        print("  - Backing up current Prod tables...")
        for t in tables:
            cur.execute(f"DROP TABLE IF EXISTS {t}_backup CASCADE;")
            cur.execute(f"ALTER TABLE {t} RENAME TO {t}_backup;")

        # B. Promote Staging
        print("  - Promoting Staging tables...")
        for t in tables:
            cur.execute(f"ALTER TABLE {t}_staging RENAME TO {t};")
        
        # COMMIT the Atomic Swap now.
        # This releases locks so that migrate.py can run without blocking/timeout.
        conn.commit()
        print("✅ Atomic Swap Committed.")

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
            
            # Get insertable columns (exclude generated)
            cur.execute(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = '{t}' 
                  AND is_generated = 'NEVER';
            """)
            columns = [row[0] for row in cur.fetchall()]
            
            if not columns:
                print(f"      Warning: No insertable columns for {t}, skipping copy.")
                continue
                
            cols_str = ", ".join([f'"{c}"' for c in columns])
            
            # Copy from PROD (which is now the table 't') to STAGING ('t_staging')
            query = f'INSERT INTO {t}_staging ({cols_str}) SELECT {cols_str} FROM {t};'
            cur.execute(query)
            
            cur.execute(f"SELECT count(*) FROM {t}_staging;")
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
