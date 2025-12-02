import re
from datetime import datetime

def is_leap_year(astro_year: int) -> bool:
    """
    Checks if an astronomical year is a leap year.
    Note: Year 0 (1 BC) IS a leap year in astronomical numbering.
    """
    return (astro_year % 4 == 0 and astro_year % 100 != 0) or (astro_year % 400 == 0)

def normalize_time(date_str: str) -> dict:
    """
    Parses a raw date string (ISO, Wikidata format) into a unified ChronosTime dict.
    
    Supported formats:
    - "+1945-09-02T00:00:00Z" (Wikidata AD)
    - "-0400-00-00T00:00:00Z" (Wikidata BC)
    - "1945-09-02"
    
    Returns:
        {
            "year": int,       # Historical Year (-1 for 1 BC)
            "month": int,
            "day": int,
            "astro_year": float, # Decimal Year for calculation
            "precision": str,
            "raw_date": str
        }
    or None if parsing fails.
    """
    if not date_str:
        return None

    try:
        # 1. Clean String
        # Handle Wikidata's leading '+' for AD years
        clean_str = date_str.lstrip('+') 
        is_bc = clean_str.startswith('-')
        
        # Remove BC sign for splitting
        if is_bc:
            clean_str = clean_str[1:]
            
        # Remove Time part
        date_part = clean_str.split('T')[0]
        parts = date_part.split('-')
        
        # 2. Extract Components
        # Year: If original started with '-', multiply by -1
        year_val = int(parts[0])
        year = -year_val if is_bc else year_val
        
        # Month/Day: Default to 1 if missing or 0
        month = int(parts[1]) if len(parts) > 1 and int(parts[1]) > 0 else 1
        day = int(parts[2]) if len(parts) > 2 and int(parts[2]) > 0 else 1
        
        # Precision Guessing
        precision = "year"
        if len(parts) > 1 and int(parts[1]) > 0:
            precision = "month"
            if len(parts) > 2 and int(parts[2]) > 0:
                precision = "day"

        # 3. Calculate Astro Year (Decimal)
        # Astronomical Year 0 = 1 BC
        # 1 AD = 1.0, 1 BC = 0.0, 2 BC = -1.0
        
        if year > 0:
            base_astro_year = year
        else:
            base_astro_year = year + 1 # e.g. -1 (1 BC) -> 0
            
        # Calculate Day of Year (0-based)
        # Simple approximation: (Month-1)*30 + Day
        # For data pipeline sorting, extreme precision isn't critical, but logic should be sound
        days_in_month = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        
        # Leap year check for day calc
        if is_leap_year(base_astro_year):
            days_in_month[2] = 29
            
        day_of_year = sum(days_in_month[:month]) + (day - 1)
        total_days = 366 if is_leap_year(base_astro_year) else 365
        
        fraction = day_of_year / total_days
        
        astro_year = base_astro_year + fraction

        return {
            "year": year,
            "month": month,
            "day": day,
            "astro_year": round(astro_year, 5), # Limit precision
            "precision": precision,
            "raw_date": date_str
        }

    except Exception as e:
        # print(f"Time Parse Error: {date_str} -> {e}")
        return None

# Test Block
if __name__ == "__main__":
    print(normalize_time("+1945-09-02T00:00:00Z")) # WWII End
    print(normalize_time("-0044-03-15T00:00:00Z")) # Caesar (44 BC)
    print(normalize_time("-0001-01-01"))           # 1 BC (Should be astro 0.0)