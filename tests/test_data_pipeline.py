import pytest
import pandas as pd
import numpy as np
from src.data_pipeline import generate_representative_nyc_taxi_dataset, clean_data
from src.feature_engineering import haversine_distance, extract_time_features

def test_haversine_distance():
    # JFK Airport to Times Square distance (~20-22 km)
    jfk_lat, jfk_lon = 40.6413, -73.7781
    ts_lat, ts_lon = 40.7589, -73.9851
    dist = haversine_distance(jfk_lat, jfk_lon, ts_lat, ts_lon)
    assert 18.0 <= dist <= 24.0

def test_extract_time_features():
    df = pd.DataFrame({'pickup_datetime': ['2026-09-17 18:30:00', '2026-09-20 02:00:00']})
    df_out = extract_time_features(df)
    assert df_out['hour'].iloc[0] == 18
    assert df_out['is_rush_hour'].iloc[0] == 1  # 18:30 is weekday 6 PM rush hour
    assert df_out['is_weekend'].iloc[1] == 1   # Sept 20 2026 is Sunday

def test_data_cleaning_filters():
    df_raw = generate_representative_nyc_taxi_dataset(num_samples=1000, random_state=42)
    df_clean, retention_logs = clean_data(df_raw)
    
    # Assert retention rate is ~99%+ (only ~0.3% invalid records dropped)
    retention_pct = (len(df_clean) / len(df_raw)) * 100
    assert retention_pct >= 98.0
    
    # Assert no missing values
    assert df_clean['passenger_count'].isnull().sum() == 0
    # Assert fare amount bounds
    assert (df_clean['fare_amount'] > 0).all()
    assert (df_clean['fare_amount'] < 100).all()
    # Assert passenger count bounds
    assert (df_clean['passenger_count'] >= 1).all()
    assert (df_clean['passenger_count'] <= 6).all()
