"""
Script: generate_test_events.py
Description:
    Generates synthetic test data for events.
    
    Features:
    - Stage 1: Generates base events with strict duration constraints (no end time or <= 1 day).
    - Stage 2: Hierarchically groups events into "Container Events" based on temporal proximity.
    - Configurable container probability (--container_events).
    - Splits output into multiple files.
    
Detailed Parameter Guide:
    --total_events (int): 
        The number of base "atomic" events to generate initially. 
        Note: The final count of objects in the JSON output will be higher due to the 
        addition of "Container Events" wrapping these base events.

    --container_events (float): 
        The probability (0.0 - 1.0, default 0.2) of initiating a new container group 
        at any given position during the grouping passes.
        - Higher values (e.g., 0.5) create more frequent containers.
        - Lower values (e.g., 0.1) create fewer containers.

    --output (str): 
        The target directory where the generated JSON files will be saved.

    --tags (str), --collections (str): 
        Optional comma-separated lists of strings to append to the 'collections' 
        field of all generated events (useful for identifying test batches).

Usage Examples:
    # 1. Standard run (default grouping 0.2):
    python data-pipeline/scripts/generate_test_events.py --total_events 1000 --output data/test_v1

    # 2. Heavy grouping (creates deeply nested hierarchies):
    python data-pipeline/scripts/generate_test_events.py --total_events 500 --container_events 0.5

    # 3. Flat generation (no hierarchy, atomic events only):
    python data-pipeline/scripts/generate_test_events.py --total_events 2000 --container_events 0.0

    # 4. Tagged output for specific testing scenarios:
    python data-pipeline/scripts/generate_test_events.py --total_events 5000 --output data/stress_test --tags "stress,ci" --collections "load_test"
"""

import sys
import json
import random
import re
import argparse
import copy
from pathlib import Path
from typing import List, Optional

# Setup Environment to import shared.models
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
sys.path.append(str(data_pipeline_root))

from shared.models import EventSchema, TimeEntry, LocationEntry, Link

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

class EventWrapper:
    def __init__(self, event: EventSchema, temp_id: str, atomic_count: int = 1):
        self.event = event
        self.temp_id = temp_id
        self.atomic_count = atomic_count
        # We store children as temp_ids initially
        self.child_temp_ids = []
        # Final ID will be assigned after file distribution
        self.final_source_id = None

    @property
    def start_decimal(self):
        return calculate_decimal_year(self.event.start_time)

def calculate_decimal_year(te: TimeEntry) -> float:
    y = te.year
    m = te.month if te.month else 1
    d = te.day if te.day else 1
    h = te.hour if te.hour else 0
    # Approximate
    return y + (m - 1) / 12.0 + (d - 1) / 365.0 + h / (365.0 * 24.0)

def random_time() -> TimeEntry:
    # Range: -3000 BC to 2025 AD
    year = random.randint(-3000, 2025)
    precisions = ["year", "month", "day", "hour", "minute"]
    precision = random.choice(precisions)
    
    month = random.randint(1, 12) if precision != "year" else None
    day = random.randint(1, 28) if precision in ["day", "hour", "minute"] else None 
    hour = random.randint(0, 23) if precision in ["hour", "minute"] else None
    
    return TimeEntry(
        year=year,
        month=month,
        day=day,
        hour=hour,
        precision=precision
    )

def add_short_duration(start: TimeEntry) -> Optional[TimeEntry]:
    """
    Returns an end time strictly within 1 day of start time, or None.
    """
    # 80% chance to have NO end time (point event)
    if random.random() < 0.8:
        return None

    # If we do have an end time, it must be within 1 day.
    # We can only meaningfully add short duration if precision is high enough.
    
    end = start.model_copy()
    
    if start.precision in ["hour", "minute"]:
        # Add 1-23 hours
        add_hours = random.randint(1, 23)
        new_hour = (start.hour or 0) + add_hours
        
        days_to_add = new_hour // 24
        end.hour = new_hour % 24
        
        if days_to_add > 0:
             end.day = (end.day or 1) + days_to_add
             # Simple validation (max 28 to be safe)
             if end.day > 28:
                 end.day = 1
                 end.month = (end.month or 1) + 1
                 if end.month > 12:
                     end.month = 1
                     end.year += 1
        return end
    
    elif start.precision == "day":
        # End on same day or next day
        if random.random() < 0.5:
            # Next day
             end.day = (end.day or 1) + 1
             if end.day > 28:
                end.day = 1
                return None # Simplification: if rolling over month, just make it point event
        return end

    # For 'month', 'year', 'century', adding < 1 day is structurally invisible or ambiguous.
    # So return None (point event).
    return None

def random_location():
    lat = random.uniform(-60, 80)
    lng = random.uniform(-180, 180)
    precisions = ["spot", "area"] 
    certainties = ["definite", "approximate"]
    
    return LocationEntry(
        latitude=lat,
        longitude=lng,
        location_name=f"Random Location {random.randint(1, 10000)}",
        precision=random.choice(precisions),
        certainty=random.choice(certainties)
    )

def random_importance():
    roll = random.random()
    if roll < 0.7:
        return round(random.uniform(1.0, 4.0), 2)
    elif roll < 0.9:
        return round(random.uniform(4.0, 7.0), 2)
    else:
        return round(random.uniform(7.0, 10.0), 2)

def group_events(wrappers: List[EventWrapper], prob: float, batch_id: str) -> (List[EventWrapper], List[EventWrapper]):
    """
    Groups events into containers.
    Returns (next_level_wrappers, children_wrappers).
    next_level_wrappers contains the containers (which may wrap children) + ungrouped items.
    children_wrappers contains the items that were put inside containers.
    """
    sorted_wrappers = sorted(wrappers, key=lambda w: w.start_decimal)
    
    next_level = []
    stowed_children = []
    
    i = 0
    # Grouping parameters
    MAX_GAP_YEARS = 50 
    
    while i < len(sorted_wrappers):
        # Attempt to group
        if i < len(sorted_wrappers) - 1 and random.random() < prob:
            group_size = random.randint(2, 5) # Try to grab 2-5 items
            candidates = sorted_wrappers[i : i + group_size]
            
            # Check gaps
            valid = True
            if len(candidates) < 2: 
                valid = False
            else:
                for k in range(len(candidates) - 1):
                    gap = candidates[k+1].start_decimal - candidates[k].start_decimal
                    if gap > MAX_GAP_YEARS:
                        valid = False
                        break
            
            if valid:
                # Create Container
                earliest = candidates[0].event
                
                # Determine end time = latest of all end times
                latest_end_decimal = -99999.0
                final_end_time = earliest.start_time
                
                max_imp = 0.0
                total_atomic_count = 0
                
                # Calculate properties
                import math
                for c in candidates:
                    # Importance
                    if c.event.importance > max_imp:
                        max_imp = c.event.importance
                    
                    # Atomic Count
                    total_atomic_count += c.atomic_count
                    
                    # End time
                    # Use end_time if present, else start_time
                    et = c.event.end_time or c.event.start_time
                    et_dec = calculate_decimal_year(et)
                    if et_dec > latest_end_decimal:
                        latest_end_decimal = et_dec
                        final_end_time = et

                container_title = f"Apparent Container {random.randint(1000, 9999)} [{batch_id}]"
                
                # Importance Boost based on atomic count (log scale)
                # e.g. count=10 -> +1.0, count=100 -> +2.0, count=1000 -> +3.0
                importance_boost = math.log(total_atomic_count, 10)
                final_importance = min(max_imp + importance_boost, 10.0)
                
                container_event = EventSchema(
                    title=container_title,
                    summary=f"Container group for {len(candidates)} items ({total_atomic_count} atomic).",
                    start_time=earliest.start_time,
                    end_time=final_end_time,
                    location=earliest.location,
                    importance=round(final_importance, 2),
                    children=[], # Will be populated with final IDs later
                    sources=earliest.sources,
                    collections=earliest.collections
                )
                
                c_wrapper = EventWrapper(container_event, f"temp_cont_{batch_id}_{random.randint(100000, 999999)}", atomic_count=total_atomic_count)
                c_wrapper.child_temp_ids = [c.temp_id for c in candidates]
                
                next_level.append(c_wrapper)
                stowed_children.extend(candidates)
                
                i += len(candidates)
                continue
        
        # Fallback: Just add the item
        next_level.append(sorted_wrappers[i])
        i += 1
        
    return next_level, stowed_children

def generate_data(total_events, output_dir_path, container_prob=0.2, tags=None, collections=None):
    output_dir = Path(output_dir_path)
    if not output_dir.exists():
        output_dir.mkdir(parents=True)
        
    print(f"Generating {total_events} events with P(container)={container_prob}...")
    
    # 1. Generate Base Events (Stage 1)
    # -----------------------------------
    import time
    batch_timestamp = int(time.time())
    
    base_wrappers = []
    
    for i in range(total_events):
        title = f"Event {i+1} [{batch_timestamp}] - {random.choice(['Battle', 'Meeting', 'Incident', 'Discovery'])}"
        start = random_time()
        end = add_short_duration(start)
        
        evt = EventSchema(
            title=title,
            summary=f"Base event {i+1}",
            start_time=start,
            end_time=end,
            location=random_location(),
            importance=random_importance(),
            children=[],
            sources=[Link(label="Generator", url="http://localhost")],
            collections=collections or []
        )
        if tags: 
            evt.collections = (evt.collections or []) + tags
            
        w = EventWrapper(evt, f"temp_{i}")
        base_wrappers.append(w)
        
    # 2. Grouping Passes (Stage 2)
    # ----------------------------
    current_level = base_wrappers
    all_stowed_children = []
    
    # Run 3 passes to allow nesting (Container -> Container)
    for pass_idx in range(3):
        print(f"Grouping Pass {pass_idx+1}: Input size {len(current_level)}...")
        next_lvl, stowed = group_events(current_level, container_prob, batch_id=f"{batch_timestamp}_{pass_idx}")
        current_level = next_lvl
        all_stowed_children.extend(stowed)
        
    # All events to write = Top Level + All Stowed Children
    final_list = current_level + all_stowed_children
    print(f"Total objects to write (including containers): {len(final_list)}")
    
    # 3. Assign Files & Generate Final IDs
    # ------------------------------------
    # We sort mainly to keep file contents vaguely chronological? Or shuffle?
    # Usually splitting by time is good for basic sharding.
    final_list.sort(key=lambda w: w.start_decimal)
    
    events_per_file = 200
    
    # Map temp_id -> final_source_id
    id_map = {}
    # Map temp_id -> EventWrapper object (needed for parent back-pointers)
    wrapper_map = {w.temp_id: w for w in final_list}
    
    # First pass: assign files and generate IDs
    files_map = {} # file_idx -> list of wrappers
    
    for idx, w in enumerate(final_list):
        file_idx = (idx // events_per_file) + 1
        
        # Generate ID
        # Format: filename_stem:slug_title
        filename_stem = f"test_events_{file_idx}"
        slug_title = slugify(w.event.title)
        
        # Ensure uniqueness if title duplicates exist?
        # Append random if needed? The original script relied on unique titles roughly.
        # We'll append temp_id snippet to slug to be safe.
        slug = f"{slug_title}_{w.temp_id[-4:]}"
        
        final_id = f"{filename_stem}:{slug}"
        w.final_source_id = final_id
        id_map[w.temp_id] = final_id
        
        if file_idx not in files_map:
            files_map[file_idx] = []
        files_map[file_idx].append(w)

    # 4. Resolve Children Links
    # -------------------------
    for w in final_list:
        # [FIX] Always use explicit source_id 
        w.event.source_id = w.final_source_id
        
        if w.child_temp_ids:
            # Map temp IDs to final IDs
            resolved_children = []
            for tid in w.child_temp_ids:
                if tid in id_map:
                    child_final_id = id_map[tid]
                    resolved_children.append(child_final_id)
                    
                    # [NEW] Set parent back-pointer on the child event
                    if tid in wrapper_map:
                        wrapper_map[tid].event.parent_source_id = w.final_source_id
                else:
                    print(f"Warning: Child temp ID {tid} not found in map!")
            w.event.children = resolved_children
            
            # Update summary to debug
            w.event.summary += f" [ID: {w.final_source_id}]"
            

    # ----------------
    for f_idx, wrappers in files_map.items():
        filename = f"test_events_{f_idx}.json"
        
        # Convert to dicts
        output_data = [w.event.model_dump(exclude_none=True) for w in wrappers]
        
        filepath = output_dir / filename
        print(f"Writing {len(output_data)} events to {filepath}...")
        with open(filepath, 'w') as f:
            json.dump(output_data, f, indent=2)

    print("✅ Generation Complete.")

def main():
    parser = argparse.ArgumentParser(description="Generate Synthetic Test Events")
    parser.add_argument("--total_events", type=int, help="Total number of events to generate")
    parser.add_argument("--container_events", type=float, default=0.2, help="Probability (0.0 - 1.0) to form a container group.")
    parser.add_argument("--output", help="Output directory folder")
    parser.add_argument("--tags", help="Comma-separated tags")
    parser.add_argument("--collections", help="Comma-separated collections")
    
    args = parser.parse_args()
    
    total = args.total_events or 1200
    out = args.output or "."
    
    tags = [t.strip() for t in args.tags.split(',')] if args.tags else []
    colls = [c.strip() for c in args.collections.split(',')] if args.collections else []
    
    generate_data(total, out, args.container_events, tags, colls)

if __name__ == "__main__":
    main()
