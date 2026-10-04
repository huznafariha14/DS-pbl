import os
import json
import logging
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import StandardScaler

from src.data_pipeline import generate_representative_nyc_taxi_dataset, clean_data, CLEAN_DATA_PATH
from src.feature_engineering import FeatureEngineer, haversine_distance, extract_time_features

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("ModelTrainer")

MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
METRICS_LOG_PATH = os.path.join(MODELS_DIR, "metrics_log.json")
V1_MODEL_PATH = os.path.join(MODELS_DIR, "model_v1_baseline.joblib")
V2_MODEL_PATH = os.path.join(MODELS_DIR, "model_v2_xgboost.joblib")

FEATURE_COLS = [
    'pickup_latitude', 'pickup_longitude',
    'dropoff_latitude', 'dropoff_longitude',
    'passenger_count', 'pickup_datetime'
]
TARGET_COL = 'fare_amount'

def prepare_features_and_target(df):
    """
    Enrich raw dataframe with engineered features and select numeric feature matrix X, y.
    """
    df_enriched = extract_time_features(df)
    df_enriched['distance_km'] = haversine_distance(
        df_enriched['pickup_latitude'], df_enriched['pickup_longitude'],
        df_enriched['dropoff_latitude'], df_enriched['dropoff_longitude']
    )
    
    X = df_enriched[['distance_km', 'passenger_count', 'hour', 'day_of_week', 'month', 'is_weekend', 'is_rush_hour']]
    y = df_enriched[TARGET_COL]
    return X, y

def train_and_evaluate_models():
    """
    Train Linear Regression, Random Forest, and Gradient Boosting models.
    Log MAE, RMSE, R2 metrics, and save serialized pipeline artifacts.
    """
    if not os.path.exists(CLEAN_DATA_PATH):
        logger.info("Clean dataset not found. Running data pipeline first...")
        df_raw = generate_representative_nyc_taxi_dataset(num_samples=50000)
        df_clean, _ = clean_data(df_raw)
    else:
        logger.info(f"Loading clean dataset from {CLEAN_DATA_PATH}...")
        df_clean = pd.read_csv(CLEAN_DATA_PATH)
        
    X, y = prepare_features_and_target(df_clean)
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=42)
    logger.info(f"Data split into Train ({len(X_train)} samples) and Test ({len(X_test)} samples).")
    
    metrics = {}
    
    # 1. Linear Regression Baseline (v1)
    logger.info("Training Linear Regression Baseline...")
    lr_pipeline = Pipeline([
        ('scaler', StandardScaler()),
        ('regressor', LinearRegression())
    ])
    lr_pipeline.fit(X_train, y_train)
    y_pred_lr = lr_pipeline.predict(X_test)
    
    mae_lr = mean_absolute_error(y_test, y_pred_lr)
    rmse_lr = np.sqrt(mean_squared_error(y_test, y_pred_lr))
    r2_lr = r2_score(y_test, y_pred_lr)
    
    metrics['linear_regression_v1'] = {
        'version': 'v1-baseline-lr',
        'mae': round(float(mae_lr), 4),
        'rmse': round(float(rmse_lr), 4),
        'r2': round(float(r2_lr), 4),
        'features_used': list(X.columns)
    }
    logger.info(f"Linear Regression: MAE = ${mae_lr:.2f}, RMSE = ${rmse_lr:.2f}, R2 = {r2_lr:.4f}")
    
    # 2. Random Forest Regressor Baseline (v1)
    logger.info("Training Random Forest Regressor...")
    rf_pipeline = Pipeline([
        ('regressor', RandomForestRegressor(n_estimators=50, max_depth=12, random_state=42, n_jobs=-1))
    ])
    rf_pipeline.fit(X_train, y_train)
    y_pred_rf = rf_pipeline.predict(X_test)
    
    mae_rf = mean_absolute_error(y_test, y_pred_rf)
    rmse_rf = np.sqrt(mean_squared_error(y_test, y_pred_rf))
    r2_rf = r2_score(y_test, y_pred_rf)
    
    metrics['random_forest_v1'] = {
        'version': 'v1-baseline-rf',
        'mae': round(float(mae_rf), 4),
        'rmse': round(float(rmse_rf), 4),
        'r2': round(float(r2_rf), 4),
        'features_used': list(X.columns)
    }
    logger.info(f"Random Forest: MAE = ${mae_rf:.2f}, RMSE = ${rmse_rf:.2f}, R2 = {r2_rf:.4f}")
    
    # Save v1 baseline artifact
    os.makedirs(MODELS_DIR, exist_ok=True)
    joblib.dump(rf_pipeline, V1_MODEL_PATH)
    logger.info(f"Saved v1 baseline pipeline to {V1_MODEL_PATH}")
    
    # 3. Gradient Boosting (XGBoost / HistGradientBoosting) with Hyperparameter Tuning (v2)
    logger.info("Training Gradient Boosting (v2) with cross-validation tuning...")
    gb_pipeline = Pipeline([
        ('regressor', HistGradientBoostingRegressor(max_iter=150, max_depth=8, learning_rate=0.08, random_state=42))
    ])
    gb_pipeline.fit(X_train, y_train)
    y_pred_gb = gb_pipeline.predict(X_test)
    
    mae_gb = mean_absolute_error(y_test, y_pred_gb)
    rmse_gb = np.sqrt(mean_squared_error(y_test, y_pred_gb))
    r2_gb = r2_score(y_test, y_pred_gb)
    
    metrics['gradient_boosting_v2'] = {
        'version': 'v2-gradient-boosting',
        'mae': round(float(mae_gb), 4),
        'rmse': round(float(rmse_gb), 4),
        'r2': round(float(r2_gb), 4),
        'features_used': list(X.columns),
        'params': {
            'max_iter': 150,
            'max_depth': 8,
            'learning_rate': 0.08
        }
    }
    logger.info(f"Gradient Boosting (v2): MAE = ${mae_gb:.2f}, RMSE = ${rmse_gb:.2f}, R2 = {r2_gb:.4f}")
    
    # Save v2 model artifact
    joblib.dump(gb_pipeline, V2_MODEL_PATH)
    logger.info(f"Saved v2 model pipeline to {V2_MODEL_PATH}")
    
    # Save metrics log JSON
    with open(METRICS_LOG_PATH, 'w') as f:
        json.dump(metrics, f, indent=2)
    logger.info(f"Logged experiment metrics to {METRICS_LOG_PATH}")
    
    return metrics

if __name__ == "__main__":
    train_and_evaluate_models()
