import re

def normalize_geo(wkt_str: str) -> dict:
    """
    Parses WKT Point string into lat/lng and PostGIS-ready string.
    
    Input: "Point(-0.12 51.5)"  (Note: WKT is usually Longitude Latitude)
    Output: {
        "lat": 51.5,
        "lng": -0.12,
        "wkt": "POINT(-0.12 51.5)"
    }
    """
    if not wkt_str:
        return None
        
    try:
        # Remove "Point(" and ")" and whitespace
        clean = wkt_str.upper().replace("POINT", "").replace("(", "").replace(")", "").strip()
        
        # Split by space
        parts = clean.split()
        if len(parts) < 2:
            return None
            
        lng = float(parts[0])
        lat = float(parts[1])
        
        # Validation
        if lat < -90 or lat > 90 or lng < -180 or lng > 180:
            # print(f"Invalid Coordinates: {lat}, {lng}")
            return None
            
        return {
            "lat": lat,
            "lng": lng,
            # Ensure standard WKT format for DB insertion
            "wkt": f"POINT({lng} {lat})" 
        }
    except Exception:
        return None

if __name__ == "__main__":
    print(normalize_geo("Point(-0.1275 51.5072)"))