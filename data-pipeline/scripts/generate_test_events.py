"""
Script: generate_test_events.py
Description:
    Generates synthetic test data for events.
    Creates multiple JSON files in the specified output folder containing random events
    that strictly follow the EventSchema.
    
    Features:
    - Generates configurable number of events.
    - Splits into multiple files (batch size ~200).
    - Ensures diversity in Time (ancient to future), Location (global), and Importance.
    - Simulates Parent-Child relationships across files.
    - Strictly avoids "unknown" enum values to match DB constraints.

Detailed Parameter Guide:
    --total_events (int):
        The total number of mock events to generate across all output files.
        If not provided, the script will prompt the user for input.

    --output (str):
        The target directory where the generated JSON files will be saved.
        The directory will be created if it does not exist.
        If not provided, the script will prompt the user for input.

Usage Examples:
    # 1. Interactive Mode (Prompts for inputs):
    python data-pipeline/scripts/generate_test_events.py

    # 2. Non-Interactive Mode (CLI input):
    python data-pipeline/scripts/generate_test_events.py --total_events 5000 --output data-pipeline/data/stress_test
"""

import sys
import json
import random
import re
import argparse
from pathlib import Path

# Setup Environment to import shared.models
current_file = Path(__file__).resolve()
data_pipeline_root = current_file.parents[1]
sys.path.append(str(data_pipeline_root))

from shared.models import EventSchema, TimeEntry, LocationEntry, Link

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def random_time():
    # Range: -3000 BC to 2025 AD
    year = random.randint(-3000, 2025)
    
    # Precision variety: exclude 'unknown' if it causes DB issues
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

def random_location():
    # Global coverage
    lat = random.uniform(-60, 80)
    lng = random.uniform(-180, 180)
    
    # DB 'granularity_type' ENUM: ('spot', 'area')
    # DB 'certainty_type' ENUM: ('definite', 'approximate')
    # Removed 'unknown' to avoid enum violations.
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

def generate_data(total_events, output_dir_path):
    output_dir = Path(output_dir_path)
    if not output_dir.exists():
        output_dir.mkdir(parents=True)

    # Determine file splitting
    events_per_file = 200
    files_count = (total_events + events_per_file - 1) // events_per_file

    print(f"Generating {total_events} events into {files_count} files in {output_dir}...")

    all_metadata = [] 

    # 1. Pre-generate metadata
    for i in range(total_events):
        file_idx = (i // events_per_file) + 1
        title = f"Test Event {i+1} - {random.choice(['Battle', 'Discovery', 'Treaty', 'Birth', 'Invention', 'Summit', 'Crisis'])}"
        
        filename_stem = f"test_events_{file_idx}"
        slug_title = slugify(title)
        
        # NOTE: This must match how populate_events.py generates IDs if we want to refer to them exactly.
        source_id = f"{filename_stem}:{slug_title}"
        
        all_metadata.append({
            "i": i,
            "title": title,
            "file_idx": file_idx,
            "source_id": source_id
        })

    # 2. Build Events
    events_by_file = {idx: [] for idx in range(1, files_count + 1)}

    for meta in all_metadata:
        children_ids = []
        # chance for children
        if random.random() < 0.15: 
            num_children = random.randint(1, 3)
            candidates = random.sample(all_metadata, num_children)
            children_ids = [c['source_id'] for c in candidates if c['source_id'] != meta['source_id']]

        event = EventSchema(
            title=meta['title'],
            summary=f"Synthetic summary for {meta['title']}. ID: {meta['source_id']}",
            start_time=random_time(),
            end_time=random_time() if random.random() < 0.4 else None,
            location=random_location(),
            importance=random_importance(),
            children=children_ids,
            sources=[Link(label="Synthetic Generator", url="http://localhost")],
            collections=["test_data", f"batch_{meta['file_idx']}"]
        )
        
        events_by_file[meta['file_idx']].append(event.model_dump(exclude_none=True))

    # 3. Write Files
    for idx, events in events_by_file.items():
        if not events: continue
        filename = f"test_events_{idx}.json"
        filepath = output_dir / filename
        
        print(f"Writing {len(events)} events to {filepath}...")
        with open(filepath, 'w') as f:
            json.dump(events, f, indent=2)

    print("✅ Generation Complete.")

def main():
    parser = argparse.ArgumentParser(description="Generate Synthetic Test Events")
    parser.add_argument("--total_events", type=int, help="Total number of events to generate")
    parser.add_argument("--output", help="Output directory folder")
    
    args = parser.parse_args()
    
    total_events = args.total_events
    if total_events is None:
        try:
            val = input("Enter total number of events [1200]: ").strip()
            total_events = int(val) if val else 1200
        except ValueError:
            print("Invalid input using default 1200")
            total_events = 1200

    output = args.output
    if output is None:
        val = input("Enter output directory [data-pipeline/data]: ").strip()
        output = val if val else "data-pipeline/data"

    generate_data(total_events, output)

if __name__ == "__main__":
    main()
