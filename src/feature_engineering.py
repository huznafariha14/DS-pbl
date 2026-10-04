import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

# NYC Bounding Box constants
NYC_LAT_MIN, NYC_LAT_MAX = 40.49, 40.92
NYC_LON_MIN, NYC_LON_MAX = -74.26, -73.70

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance in kilometers between two points 
    on the earth (specified in decimal degrees) using Haversine formula.
    """
    R = 6371.0  # Earth radius in kilometers
    
    lat1_rad = np.radians(lat1)
    lon1_rad = np.radians(lon1)
    lat2_rad = np.radians(lat2)
    lon2_rad = np.radians(lon2)
    
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    
    a = np.sin(dlat / 2.0)**2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon / 2.0)**2
    c = 2 * np.arcsin(np.sqrt(a))
    
    return R * c

def extract_time_features(df_in):
    """
    Extract temporal features from pickup_datetime.
    """
    df = df_in.copy()
    if not pd.api.types.is_datetime64_any_dtype(df['pickup_datetime']):
        df['pickup_datetime'] = pd.to_datetime(df['pickup_datetime'])
        
    df['hour'] = df['pickup_datetime'].dt.hour
    df['day_of_week'] = df['pickup_datetime'].dt.dayofweek
    df['month'] = df['pickup_datetime'].dt.month
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
    
    # Rush hour: Weekdays 7-9 AM (7,8) or 5-7 PM (17,18)
    is_weekday = df['day_of_week'] < 5
    is_morning_rush = df['hour'].isin([7, 8, 9])
    is_evening_rush = df['hour'].isin([17, 18, 19])
    df['is_rush_hour'] = (is_weekday & (is_morning_rush | is_evening_rush)).astype(int)
    
    return df

def enrich_features(df_in):
    """
    Add domain features: distance_km, traffic_congestion_index, weather_condition scaffolding.
    """
    df = extract_time_features(df_in)
    
    df['distance_km'] = haversine_distance(
        df['pickup_latitude'], df['pickup_longitude'],
        df['dropoff_latitude'], df['dropoff_longitude']
    )
    
    # Traffic Congestion Index scaffolding (scale 1.0 to 2.0 based on hour & rush hour)
    # Peak congestion during rush hour (1.6x) and mid-day NYC traffic (1.3x)
    congestion = np.ones(len(df))
    rush_mask = df['is_rush_hour'] == 1
    midday_mask = (df['hour'] >= 10) & (df['hour'] <= 16) & (df['day_of_week'] < 5)
    night_mask = (df['hour'] >= 22) | (df['hour'] <= 5)
    
    congestion[rush_mask] = 1.6
    congestion[midday_mask] = 1.3
    congestion[night_mask] = 1.0
    df['traffic_congestion_index'] = congestion
    
    # Weather scaffolding: default to 0 (Clear)
    if 'weather_condition' not in df.columns:
        df['weather_condition'] = 0  # 0: Clear, 1: Rain, 2: Snow
        
    return df

class FeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Scikit-learn compatible Feature Engineering Transformer.
    """
    def __init__(self):
        pass
        
    def fit(self, X, y=None):
        return self
        
    def transform(self, X):
        return enrich_features(X)
