import random
import os
import json
import sys
from collections import Counter

# 添加项目根目录到 sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

# 尝试导入，如果缺少依赖则给出提示
try:
    from src.lib.time_normalizer import normalize_time
    from src.lib.scorer import calculate_importance # 使用刚写的 scorer
except ImportError as e:
    print(f"❌ Import Error: {e}")
    print("Ensure you are running this from 'data-pipeline/src/backfill/' or check your python path.")
    sys.exit(1)

# --- 配置 ---
INPUT_FILE = os.path.join(os.path.dirname(__file__), "../../data/raw/dbpedia_snapshot.json")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "../../data/processed/events_clean.json")

# 统计计数器
stats = Counter()

def process_event(raw_item, index, debug=False):
    """
    带 Debug 信息的处理函数
    """
    # 1. 检查 Title
    title = raw_item.get('label', {}).get('value')
    if not title:
        stats['missing_title'] += 1
        if debug: print(f"   [Item {index}] ❌ Missing Title. Keys found: {list(raw_item.keys())}")
        return None

    # 2. 检查 Date
    raw_date = raw_item.get('date', {}).get('value')
    if not raw_date:
        stats['missing_date_field'] += 1
        if debug: print(f"   [Item {index}] ❌ Missing Date field. Title: {title}")
        return None

    # 调用时间清洗
    try:
        time_data = normalize_time(raw_date)
    except Exception as e:
        stats['time_normalization_crash'] += 1
        if debug: print(f"   [Item {index}] ❌ Time Normalizer Crashed: {e} | Raw: {raw_date}")
        return None

    if not time_data:
        stats['invalid_date_format'] += 1
        if debug: print(f"   [Item {index}] ❌ Date Invalid (Parser returned None). Raw: {raw_date}")
        return None

    # 3. 检查 Coordinates
    # 注意：这里打印具体的取值尝试
    raw_lat_obj = raw_item.get('lat', {})
    raw_lng_obj = raw_item.get('long', {})
    
    raw_lat = raw_lat_obj.get('value')
    raw_lng = raw_lng_obj.get('value')
    
    if not raw_lat or not raw_lng:
        stats['missing_coordinates'] += 1
        if debug: 
            print(f"   [Item {index}] ❌ Missing Geo. Lat: {raw_lat}, Lng: {raw_lng} | Title: {title}")
            # 打印一下 raw_item 看看是不是字段名不对
            # print(f"Dump: {json.dumps(raw_item, indent=2)}") 
        return None

    try:
        lat = float(raw_lat)
        lng = float(raw_lng)
    except ValueError:
        stats['geo_parse_error'] += 1
        return None
        
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        stats['geo_out_of_bounds'] += 1
        return None

    # 4. 生成 ID
    uri = raw_item.get('event', {}).get('value', '')
    slug = uri.split('/')[-1] if uri else f"unknown_{index}"
    source_id = f"dbpedia:{slug}"

    # 5. 计算 Score (使用新字段或兜底)
    # 获取我们在 fetch_raw.py 中新增的字段
    abstract = raw_item.get('abstract', {}).get('value', '')
    page_length = raw_item.get('length', {}).get('value') # 可能为 None

    # 如果没有 page_length，用 abstract 长度兜底
    if not page_length:
        page_length = len(abstract) if abstract else 0
    
    # importance = calculate_importance(page_length)
    importance = random.randint(1, 10)  # 临时使用随机分数，待 scorer 完善后替换

    # 6. 构造对象
    return {
        "source_id": source_id,
        "title": title,
        "summary": abstract[:300] + "..." if len(abstract) > 300 else f"Historical event: {title}",
        "image_url": "", 
        "start": {
            "year": time_data['year'],
            "month": time_data['month'],
            "day": time_data['day'],
            "astro_year": time_data['astro_year'],
            "precision": time_data['precision']
        },
        "location": {
            "lat": lat,
            "lng": lng,
            "placeName": "Unknown", # 后续可用逆地理编码填充
            "granularity": "spot",
            "certainty": "definite"
        },
        "importance": importance, 
        "sources": [
            {"label": "DBpedia", "url": uri, "provider": "dbpedia"}
        ],
        "pipeline": {
            "fetchedAt": "2024-03-20",
            "version": 1
        }
    }

def run():
    print(f"🚀 Starting Data Processing (Debug Mode)...")
    print(f"   Input: {INPUT_FILE}")
    
    if not os.path.exists(INPUT_FILE):
        print("❌ Input file not found! Please run 1_fetch_raw.py first.")
        return

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        try:
            raw_data = json.load(f)
        except json.JSONDecodeError:
            print("❌ Invalid JSON file.")
            return
    
    total_items = len(raw_data)
    print(f"   Loaded {total_items} raw items.")
    
    # --- DEBUG: 打印第一条数据结构，确认字段名 ---
    if total_items > 0:
        print("\n🔎 INSPECTING FIRST ITEM STRUCTURE:")
        print(json.dumps(raw_data[0], indent=2, ensure_ascii=False))
        print("-" * 50)
    # -------------------------------------------

    clean_events = []
    
    for i, item in enumerate(raw_data):
        # 修正：使用 sum(stats.values()) 兼容 Python < 3.10
        show_debug = sum(stats.values()) < 5 
        
        event = process_event(item, i, debug=show_debug)
        
        if event:
            clean_events.append(event)
            
    # Save processed data
    if clean_events:
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(clean_events, f, indent=2, ensure_ascii=False)
    
    print("\n" + "="*30)
    print(f"✅ Processing Complete!")
    print(f"   Total Input:   {total_items}")
    print(f"   Valid Events:  {len(clean_events)}")
    print(f"   Discarded:     {total_items - len(clean_events)}")
    print("="*30)
    print("📉 Failure Statistics (Why did it fail?):")
    for reason, count in stats.items():
        print(f"   - {reason}: {count}")
    print("="*30)

    if len(clean_events) == 0:
        print("⚠️  Still 0 events? Check the 'INSPECTING FIRST ITEM' section above.")
        print("    Does it have 'lat', 'long', 'date' structure as expected?")

if __name__ == "__main__":
    run()