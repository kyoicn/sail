import os
import json
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- 配置 ---
BATCH_SIZE = 1000
TOTAL_LIMIT = 10000
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(CURRENT_DIR, "../../data/raw/dbpedia_snapshot.json")

# DBpedia Endpoint
ENDPOINT_URL = "https://dbpedia.org/sparql"

def get_query(limit, offset):
    """
    Constructs a SUPER SIMPLE SPARQL query.
    Removed complex filters and sorting to avoid timeout.
    """
    return """
    PREFIX dbo: <http://dbpedia.org/ontology/>
    PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

    SELECT DISTINCT ?event ?label ?date ?lat ?long WHERE {
      # 限制类型为 "MilitaryConflict" (军事冲突)，因为 "Event" 类太大了
      ?event a dbo:MilitaryConflict ;
             rdfs:label ?label ;
             dbo:date ?date ;
             geo:lat ?lat ;
             geo:long ?long .
             
      FILTER (lang(?label) = 'en')
    }
    LIMIT %d
    OFFSET %d
    """ % (limit, offset)

def create_session():
    retry_strategy = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    http = requests.Session()
    http.mount("https://", adapter)
    http.mount("http://", adapter)
    return http

def run():
    print(f"🚀 Starting Raw Data Ingestion (Lite Mode)...")
    print(f"   Target: {TOTAL_LIMIT} events")
    print(f"   Output: {OUTPUT_FILE}")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    http = create_session()
    all_results = []
    offset = 0

    while offset < TOTAL_LIMIT:
        print(f"   📡 Fetching offset={offset}...", end="", flush=True)
        
        try:
            start_t = time.time()
            query = get_query(BATCH_SIZE, offset)
            
            response = http.get(
                ENDPOINT_URL, 
                params={'query': query, 'format': 'json'},
                headers={'User-Agent': 'Sail-App/0.1'},
                timeout=30
            )
            
            if response.status_code != 200:
                print(f" ❌ HTTP {response.status_code}")
                break

            data = response.json()
            bindings = data['results']['bindings']
            
            if not bindings:
                print(" [Empty Response]")
                break
                
            all_results.extend(bindings)
            print(f" ✅ Got {len(bindings)} ({time.time() - start_t:.2f}s)")
            
            offset += BATCH_SIZE
            time.sleep(0.5)

        except Exception as e:
            print(f" ❌ Exception: {e}")
            break

    # Save
    if len(all_results) > 0:
        print(f"💾 Saving {len(all_results)} items...")
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(all_results, f, indent=2, ensure_ascii=False)
        print(f"✨ Success!")
    else:
        print("⚠️ Failed to fetch data.")

if __name__ == "__main__":
    run()