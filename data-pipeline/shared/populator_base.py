import os
import sys
import psycopg2
import argparse
import json
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Optional, Type, TypeVar, Generic
from pydantic import BaseModel

T = TypeVar('T', bound=BaseModel)

class BasePopulator(Generic[T]):
    """
    Base class for scripts that populate database tables from JSON data.
    """
    def __init__(self, model_class: Type[T], collection_key: str, default_table_name: str):
        self.model_class = model_class
        self.collection_key = collection_key
        self.default_table_name = default_table_name
        
        # Setup Environment
        self.script_path = Path(sys.argv[0]).resolve()
        self.data_pipeline_root = self.script_path.parents[1]
        load_dotenv(self.data_pipeline_root / '.env')
        
        self.database_url = os.environ.get("DATABASE_URL")
        if not self.database_url:
            print("Error: DATABASE_URL not set")
            sys.exit(1)

    def get_connection(self):
        return psycopg2.connect(self.database_url)

    def parse_args(self):
        parser = argparse.ArgumentParser(description=f"Populate {self.model_class.__name__} Data")
        parser.add_argument("--instance", choices=['prod', 'dev', 'staging'], help="Target instance (prod, dev, staging)")
        parser.add_argument("--input", help="Path to JSON file or folder containing JSON files")
        parser.add_argument("--existing", choices=['skip', 'overwrite'], default='skip', help="Policy for existing records (default: skip)")
        return parser.parse_args()

    def get_instance_and_input(self, args):
        instance = args.instance
        if not instance:
            while True:
                val = input("Target instance (prod/dev/staging): ").strip().lower()
                if val in ['prod', 'dev', 'staging']:
                    instance = val
                    break
                print("Invalid instance. Please choose 'prod', 'dev' or 'staging'.")

        input_path_str = args.input
        if not input_path_str:
            input_path_str = input("Path to JSON file or folder: ").strip()

        input_path = Path(input_path_str)
        if not input_path.exists():
            print(f"Error: Path not found: {input_path}")
            sys.exit(1)
            
        return instance, input_path

    def collect_json_files(self, input_path: Path) -> List[Path]:
        if input_path.is_dir():
            files = sorted(list(input_path.glob("*.json")))
            print(f"Found {len(files)} JSON files in folder: {input_path}")
            return files
        elif input_path.is_file():
            return [input_path]
        else:
            print(f"Error: Path is neither file nor directory: {input_path}")
            sys.exit(1)

    def load_data(self, json_files: List[Path]) -> List[dict]:
        all_raw_items = []
        for jp in json_files:
            try:
                with open(jp, 'r') as f:
                    raw_data = json.load(f)
                
                if isinstance(raw_data, dict) and self.collection_key in raw_data:
                    all_raw_items.extend(raw_data[self.collection_key])
                else:
                    print(f"⚠️  Skipping {jp.name}: No '{self.collection_key}' key found.")
            except Exception as e:
                print(f"❌ Failed to load {jp.name}: {e}")
        return all_raw_items

    def get_table_name(self, instance: str) -> str:
        # direct mapping: prod -> prod schema
        return f'"{instance}".{self.default_table_name}'

    def run(self):
        args = self.parse_args()
        instance, input_path = self.get_instance_and_input(args)
        json_files = self.collect_json_files(input_path)
        raw_items = self.load_data(json_files)
        
        if not raw_items:
            print(f"No {self.collection_key} found to populate.")
            sys.exit(0)
            
        print(f"Validating {len(raw_items)} {self.collection_key}...")
        try:
            items = [self.model_class(**item) for item in raw_items]
            self.populate(items, instance, args.existing)
        except Exception as e:
            print(f"Validation/Population Error: {e}")
            sys.exit(1)

    def populate(self, items: List[T], instance: str, existing_policy: str):
        raise NotImplementedError("Subclasses must implement populate()")
