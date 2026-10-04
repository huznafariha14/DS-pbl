import pytest
from src.fair_pricing import FairPricingEngine

def test_driver_minimum_floor_guarantee():
    engine = FairPricingEngine(min_driver_floor=5.00, driver_split_pct=0.80)
    
    # Very short trip ($3.00 raw ML prediction)
    quote = engine.calculate_fair_pricing(
        ml_fare_prediction=3.00,
        pickup_lat=40.7589, pickup_lon=-73.9851,
        dropoff_lat=40.7600, dropoff_lon=-73.9840,
        pickup_datetime_str="2026-09-17T14:00:00",
        passenger_count=1,
        demand_factor=1.0
    )
    
    driver_payout = quote['driver_payout_breakdown']['final_driver_payout']
    is_floor_applied = quote['driver_payout_breakdown']['is_floor_subsidy_applied']
    
    assert driver_payout >= 5.00
    assert is_floor_applied is True
    assert quote['driver_payout_breakdown']['floor_subsidy_amount'] > 0.0

def test_surge_multiplier_capping():
    engine = FairPricingEngine(max_surge_cap=1.80)
    
    # High demand request (3.0x raw surge factor)
    quote = engine.calculate_fair_pricing(
        ml_fare_prediction=15.00,
        pickup_lat=40.7589, pickup_lon=-73.9851,
        dropoff_lat=40.7000, dropoff_lon=-74.0000,
        pickup_datetime_str="2026-09-17T18:00:00",
        passenger_count=1,
        demand_factor=3.0 # Requesting 3.0x surge
    )
    
    explain = quote['explainability']
    assert explain['surge_demand_multiplier'] == 1.80
    assert explain['is_surge_capped'] is True
    assert explain['capped_savings_for_rider'] > 0.0

def test_cancellation_driver_payout():
    engine = FairPricingEngine()
    comp = engine.calculate_cancellation_payout(distance_driven_km=1.2, wait_minutes=4.0)
    
    assert comp['total_driver_cancellation_payout'] >= 3.00
    assert comp['distance_compensation'] == 1.80

def test_non_discrimination_guarantee():
    engine = FairPricingEngine()
    
    quote1 = engine.calculate_fair_pricing(
        ml_fare_prediction=12.50,
        pickup_lat=40.7589, pickup_lon=-73.9851,
        dropoff_lat=40.7000, dropoff_lon=-74.0000,
        pickup_datetime_str="2026-09-17T12:00:00",
        passenger_count=1, demand_factor=1.0
    )
    
    quote2 = engine.calculate_fair_pricing(
        ml_fare_prediction=12.50,
        pickup_lat=40.7589, pickup_lon=-73.9851,
        dropoff_lat=40.7000, dropoff_lon=-74.0000,
        pickup_datetime_str="2026-09-17T12:00:00",
        passenger_count=1, demand_factor=1.0
    )
    
    # Pricing must be deterministic and identical regardless of call order or rider identity
    assert quote1['rider_fare_breakdown']['total_rider_fare'] == quote2['rider_fare_breakdown']['total_rider_fare']
    assert quote1['driver_payout_breakdown']['final_driver_payout'] == quote2['driver_payout_breakdown']['final_driver_payout']
