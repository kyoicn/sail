"""
Script: generate_area_data.py
Description:
    Downloads vector boundaries from Natural Earth, custom sources, OR generates them via LLM (Ollama/Gemini).
    Optimizes them for web display (filtering small islands, simplifying geometry), and outputs a Sail-compatible JSON file.

Detailed Parameter Guide:
    --dataset (default: 'country'):
        * 'country': Modern Sovereign States (Admin 0).
        * 'state': Provinces/States (Admin 1).
        * 'marine': Oceans, Seas, Bays.
        * 'region': Physical Continents/Regions.
        * 'custom': fetch from any GeoJSON I/O URL.
        * 'local_ollama': Generate via local Ollama instance.
        * 'gemini_api': Generate via Google Gemini API.

    --query:
        * For Non-LLM datasets: "KEY:VALUE" (e.g., "ISO_A3:USA", "name:California").
          Default key is 'ISO_A3' if separator ':' is missing.
          Supported Keys (Natural Earth):
            - country: ISO_A3, NAME, ADM0_A3, SOVEREIGNT
            - state: name, postal, adm0_a3
            - marine: name, scalerank
            - region: name, region
        * For LLM datasets: The prompt description (e.g., "Qing Dynasty in 1820").

    --query_file:
        Path to a JSON file containing a list of queries for batch processing.
        Schema: { "queries": [ { "query": "...", "area_id": "...", "display_name": "...", "description": "..." } ] }
        Useful for bulk generating historical borders via LLMs.
        NOTE: If provided, this takes precedence over --query, --area_id, --display_name, and --description. These arguments will be ignored.

    --area_id:
        Unique identifier for the area (e.g., 'usa', 'qing_1820').

    --description:
        A text description of the area's historical or geographical context.

    --display_name:
        The human-readable name shown in the application UI.

    --simplify (default: 0.05):
        RDP Tolerance in degrees. Higher = rougher.

    --filter_area (default: 0.05):
        Min area (sq degrees) to keep.

    --buffer (float, default 0.0):
        Expand (positive) or Shrink (negative) by degrees.
        Uses Shapely for robust boolean union (merges overlaps).
        * 0.5 (~55km) works gracefully by merging islands.

    --round (int, default 0):
        Resolution of rounded corners (if buffer != 0).
        Higher = more vertices in curves.
        
    --model (default: 'llama3' for ollama, 'gemini-3-flash-preview' for gemini):
        The specific LLM model to use.

    --api_key:
        API Key for Gemini (defaults to GOOGLE_API_KEY env var).

Usage Examples:
    # 1. Standard download from Natural Earth
    python generate_area_data.py --query "ISO_A3:JPN" --buffer 0.5 --filter_area 0.5

    # 2. Single LLM Generation (Interactive)
    python generate_area_data.py --dataset gemini_api --query "Roman Empire at its height" --area_id roman_empire

    # 3. Batch LLM Generation (Sophisticated)
    #    Generates multiple historical dynasties from a file, using Gemini to hallucinate boundaries,
    #    then heavily optimizes geometry (simplify 0.1) and merges small islands (buffer 0.5) to create clean, smooth regions.
    python generate_area_data.py --dataset gemini_api --query_file dynasty_queries.json --simplify 0.1 --buffer 0.5 --round 2
"""

import os
import re
import json
import requests
import math
import argparse
import sys
from pathlib import Path
from shapely.geometry import shape, mapping, MultiPolygon, Polygon
from shapely.ops import unary_union

# Load environment variables
from dotenv import load_dotenv
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
load_dotenv(data_pipeline_root / '.env')
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")

# Optional Imports
try:
    import ollama
except ImportError:
    ollama = None

try:
    from google import genai
except ImportError:
    genai = None

# --- Imports for Models ---
if str(data_pipeline_root) not in sys.path:
    sys.path.append(str(data_pipeline_root))

from shared.models import AreaModel

# Natural Earth 10m Admin 0 Countries
SOURCES = {
    "country": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_0_countries.json",
    "state": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_1_states_provinces.json",
    "marine": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/physical/ne_10m_geography_marine_polys.json",
    "region": "https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/physical/ne_10m_geography_regions_polys.json"
}

SYSTEM_PROMPT_AREA = """
You are a Historical GIS Expert.
Your task is to generate a valid GeoJSON FeatureCollection containing a single Polygon representing the approximate administrative boundaries of the requested historical entity based on the query.

### QUERY: {query}

### INSTRUCTIONS:
1. Interpret the query to determine the historical entity and time period (if implied).
2. Generate a **simplified** Polygon representing the area.
3. The polygon should have 100 or more vertices to ensure decent resolution without hitting token limits.
4. Use WGS84 coordinates (longitude, latitude).
5. Ensure the polygon is closed (first and last coordinate are identical).
6. RETURN ONLY VALID JSON. Do not include markdown code blocks if possible, or ensure they are easily parsable.

### RESPONSE FORMAT:
```json
{{
  "type": "FeatureCollection",
  "features": [
    {{
      "type": "Feature",
      "properties": {{
        "name": "{query}"
      }},
      "geometry": {{
        "type": "Polygon",
        "coordinates": [
          [
            [lng, lat],
            [lng, lat],
            ...
          ]
        ]
      }}
    }}
  ]
}}
```
"""

# Load Gemini Model Limits from shared package
GEMINI_MODELS = {}
try:
    repo_root = data_pipeline_root.parent
    shared_json_path = repo_root / "packages" / "shared" / "src" / "gemini-models.json"
    with open(shared_json_path, 'r') as f:
        GEMINI_MODELS = json.load(f)
except Exception as e:
    print(f"⚠️ Warning: Could not load shared gemini-models.json: {e}")
    GEMINI_MODELS = {"default": {"rpm": 10, "tpm": 10000}}

class RateLimiter:
    def __init__(self, rpm=0, tpm=0):
        self.rpm = float(rpm)
        self.tpm = float(tpm)
        self.history = [] # List of (timestamp, tokens)

    def set_limits(self, rpm, tpm):
        self.rpm = float(rpm)
        self.tpm = float(tpm)
        print(f"💎 Rate Limiter Updated: RPM={self.rpm}, TPM={self.tpm}")

    def wait_if_needed(self, estimated_tokens=0):
        if not self.rpm and not self.tpm:
            return

        now = time.time()
        # Prune history older than 60s
        self.history = [(ts, tok) for ts, tok in self.history if now - ts < 60]

        # Check RPM
        if self.rpm > 0:
            if len(self.history) >= self.rpm:
                # Wait until the oldest request expires
                oldest_ts = self.history[0][0]
                wait_time = 60 - (now - oldest_ts) + 0.1
                if wait_time > 0:
                    print(f"⏳ Rate Limit (RPM): Waiting {wait_time:.1f}s...")
                    time.sleep(wait_time)
                    # Re-prune after sleep
                    self.wait_if_needed(estimated_tokens)
                    return

        # Check TPM
        if self.tpm > 0:
            current_tokens = sum(tok for _, tok in self.history)
            if current_tokens + estimated_tokens > self.tpm:
                 # Should theoretically wait, but TPM is trickier as tokens vary.
                 # Strategy: Wait for oldest to expire to free up space.
                 # If we are stuck (single request > TPM), we might deadlock, but assuming limits are reasonable.
                 if self.history:
                     oldest_ts = self.history[0][0]
                     wait_time = 60 - (now - oldest_ts) + 0.1
                     if wait_time > 0:
                        print(f"⏳ Rate Limit (TPM): Waiting {wait_time:.1f}s...")
                        time.sleep(wait_time)
                        self.wait_if_needed(estimated_tokens)
                        return

    def record_usage(self, tokens):
        self.history.append((time.time(), tokens))

# Global Rate Limiter Instance
gemini_rate_limiter = RateLimiter(
    rpm=os.environ.get("GEMINI_API_RPM", GEMINI_MODELS.get("default", {}).get("rpm", 10)),
    tpm=os.environ.get("GEMINI_API_TPM", GEMINI_MODELS.get("default", {}).get("tpm", 10000))
)

def generate_with_llm(query, provider, model, api_key=None, timeout=None):
    print(f"🤖 Generating area for '{query}' using {provider} ({model})...")
    
    # Rate Limiting for Gemini
    if provider == 'gemini':
        # Automatically update limits based on model
        limits = GEMINI_MODELS.get(model, GEMINI_MODELS.get("default"))
        gemini_rate_limiter.set_limits(limits['rpm'], limits['tpm'])
        
        # Estimate: Input prompt is roughly ~300 tokens? 
        gemini_rate_limiter.wait_if_needed(estimated_tokens=300)

    prompt = SYSTEM_PROMPT_AREA.format(query=query)
    content = ""
    
    max_retries = 3
    current_try = 0
    
    while current_try < max_retries:
        try:
            if provider == 'ollama':
                if not ollama:
                    print("❌ Error: 'ollama' library not installed.")
                    return None
                
                # Ollama client doesn't support timeout in constructor easily without custom transport, 
                # but usually local instance is fast or stable.
                # We can set environment variable OLLAMA_TIMEOUT if needed outside script.
                client = ollama.Client(host=OLLAMA_HOST)
                response = client.chat(
                    model=model,
                    messages=[{'role': 'user', 'content': prompt}]
                )
                content = response['message']['content']
                break # Success
                
            elif provider == 'gemini':
                if not genai:
                    print("❌ Error: 'google-genai' library not installed.")
                    return None
                
                final_api_key = api_key or os.environ.get("GOOGLE_API_KEY")
                if not final_api_key:
                     print("❌ Error: GOOGLE_API_KEY not found.")
                     return None
                     
                # Configure Client with Timeout
                # Note: exact syntax depends on SDK version, assuming new google-genai
                client_kwargs = {'api_key': final_api_key}
                if timeout:
                    # Try setting http_options for timeout
                    # NOTE: google-genai expects timeout in MILLISECONDS
                    client_kwargs['http_options'] = {'timeout': timeout * 1000}

                client = genai.Client(**client_kwargs)
                
                response = client.models.generate_content(
                    model=model, 
                    contents=prompt
                )
                
                # Handle multi-part responses (e.g. from models with "thought" capabilities)
                # This avoids the "warning: non-text parts" message
                content = ""
                if response.candidates and response.candidates[0].content.parts:
                    for part in response.candidates[0].content.parts:
                        if hasattr(part, 'text') and part.text:
                            content += part.text
                
                # Fallback to .text if parts extraction yielded nothing (unlikely)
                if not content: 
                     content = response.text
                
                # Try to get token usage if available (Client-dependent)
                # Google GenAI usually returns usage_metadata
                used_tokens = 0
                if hasattr(response, 'usage_metadata'):
                     used_tokens = response.usage_metadata.total_token_count
                else:
                     # Fallback estimate: 1 token ~ 4 chars
                     used_tokens = len(content) // 4
                
                gemini_rate_limiter.record_usage(used_tokens)
                
                break # Success

        except Exception as e:
            print(f"\n⚠️  Generation Attempt {current_try + 1}/{max_retries} Failed.")
            print(f"    Error Type: {type(e).__name__}")
            print(f"    Message: {e}")
            print("    Traceback:")
            traceback.print_exc()
            
            current_try += 1
            if current_try >= max_retries:
                print(f"❌ All attempts failed.")
                return None
            import time
            time.sleep(2) # Brief wait before retry
    
    # Extract JSON
    json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    elif "```" in content:
         json_str = re.sub(r'```\s*|\s*```', '', content).strip()
    else:
        json_str = content

    try:
        data = json.loads(json_str)
        return data
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse JSON from LLM response: {e}")
        # print(f"Raw Content: {content[:500]}...") 
        return None

def fetch_and_optimize(dataset_key, query_string, area_id, display_name, min_area, tolerance, 
                       output_file=None, custom_url=None, buffer_deg=0.0, round_iter=0, description=None,
                       llm_model=None, api_key=None, timeout=None):
    
    # 1. Determine Source & Generate/Download
    source_data = None
    use_llm = dataset_key in ['local_ollama', 'gemini_api']
    
    if use_llm:
        provider = 'ollama' if dataset_key == 'local_ollama' else 'gemini'
        # Default models if not specified
        if not llm_model:
            llm_model = 'llama3' if provider == 'ollama' else 'gemini-3-flash-preview'
            
        # Treat the entire query string as the prompt/query
        source_data = generate_with_llm(query_string, provider, llm_model, api_key, timeout)
        
        if not source_data:
            return
            
        # Standardize to Feature
        if source_data.get('type') == 'FeatureCollection':
            if not source_data.get('features'):
                 print("❌ Error: LLM returned empty FeatureCollection")
                 return
            target_feature = source_data['features'][0]
        else:
            target_feature = source_data
            
    elif dataset_key == "custom":
        if not custom_url:
            print("❌ Error: --custom_url is required when dataset is 'custom'")
            return
        print(f"1. Downloading Data from {dataset_key} ({custom_url})....")
        try:
            resp = requests.get(custom_url)
            resp.raise_for_status()
            source_data = resp.json()
        except Exception as e:
            print(f"❌ Failed to download: {e}")
            return
    else:
        target_url = SOURCES.get(dataset_key)
        if not target_url:
             print(f"❌ Error: Unknown dataset '{dataset_key}'. Choices: {list(SOURCES.keys())}, custom, local_ollama, gemini_api")
             return

        print(f"1. Downloading Data from {dataset_key} ({target_url})....")
        try:
            resp = requests.get(target_url)
            resp.raise_for_status()
            source_data = resp.json()
        except Exception as e:
            print(f"❌ Failed to download: {e}")
            return

    # 2. Extract Feature (if not already found by LLM)
    # If LLM, we already extracted target_feature above to validate structure.
    if not use_llm:
        # Parse Query String (KEY:VALUE)
        if ":" in query_string:
            query_key, query_value = query_string.split(":", 1)
        else:
            query_key = "ISO_A3" # Default key
            query_value = query_string
            
        print(f"2. Searching for {query_key} = '{query_value}'...")
        target_feature = None
        q_val_str = str(query_value).lower().strip()
        
        # Handle FeatureCollection
        features = source_data.get('features', []) if isinstance(source_data, dict) else []
        
        for feature in features:
            props = feature.get('properties', {})
            prop_val = props.get(query_key)
            
            if prop_val is None:
                 pass 
            elif str(prop_val).lower().strip() == q_val_str:
                target_feature = feature
                break
            elif query_key == "ISO_A3" and (props.get('ADM0_A3') == query_value or props.get('ISO_A3') == query_value):
                 target_feature = feature
                 break

        if not target_feature:
            print(f"❌ Feature not found.")
            return

    # 3. Optimize with Shapely
    try:
        raw_geom = shape(target_feature['geometry'])
        
        # Valid / Cleaning
        if not raw_geom.is_valid:
            raw_geom = raw_geom.buffer(0)
            
        # Simplify (RDP)
        optimized = raw_geom.simplify(tolerance, preserve_topology=True)
        
        # Buffer (Soften/Expand/Merge)
        if buffer_deg != 0:
            resolution = 16 if round_iter > 0 else 4
            join = 1 if round_iter > 0 else 2
            optimized = optimized.buffer(buffer_deg, resolution=resolution, join_style=join)

        # Filter by Area (Remove small islands)
        parts = []
        if isinstance(optimized, MultiPolygon):
            parts = list(optimized.geoms)
        elif isinstance(optimized, Polygon):
            parts = [optimized]
        elif optimized.is_empty:
             parts = []
             
        filtered_parts = [p for p in parts if p.area >= min_area]
        
        if not filtered_parts:
            print(f"❌ Warning: Resulting geometry is empty (min_area filter too high?).")
            # If LLM, maybe we just take it as is if it's small?
            if use_llm and parts:
                 print("  Retaining LLM output despite small area.")
                 filtered_parts = parts
            else:
                 return

        final_shape = unary_union(filtered_parts) 
        if isinstance(final_shape, Polygon):
            final_shape = MultiPolygon([final_shape])

        # Stats
        total_verts_after = 0
        if not final_shape.is_empty:
             for p in final_shape.geoms:
                  total_verts_after += len(p.exterior.coords)
                  for interior in p.interiors:
                       total_verts_after += len(interior.coords)
        
        # Convert to Coordinates List for AreaModel
        final_polygons = mapping(final_shape)['coordinates']
        
        print(f"3. Optimization Results:")
        print(f"   - Polygons: {len(filtered_parts)}")
        print(f"   - Vertices: {total_verts_after}")

    except Exception as e:
        print(f"❌ Geometry Error: {e}")
        return

    # 4. Save
    if output_file:
        output_path = Path(output_file)
    else:
        output_path = Path(f"{area_id}.json")
    
    print(f"4. Saving to {output_path}...")

    areas_data = {"areas": []}
    if output_path.exists():
        try:
            with open(output_path, 'r') as f:
                content = json.load(f)
                if isinstance(content, dict) and "areas" in content:
                    areas_data = content
        except:
            pass
    
    found = False
    
    src_desc = f"LLM Generated via {dataset_key}" if use_llm else f"Source: {dataset_key}"
    final_description = description if description else f"{src_desc}. Optimized {total_verts_after} pts."
    
    try:
        area_model = AreaModel(
            area_id=area_id,
            display_name=display_name,
            description=final_description,
            geometry=final_polygons
        )
        new_entry = area_model.model_dump()
    except Exception as e:
        print(f"❌ Validation Error: {e}")
        return

    for i, area in enumerate(areas_data['areas']):
        if area.get('area_id') == area_id:
            areas_data['areas'][i] = new_entry
            found = True
            break
    
    if not found:
        areas_data['areas'].append(new_entry)

    if output_path.parent != Path('.'):
        output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(areas_data, f, indent=2)
    
    print(f"✅ Data saved successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch and Optimize Area Bounds (Shapely Powered)")
    parser.add_argument("--dataset", default="country", choices=["country", "state", "marine", "region", "custom", "local_ollama", "gemini_api"])
    parser.add_argument("--query", help="Query string. For standard datasets: 'KEY:VALUE' (e.g. ISO_A3:USA). For LLM: The prompt.")
    parser.add_argument("--query_file", help="Path to a JSON file containing a list of queries (AreaGenerationQuery schema).")
    parser.add_argument("--custom_url")
    parser.add_argument("--area_id")
    parser.add_argument("--display_name")
    parser.add_argument("--description", help="Custom description for the area.")
    parser.add_argument("--output")
    parser.add_argument("--simplify", type=float, default=0.05)
    parser.add_argument("--filter_area", type=float, default=0.05)
    parser.add_argument("--buffer", type=float, default=0.0)
    parser.add_argument("--round", type=int, default=0)
    
    parser.add_argument("--model", help="LLM model (e.g. llama3, gemini-3-flash-preview)")
    parser.add_argument("--api_key", help="API Key for Gemini (optional if env var set)")
    parser.add_argument("--timeout", type=int, default=600, help="Timeout in seconds for LLM calls (default: 600)")

    args = parser.parse_args()

    # BATCH MODE
    if args.query_file:
         print(f"📂 Batch Mode: Loading queries from {args.query_file}...")
         try:
             with open(args.query_file, 'r') as f:
                 data = json.load(f)
                 
             queries = data.get('queries', [])
             total_queries = len(queries)
             print(f"Found {total_queries} queries.")
             
             for i, item in enumerate(queries):
                 print(f"\n--- [{i+1}/{total_queries}] Processing: {item.get('display_name')} ({item.get('area_id')}) ---")
                 # Validate using Pydantic Model if possible, or just raw dict access
                 # from shared.models import AreaGenerationQuery
                 # q = AreaGenerationQuery(**item)
                 
                 fetch_and_optimize(
                    dataset_key=args.dataset, # Use global dataset provider for all
                    query_string=item.get('query'),
                    area_id=item.get('area_id'),
                    display_name=item.get('display_name'),
                    description=item.get('description'),
                    
                    # Pass through CLI options for geometry tuning
                    min_area=args.filter_area,
                    tolerance=args.simplify,
                    buffer_deg=args.buffer,
                    round_iter=args.round,
                    
                    output_file=args.output,
                    custom_url=args.custom_url,
                    llm_model=args.model,
                    api_key=args.api_key,
                    timeout=args.timeout
                 )
                 
         except Exception as e:
             print(f"❌ Batch Error: {e}")
             sys.exit(1)
             
    # SINGLE QUERY MODE
    else:
        # Interactive Mode Fallbacks
        if not args.query:
            prompt_label = "Enter Query (or Prompt)" 
            args.query = input(f"{prompt_label}: ").strip()
            
        if not args.area_id:
            args.area_id = input("Enter Target Area ID (slug): ").strip()
        if not args.display_name:
            args.display_name = input("Enter Display Name: ").strip()

        fetch_and_optimize(
            args.dataset, 
            args.query, 
            args.area_id, 
            args.display_name, 
            args.filter_area, 
            args.simplify, 
            args.output,
            args.custom_url,
            args.buffer,
            args.round,
            args.description,
            llm_model=args.model,
            api_key=args.api_key,
            timeout=args.timeout
        )
