import sys
from pathlib import Path
from typing import List

# Setup Environment
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
sys.path.append(str(data_pipeline_root))

from shared.models import HistoricalPeriodModel
from shared.populator_base import BasePopulator

class PeriodPopulator(BasePopulator[HistoricalPeriodModel]):
    def __init__(self):
        super().__init__(HistoricalPeriodModel, "periods", "historical_periods")

    def populate(self, items: List[HistoricalPeriodModel], instance: str, existing_policy: str):
        conn = self.get_connection()
        cur = conn.cursor()

        suffix = "" if instance == 'prod' else f"_{instance}"
        table_areas = f"areas{suffix}"
        table_periods = f"historical_periods{suffix}"
        table_period_areas = f"period_areas{suffix}"

        print(f"Targeting tables: {table_periods}, {table_period_areas} (linking to {table_areas})")

        try:
            print(f"Processing {len(items)} Periods...")
            total_periods = len(items)
            stats = {
                "total": total_periods,
                "inserted": 0,
                "updated": 0,
                "skipped": 0,
                "warnings": 0,
                "errors": 0
            }

            for index, period in enumerate(items, 1):
                print(f"[{index}/{total_periods}] Processing period: {period.period_id}")

                # 1. Validate Primary Areas Existence BEFORE any db modification
                valid_primary = True
                missing_ids = []
                for pa_id in period.primary_area_ids:
                     cur.execute(f"SELECT 1 FROM {table_areas} WHERE area_id = %s", (pa_id,))
                     if not cur.fetchone():
                         valid_primary = False
                         missing_ids.append(pa_id)
                
                if not valid_primary:
                    print(f"  [SKIP-INVALID] Missing primary area(s) {missing_ids}. Cannot insert period.")
                    stats["skipped"] += 1
                    continue

                # Check existence for warning
                cur.execute(f"SELECT id FROM {table_periods} WHERE period_id = %s", (period.period_id,))
                exists = cur.fetchone()
                if exists:
                    if existing_policy == 'skip':
                        print(f"  [INFO] Skipping existing period: {period.period_id}")
                        stats["skipped"] += 1
                        continue
                    print(f"  [WARN] Overwriting existing period: {period.period_id}")

                cur.execute(f"""
                    INSERT INTO {table_periods} (period_id, display_name, description, start_astro_year, end_astro_year, importance)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (period_id) DO UPDATE SET
                        display_name = EXCLUDED.display_name,
                        description = EXCLUDED.description,
                        start_astro_year = EXCLUDED.start_astro_year,
                        end_astro_year = EXCLUDED.end_astro_year,
                        importance = EXCLUDED.importance
                    RETURNING id;
                """, (period.period_id, period.display_name, period.description, period.start_astro_year, period.end_astro_year, period.importance))
                
                period_db_id = cur.fetchone()[0]

                if exists:
                    stats["updated"] += 1
                else:
                    stats["inserted"] += 1

                # Handle Junctions
                cur.execute(f"DELETE FROM {table_period_areas} WHERE period_id = %s", (period_db_id,))
                
                # Insert Primary Areas
                for area_slug in period.primary_area_ids:
                    cur.execute(f"SELECT id FROM {table_areas} WHERE area_id = %s", (area_slug,))
                    res = cur.fetchone()
                    if res:
                        area_db_id = res[0]
                        cur.execute(f"""
                            INSERT INTO {table_period_areas} (period_id, area_id, role)
                            VALUES (%s, %s, 'primary')
                            ON CONFLICT (period_id, area_id) DO UPDATE SET role = 'primary'
                        """, (period_db_id, area_db_id))
                    else:
                        print(f"  [WARN] Primary Area '{area_slug}' not found for period '{period.period_id}'")
                        stats["warnings"] += 1

                # Insert Associated Areas
                for area_slug in period.associated_area_ids:
                    if area_slug in period.primary_area_ids:
                        continue # specific area is already primary

                    cur.execute(f"SELECT id FROM {table_areas} WHERE area_id = %s", (area_slug,))
                    res = cur.fetchone()
                    if res:
                        area_db_id = res[0]
                        cur.execute(f"""
                            INSERT INTO {table_period_areas} (period_id, area_id, role)
                            VALUES (%s, %s, 'associated')
                            ON CONFLICT (period_id, area_id) DO UPDATE SET role = 'associated'
                        """, (period_db_id, area_db_id))
                    else:
                        print(f"  [WARN] Associated Area '{area_slug}' not found for period '{period.period_id}'")
                        stats["warnings"] += 1

            conn.commit()
            
            print("\n" + "="*40)
            print("PROCESSING SUMMARY")
            print("="*40)
            print(f"Total Periods Processed: {stats['total']}")
            print(f"✅ inserted:              {stats['inserted']}")
            print(f"⚠️  Updated (Overwritten): {stats['updated']}")
            print(f"⏭️  Skipped:               {stats['skipped']}")
            print(f"🔸 Warnings:              {stats['warnings']}")
            print(f"❌ Errors:                {stats['errors']}")
            print("="*40 + "\n")
            print("✅ Periods population complete.")

        except Exception as e:
            conn.rollback()
            print(f"❌ Error: {e}")
            raise e
        finally:
            cur.close()
            conn.close()

if __name__ == "__main__":
    PeriodPopulator().run()
