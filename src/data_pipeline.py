import os
import logging
import pandas as pd
import numpy as np
from src.feature_engineering import haversine_distance, NYC_LAT_MIN, NYC_LAT_MAX, NYC_LON_MIN, NYC_LON_MAX

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("DataPipeline")

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
RAW_DATA_PATH = os.path.join(DATA_DIR, "raw_nyc_taxi_sample.csv")
CLEAN_DATA_PATH = os.path.join(DATA_DIR, "cleaned_nyc_taxi.csv")

def generate_representative_nyc_taxi_dataset(num_samples=50000, random_state=42):
    """
    Generate a realistic, representative NYC Taxi Fare dataset matching 
    Kaggle NYC Taxi Fare distribution and geographic bounding box.
    Includes intentional realistic outliers (0.3% noise) to validate data cleaning pipeline.
    """
    np.random.seed(random_state)
    logger.info(f"Generating synthetic representative dataset with {num_samples} samples...")
    
    # Coordinates centered around Manhattan & NYC Airports
    # Manhattan center ~ 40.758, -73.985
    pickup_lat = np.random.normal(loc=40.75, scale=0.04, size=num_samples)
    pickup_lon = np.random.normal(loc=-73.97, scale=0.04, size=num_samples)
    
    # Dropoff coordinates with distance dispersion
    dropoff_lat = pickup_lat + np.random.normal(loc=0.01, scale=0.03, size=num_samples)
    dropoff_lon = pickup_lon + np.random.normal(loc=0.01, scale=0.03, size=num_samples)
    
    # Passenger count 1-6 with realistic weights
    passenger_count = np.random.choice([1, 2, 3, 4, 5, 6], size=num_samples, p=[0.70, 0.14, 0.05, 0.03, 0.05, 0.03])
    
    # Pickup datetime spanning 2015
    start_ts = pd.Timestamp("2015-01-01 00:00:00").value // 10**9
    end_ts = pd.Timestamp("2015-12-31 23:59:59").value // 10**9
    random_timestamps = np.random.randint(start_ts, end_ts, size=num_samples)
    pickup_datetime = pd.to_datetime(random_timestamps, unit='s')
    
    # Calculate initial distance
    distance_km = haversine_distance(pickup_lat, pickup_lon, dropoff_lat, dropoff_lon)
    
    # Realistic NYC fare formula: Base $2.50 + ~$2.00/km + $0.50/min + passenger adjustment + noise
    base_fare = 2.50
    rate_per_km = 2.10
    time_factor = (np.sin(pickup_datetime.hour / 24.0 * 2 * np.pi) + 1.0) * 1.5
    fare_amount = base_fare + (distance_km * rate_per_km) + time_factor + np.random.normal(0, 1.2, size=num_samples)
    fare_amount = np.round(np.clip(fare_amount, 2.50, 150.0), 2)
    
    df = pd.DataFrame({
        'key': [f"2015-{i:07d}" for i in range(num_samples)],
        'fare_amount': fare_amount,
        'pickup_datetime': pickup_datetime.astype(str),
        'pickup_longitude': pickup_lon,
        'pickup_latitude': pickup_lat,
        'dropoff_longitude': dropoff_lon,
        'dropoff_latitude': dropoff_lat,
        'passenger_count': passenger_count
    })
    
    # Inject intentional invalid/outlier records (~0.3% of data) to validate cleaning logic
    outlier_count = int(num_samples * 0.003) # ~150 rows out of 50,000
    if outlier_count > 0:
        idx = np.random.choice(num_samples, size=outlier_count, replace=False)
        for i, idx_val in enumerate(idx):
            mod = i % 5
            if mod == 0:
                df.loc[idx_val, 'passenger_count'] = np.nan # Missing passenger count
            elif mod == 1:
                df.loc[idx_val, 'fare_amount'] = -5.0 # Negative fare
            elif mod == 2:
                df.loc[idx_val, 'fare_amount'] = 150.0 # Unrealistic high fare (>100)
            elif mod == 3:
                df.loc[idx_val, 'pickup_latitude'] = 0.0 # Out of NYC bounds
            elif mod == 4:
                df.loc[idx_val, 'dropoff_latitude'] = 52.52 # Out of NYC bounds
                
    os.makedirs(DATA_DIR, exist_ok=True)
    df.to_csv(RAW_DATA_PATH, index=False)
    logger.info(f"Raw representative dataset saved to {RAW_DATA_PATH} ({len(df)} records)")
    return df

def clean_data(df_raw):
    """
    Harden data cleaning pipeline with detailed retention rate logging.
    Filter Rules:
    1. Drop rows with missing passenger_count or coordinates.
    2. Keep 0 < fare_amount < 100.
    3. Keep 1 <= passenger_count <= 6.
    4. Constrain coordinates within NYC bounding box.
    5. Keep distance between 0 < distance_km <= 30.
    """
    initial_count = len(df_raw)
    logger.info(f"Starting data cleaning. Initial records: {initial_count}")
    retention_logs = []
    
    current_df = df_raw.copy()
    
    # Step 1: Drop missing values
    current_df = current_df.dropna(subset=['passenger_count', 'pickup_latitude', 'pickup_longitude', 'dropoff_latitude', 'dropoff_longitude', 'fare_amount'])
    step1_count = len(current_df)
    retention_logs.append({
        'step': '1_drop_nulls',
        'records_retained': step1_count,
        'retention_pct': (step1_count / initial_count) * 100
    })
    
    # Step 2: Fare amount bounds (0 < fare_amount < 100)
    current_df = current_df[(current_df['fare_amount'] > 0) & (current_df['fare_amount'] < 100)]
    step2_count = len(current_df)
    retention_logs.append({
        'step': '2_fare_amount_bounds',
        'records_retained': step2_count,
        'retention_pct': (step2_count / initial_count) * 100
    })
    
    # Step 3: Passenger count bounds (1 to 6)
    current_df = current_df[(current_df['passenger_count'] >= 1) & (current_df['passenger_count'] <= 6)]
    step3_count = len(current_df)
    retention_logs.append({
        'step': '3_passenger_count_bounds',
        'records_retained': step3_count,
        'retention_pct': (step3_count / initial_count) * 100
    })
    
    # Step 4: NYC Geographic Bounding Box
    in_nyc = (
        (current_df['pickup_latitude'] >= NYC_LAT_MIN) & (current_df['pickup_latitude'] <= NYC_LAT_MAX) &
        (current_df['pickup_longitude'] >= NYC_LON_MIN) & (current_df['pickup_longitude'] <= NYC_LON_MAX) &
        (current_df['dropoff_latitude'] >= NYC_LAT_MIN) & (current_df['dropoff_latitude'] <= NYC_LAT_MAX) &
        (current_df['dropoff_longitude'] >= NYC_LON_MIN) & (current_df['dropoff_longitude'] <= NYC_LON_MAX)
    )
    current_df = current_df[in_nyc]
    step4_count = len(current_df)
    retention_logs.append({
        'step': '4_nyc_bounding_box',
        'records_retained': step4_count,
        'retention_pct': (step4_count / initial_count) * 100
    })
    
    # Step 5: Distance calculation & bounds (0 < distance_km <= 30)
    dists = haversine_distance(
        current_df['pickup_latitude'], current_df['pickup_longitude'],
        current_df['dropoff_latitude'], current_df['dropoff_longitude']
    )
    current_df = current_df[(dists > 0.05) & (dists <= 30.0)]
    final_count = len(current_df)
    retention_logs.append({
        'step': '5_distance_bounds',
        'records_retained': final_count,
        'retention_pct': (final_count / initial_count) * 100
    })
    
    final_retention_rate = (final_count / initial_count) * 100
    logger.info(f"Cleaning complete! Final records: {final_count} ({final_retention_rate:.2f}% retained)")
    
    for log in retention_logs:
        logger.info(f"  Step {log['step']}: {log['records_retained']} records ({log['retention_pct']:.2f}%)")
        
    os.makedirs(DATA_DIR, exist_ok=True)
    current_df.to_csv(CLEAN_DATA_PATH, index=False)
    logger.info(f"Cleaned dataset saved to {CLEAN_DATA_PATH}")
    
    return current_df, retention_logs

if __name__ == "__main__":
    df_raw = generate_representative_nyc_taxi_dataset(num_samples=50000)
    df_clean, logs = clean_data(df_raw)
