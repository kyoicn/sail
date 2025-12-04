import os
import json
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# --- 配置 ---
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL") 
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
print(f"Using Supabase URL: {SUPABASE_URL}")
print(f"Using Supabase Key: {'Set' if SUPABASE_KEY else 'Not Set'}")

INPUT_FILENAME = "events_clean.json"
TABLE_NAME = "events_dev" 

INPUT_FILE = os.path.join(os.path.dirname(__file__), "../../data/processed/", INPUT_FILENAME)
BATCH_SIZE = 500

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Error: Missing Supabase Credentials.")
        print("   Please create a '.env' file with SUPABASE_URL and SUPABASE_SERVICE_KEY.")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def upload_batch(supabase, batch):
    db_records = []
    
    for item in batch:
        try:
            loc = item.get("location", {})
            start = item.get("start", {})
            
            record = {
                # --- 核心主键 (用于 Upsert 去重) ---
                "source_id": item["source_id"], # 现在我们确信表里有这个字段了
                
                # 基础信息
                "title": item["title"],
                "summary": item["summary"],
                "image_url": item.get("image_url"),
                
                # 时间 (Display)
                "start_year": start.get("year"),
                "end_year": None, 
                "precision": start.get("precision"),
                
                # 时间 (Compute)
                "start_astro_year": start.get("astro_year"),
                "end_astro_year": None,
                
                # 完整时间对象 (JSONB)
                "start_time_body": start,
                "end_time_body": None,
                
                # 空间 (PostGIS)
                "location": f"POINT({loc['lng']} {loc['lat']})",
                
                # 空间元数据 (扁平化)
                "place_name": loc.get("placeName"),
                "granularity": loc.get("granularity"),
                "certainty": loc.get("certainty"),
                "region_id": loc.get("regionId"),
                
                # 其他
                "importance": item["importance"],
                "sources": item["sources"], 
                "pipeline": item.get("pipeline", {})
            }
            
            db_records.append(record)
            
        except Exception as e:
            print(f"⚠️ Skipping item {item.get('title', 'Unknown')}: {e}")

    if not db_records:
        return

    # --- 执行 Upsert ---
    try:
        # on_conflict="source_id": 如果 source_id 已存在，则更新该行，否则插入。
        # ignore_duplicates=False: 我们希望更新（Update），例如更新了评分算法后想刷新数据。
        data = supabase.table(TABLE_NAME).upsert(
            db_records, 
            on_conflict="source_id"
        ).execute()
        
    except Exception as e:
        print(f"❌ Batch Upload Failed: {e}")

def run():
    print(f"🚀 Starting Upload to Supabase [{TABLE_NAME}]...")
    
    if not os.path.exists(INPUT_FILE):
        print("❌ Clean data not found. Run 2_process_data.py first.")
        return

    supabase = get_supabase()

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        events = json.load(f)
        
    raw_count = len(events)
    print(f"   Loaded {raw_count} events from JSON.")
    
    # --- 关键修复：基于 source_id 全局去重 ---
    # 使用字典推导式：后出现的会覆盖先出现的，确保 ID 唯一
    unique_events_map = {e["source_id"]: e for e in events}
    unique_events = list(unique_events_map.values())
    
    deduped_count = len(unique_events)
    print(f"   🧹 Deduplication: Removed {raw_count - deduped_count} duplicates.")
    print(f"   🎯 Final Target: {deduped_count} unique events.")
    # -------------------------------------
    
    # 使用去重后的 unique_events 进行批量上传
    for i in range(0, deduped_count, BATCH_SIZE):
        batch = unique_events[i : i + BATCH_SIZE]
        print(f"   📤 Uploading {i} - {min(i+BATCH_SIZE, deduped_count)}...", end="", flush=True)
        upload_batch(supabase, batch)
        print(" ✅")

    print(f"✨ Upload Complete!")

if __name__ == "__main__":
    run()