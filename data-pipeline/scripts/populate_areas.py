import sys
from pathlib import Path
from typing import List

# Setup Environment
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
sys.path.append(str(data_pipeline_root))

from shared.models import AreaModel
from shared.populator_base import BasePopulator
from shared.utils import fix_dateline_geometry

class AreaPopulator(BasePopulator[AreaModel]):
    def __init__(self):
        super().__init__(AreaModel, "areas", "areas")

    def populate(self, items: List[AreaModel], instance: str, existing_policy: str):
        conn = self.get_connection()
        cur = conn.cursor()
        table_areas = self.get_table_name(instance)

        print(f"Targeting table: {table_areas}")

        try:
            print(f"Processing {len(items)} Areas...")
            skipped_count = 0
            updated_count = 0
            inserted_count = 0
            
            for area in items:
                # Check existence
                cur.execute(f"SELECT id FROM {table_areas} WHERE area_id = %s", (area.area_id,))
                exists = cur.fetchone()
                
                should_update = False
                if exists:
                    if existing_policy == 'skip':
                        print(f"  [SKIP] Area exists: {area.area_id}")
                        skipped_count += 1
                        continue
                    else:
                        print(f"  [OVERWRITE] Updating area: {area.area_id}")
                        should_update = True
                
                # Fix Geometry (Dateline splitting)
                try:
                    wkt_str = fix_dateline_geometry(area.geometry)
                except Exception as e:
                    print(f"  [ERROR] Failed to process geometry for {area.area_id}: {e}")
                    continue
                
                try:
                    cur.execute(f"""
                        INSERT INTO {table_areas} (area_id, display_name, description, geometry)
                        VALUES (%s, %s, %s, ST_GeogFromText(%s))
                        ON CONFLICT (area_id) DO UPDATE SET
                            display_name = EXCLUDED.display_name,
                            description = EXCLUDED.description,
                            geometry = EXCLUDED.geometry
                        RETURNING id;
                    """, (area.area_id, area.display_name, area.description, wkt_str))
                    
                    if should_update:
                        updated_count += 1
                    else:
                        inserted_count += 1
                except Exception as e:
                    print(f"  [DB ERROR] Failed to insert/update {area.area_id}: {e}")
                    continue

            conn.commit()
            print(f"✅ Areas population complete. (Inserted: {inserted_count}, Updated: {updated_count}, Skipped: {skipped_count})")

        except Exception as e:
            conn.rollback()
            print(f"❌ Error: {e}")
            raise e
        finally:
            cur.close()
            conn.close()

if __name__ == "__main__":
    AreaPopulator().run()
