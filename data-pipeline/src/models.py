from typing import Optional, List, Literal
from pydantic import BaseModel, Field, field_validator

class TimeEntry(BaseModel):
    year: int
    month: Optional[int] = None
    day: Optional[int] = None
    hour: Optional[int] = None
    minute: Optional[int] = None
    second: Optional[int] = None
    millisecond: Optional[int] = None
    timestamp: Optional[float] = None
    precision: Literal["millennium", "century", "decade", "year", "month", "day", "hour", "minute", "second", "millisecond"] = "year"

class Link(BaseModel):
    label: str
    url: str

class LocationEntry(BaseModel):
    latitude: float
    longitude: float
    location_name: Optional[str] = None
    precision: Literal["spot", "area"] = "spot"
    certainty: Literal["definite", "approximate"] = "definite"

class EventSchema(BaseModel):
    # Identity
    title: str = Field(alias="event_title")
    summary: str = Field(alias="event_description", default="")
    image_url: Optional[str] = None # Legacy field in JSON, map to array
    
    # Time
    start_time: TimeEntry
    end_time: Optional[TimeEntry] = None
    
    # Location
    location: LocationEntry
    
    # Metadata
    importance: float = 1.0
    sources: List[dict] = Field(default_factory=list) # To be mapped to links

    @field_validator('importance', mode='before')
    def set_importance(cls, v):
        try:
            val = float(v)
            return max(0, min(10, val))
        except:
            return 1.0
