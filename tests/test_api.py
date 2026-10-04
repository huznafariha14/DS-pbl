import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200

def test_predict_fare_endpoint():
    payload = {
        "pickup_latitude": 40.7589,
        "pickup_longitude": -73.9851,
        "dropoff_latitude": 40.6413,
        "dropoff_longitude": -73.7781,
        "pickup_datetime": "2026-09-17T18:00:00",
        "passenger_count": 2
    }
    response = client.post("/api/predict-fare", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "predicted_fare" in data
    assert "confidence_interval_95" in data
    assert data["predicted_fare"] > 0

def test_calculate_price_endpoint():
    payload = {
        "pickup_latitude": 40.7589,
        "pickup_longitude": -73.9851,
        "dropoff_latitude": 40.6413,
        "dropoff_longitude": -73.7781,
        "pickup_datetime": "2026-09-17T18:00:00",
        "passenger_count": 1,
        "demand_factor": 2.5 # High surge attempt
    }
    response = client.post("/api/calculate-price", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "quote_id" in data
    assert "rider_fare_breakdown" in data
    assert "driver_payout_breakdown" in data
    assert data["explainability"]["surge_demand_multiplier"] <= 1.80

def test_admin_config_update():
    payload = {"min_driver_floor": 6.50, "max_surge_cap": 2.0}
    response = client.post("/api/admin/config", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["updated_policy"]["min_driver_floor"] == 6.50
    assert data["updated_policy"]["max_surge_cap"] == 2.0
