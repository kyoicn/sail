import os
import sys
import psycopg2
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

def ensure_migration_table(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version text PRIMARY KEY,
            applied_at timestamptz DEFAULT now()
        );
    """)

def get_applied_migrations(cur):
    cur.execute("SELECT version FROM schema_migrations ORDER BY version ASC;")
    return {row[0] for row in cur.fetchall()}

def record_migration(cur, version):
    cur.execute("INSERT INTO schema_migrations (version) VALUES (%s);", (version,))

def run_migration_file(cur, filepath):
    print(f"Applying {filepath.name}...")
    with open(filepath, 'r') as f:
        sql = f.read()
    cur.execute(sql)

def main():
    conn = get_connection()
    conn.autocommit = False # Use transactions
    
    try:
        cur = conn.cursor()
        ensure_migration_table(cur)
        conn.commit()

        applied = get_applied_migrations(cur)
        
        migrations_dir = data_pipeline_root / 'migrations'
        if not migrations_dir.exists():
            print(f"Migrations directory not found: {migrations_dir}")
            sys.exit(1)

        # Get all .sql files, sorted
        migration_files = sorted(migrations_dir.glob('*.sql'))
        
        new_migrations_count = 0
        
        for mf in migration_files:
            version = mf.name # e.g. "001_initial_schema.sql"
            if version not in applied:
                try:
                    run_migration_file(cur, mf)
                    record_migration(cur, version)
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
        conn.close()
        sys.exit(1)

if __name__ == "__main__":
    main()
