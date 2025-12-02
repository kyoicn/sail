import os
import json
import sys

# 添加项目根目录到 sys.path 以便导入 src.lib
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from src.lib.time_normalizer import normalize_time
from src.lib.geo_normalizer import normalize_geo

# --- 配置 ---
INPUT_FILE = os.path.join(os.path.dirname(__file__), "../../data/raw/dbpedia_snapshot.json")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "../../data/processed/events_clean.json")

def process_event(raw_item):
    """
    将 DBpedia 原始数据转换为 Sail M3 EventData 结构
    """
    try:
        # 1. 提取基础字段
        # DBpedia JSON 结构: item['label']['value']
        title = raw_item.get('label', {}).get('value')
        if not title: return None

        # 2. 清洗时间
        raw_date = raw_item.get('date', {}).get('value')
        time_data = normalize_time(raw_date)
        if not time_data: 
            return None # 必须有时间

        # 3. 清洗坐标
        # 注意：上一版脚本我们分别获取了 lat/long，或者获取了 wkt
        # 你的 raw data 结构取决于 1_fetch_raw.py 的 SELECT
        # 假设是 lat/long 分开的字段:
        raw_lat = raw_item.get('lat', {}).get('value')
        raw_lng = raw_item.get('long', {}).get('value')
        
        # 构造 WKT 或直接使用数值
        if not raw_lat or not raw_lng:
            return None
            
        lat = float(raw_lat)
        lng = float(raw_lng)
        
        # 简单的范围校验
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return None

        # 4. 生成 ID (Source ID)
        # 从 URI 提取: http://dbpedia.org/resource/Battle_of_Waterloo -> dbpedia:Battle_of_Waterloo
        uri = raw_item.get('event', {}).get('value', '')
        slug = uri.split('/')[-1]
        source_id = f"dbpedia:{slug}"

        # 5. 构造最终对象 (符合 types/index.ts 定义)
        return {
            "source_id": source_id,
            "title": title,
            "summary": f"Historical event: {title}", # 暂无摘要，后续可用 LLM 填充
            "image_url": "", 
            
            # M3 时间结构
            "start": {
                "year": time_data['year'],
                "month": time_data['month'],
                "day": time_data['day'],
                "astro_year": time_data['astro_year'],
                "precision": time_data['precision']
            },
            
            # 空间结构
            "location": {
                "lat": lat,
                "lng": lng,
                "placeName": "Unknown",
                "granularity": "spot",
                "certainty": "definite"
            },
            
            # 默认评分 (待优化)
            "importance": 1, 
            
            "sources": [
                {"label": "DBpedia", "url": uri, "provider": "dbpedia"}
            ],
            
            "pipeline": {
                "fetchedAt": "2024-03-20", # 示例，实际应为当前时间
                "version": 1
            }
        }

    except Exception as e:
        # print(f"Skipping item due to error: {e}")
        return None

def run():
    print(f"🚀 Starting Data Processing...")
    print(f"   Input: {INPUT_FILE}")
    
    if not os.path.exists(INPUT_FILE):
        print("❌ Input file not found! Please run 1_fetch_raw.py first.")
        return

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
    
    print(f"   Loaded {len(raw_data)} raw items.")
    
    clean_events = []
    skipped_count = 0
    
    for item in raw_data:
        event = process_event(item)
        if event:
            clean_events.append(event)
        else:
            skipped_count += 1
            
    # Save processed data
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(clean_events, f, indent=2, ensure_ascii=False)
        
    print(f"✅ Processing Complete!")
    print(f"   Valid Events: {len(clean_events)}")
    print(f"   Skipped/Invalid: {skipped_count}")
    print(f"   Saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    run()