import math

def calculate_importance(length_val):
    """
    Calculates importance score based on Wikipedia page length.
    Range: 1.00 (Lowest) - 10.00 (Highest)
    Type: Float (2 decimal places)
    Algorithm: Logarithmic Scale
    """
    try:
        # 1. Basic Data Cleaning
        if length_val is None:
            return 1.00
            
        length = int(length_val)
        
        # Handle edge cases (empty content)
        if length <= 0:
            return 1.00
            
        # 2. Logarithmic Calculation
        # Use log10 to compress the data range
        log_val = math.log10(length)
        
        # 3. Define Thresholds (Empirical values based on Wikipedia data)
        # 10^2.7 ≈ 500 chars (Stub/Short articles)
        # 10^5.3 ≈ 200,000 chars (Epic articles like "World War II")
        min_log = 2.7
        max_log = 5.3
        
        # 4. Normalization -> 0.0 to 1.0
        if log_val <= min_log:
            return 1.00
        if log_val >= max_log:
            return 10.00
            
        normalized = (log_val - min_log) / (max_log - min_log)
        
        # 5. Mapping to 1-10 Range
        # Formula: Base 1 + (Range * Ratio)
        score = 1 + (normalized * 9)
        
        return round(score, 2)

    except (ValueError, TypeError):
        # Return minimum score on error
        return 1.00