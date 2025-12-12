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
    precision: Literal["millennium", "century", "decade", "year", "month", "day", "hour", "minute", "second", "millisecond"] = "year"

class Link(BaseModel):
    label: str
    url: str

class LocationEntry(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    location_name: Optional[str] = None
    precision: Literal["spot", "area", "unknown"] = "unknown"
    certainty: Literal["definite", "approximate", "unknown"] = "unknown"

class EventSchema(BaseModel):
    ## Basic information
    title: str = Field(alias="event_title")
    summary: str = Field(alias="event_description", default="")
    
    ## Time
    start_time: TimeEntry
    end_time: Optional[TimeEntry] = None
    
    ## Location
    location: LocationEntry
    
    ## Annotations

    # Importance score of the event (range 0.0-10.0).
    # Higher values indicate higher importance.
    # The minimum effective importance is 1.0.
    # Values below 1.0 signify that the importance score is either not computed,
    # or there was insufficient information to compute it, requiring re-assessment.
    importance: float = 0.0

    # Sources and images
    sources: Optional[List[Link]] = None
    images: Optional[List[Link]] = None

    @field_validator('importance', mode='before')
    def set_importance(cls, v):
        try:
            val = float(v)
            return max(0, min(10, val))
        except:
            return 1.0
