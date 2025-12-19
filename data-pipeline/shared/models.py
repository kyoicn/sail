# ------------------------------------------------------------------------------
# DATA LAYER SCHEMA (PIPELINE)
# ------------------------------------------------------------------------------
# This file defines the data schema used by the Python Data Pipeline.
# It acts as the source of truth for generating, validating, and processing
# data BEFORE it is inserted into the Database.
#
# Relationship:
# - Generates data that matches 'create_table.sql' (Storage Schema).
# - Is distinct from 'sail-project/types/index.ts' (Application Schema).
# ------------------------------------------------------------------------------

from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator

class TimeEntry(BaseModel):
    year: Optional[int] = None
    month: Optional[int] = None
    day: Optional[int] = None
    hour: Optional[int] = None
    minute: Optional[int] = None
    second: Optional[int] = None
    millisecond: Optional[int] = None
    timestamp: Optional[float] = None
    precision: Literal["millennium", "century", "decade", "year", "month", "day", "hour", "minute", "second", "millisecond", "unknown"] = "unknown"

class Link(BaseModel):
    label: str
    url: str

class LocationEntry(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    precision: Literal["spot", "area", "unknown"] = "unknown"
    certainty: Literal["definite", "approximate", "unknown"] = "unknown"
    area_id: Optional[str] = None # Reference to an Area.area_id

class EventSchema(BaseModel):
    ## Basic information
    title: str
    summary: str
    
    ## Time
    start_time: TimeEntry
    end_time: Optional[TimeEntry] = None
    
    ## Location
    location: LocationEntry
    
    ## Annotations

    # Importance score of the event (range 0.0-10.0).
    # Higher values indicate higher importance.
    # The minimum effective importance is 1.0.
    # Values below 1.0 or above 10.0 signify that the importance score is either not computed,
    # or there was insufficient information to compute it, requiring re-assessment.
    importance: float = 0.0

    # Sources and images
    sources: Optional[List[Link]] = None
    images: Optional[List[Link]] = None
    
    # Relationships
    # List of child event source_ids.
    children: Optional[List[str]] = None
    
    # Collections/Tags
    collections: Optional[List[str]] = []

    @field_validator('importance', mode='before')
    def set_importance(cls, v):
        try:
            val = float(v)
            return max(0, min(10, val))
        except:
            return 1.0

from datetime import datetime

class ExtractionRecord(BaseModel):
    created_at: datetime = Field(default_factory=datetime.now)
    source_url: str
    model_name: str
    clean_text: str
    events: List[EventSchema]


# Type Aliases for Geometry
Coordinate = List[float] # [lng, lat]
Ring = List[Coordinate]    # A closed loop of coordinates
Polygon = List[Ring]       # [OuterRing, InnerRing1, InnerRing2, ...]
MultiPolygon = List[Polygon] # [Polygon1, Polygon2, ...]

class AreaModel(BaseModel):
    """
    Represents a named geographic area with a polygon boundary.
    Corresponds to the 'areas' table.
    """
    area_id: str  # Slug, e.g. 'china_proper'
    display_name: str
    description: Optional[str] = None
    # GeoJSON MultiPolygon structure
    geometry: MultiPolygon 

class HistoricalPeriodModel(BaseModel):
    """
    Represents a named historical period.
    Corresponds to the 'historical_periods' table.
    """
    period_id: str  # Slug, e.g. 'qing_dynasty'
    display_name: str
    description: Optional[str] = None
    start_astro_year: float
    end_astro_year: float
    # List of Area slugs this period is associated with.
    primary_area_ids: List[str]
    associated_area_ids: List[str] = []
    importance: float = 1.0

class AreaGenerationQuery(BaseModel):
    query: str
    area_id: str
    display_name: str
    description: Optional[str] = None
