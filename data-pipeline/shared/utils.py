from .models import TimeEntry

def calculate_astro_year(entry: TimeEntry) -> float:
    """
    Calculates float year for indexing.
    1 AD = 1.0, 1 BC = 0.0, 2 BC = -1.0
    """
    y = entry.year
    if y is None:
        return 0.0 # Fallback should typically not happen if validated, but safety first
        
    # Adjust for BC logic (Astronomical Year numbering)
    # If input is AD (y > 0): Base is y
    # If input is BC (y < 0): Base is y + 1 (e.g. -1 BC becomes 0.0)
    # Note: If JSON uses "negative year" for BC, we assume:
    # -1 = 1 BC. 
    
    astro_base = y if y > 0 else y + 1
    
    # Fraction of year
    if not entry.month or not entry.day:
        return float(astro_base)
        
    # Leap year logic (Gregorian simplified)
    is_leap = (y % 4 == 0 and y % 100 != 0) or (y % 400 == 0)
    if y < 1582: # Julian simplified
         is_leap = (y % 4 == 0)

    days_in_year = 366 if is_leap else 365
    days_in_months = [0, 31, 29 if is_leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    
    day_of_year = sum(days_in_months[:entry.month]) + entry.day
    fraction = (day_of_year - 1) / days_in_year
    
    return astro_base + fraction
