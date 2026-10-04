import time
import uuid
import numpy as np
from src.feature_engineering import haversine_distance, extract_time_features

class FairPricingEngine:
    """
    Two-Sided Fair Pricing Engine sitting on top of the raw ML fare prediction.
    Enforces rider transparency & caps, driver guaranteed floors, and non-discrimination.
    """
    def __init__(
        self,
        base_fare: float = 2.50,
        per_km_rate: float = 1.50,
        per_minute_rate: float = 0.35,
        max_surge_cap: float = 1.80,
        min_driver_floor: float = 5.00,
        driver_split_pct: float = 0.80,
        platform_fee_pct: float = 0.12,
        tax_pct: float = 0.08
    ):
        self.base_fare = base_fare
        self.per_km_rate = per_km_rate
        self.per_minute_rate = per_minute_rate
        self.max_surge_cap = max_surge_cap
        self.min_driver_floor = min_driver_floor
        self.driver_split_pct = driver_split_pct
        self.platform_fee_pct = platform_fee_pct
        self.tax_pct = tax_pct
        
    def calculate_fair_pricing(
        self,
        ml_fare_prediction: float,
        pickup_lat: float,
        pickup_lon: float,
        dropoff_lat: float,
        dropoff_lon: float,
        pickup_datetime_str: str,
        passenger_count: int,
        demand_factor: float = 1.0
    ) -> dict:
        """
        Calculate complete transparent breakdown for rider & guaranteed fair payout for driver.
        """
        # 1. Calculate trip distance
        distance_km = haversine_distance(pickup_lat, pickup_lon, dropoff_lat, dropoff_lon)
        
        # Estimate trip duration (assuming avg NYC speed 25 km/h)
        estimated_minutes = max(3.0, (distance_km / 25.0) * 60.0)
        
        # 2. Time features
        df_time = extract_time_features(pd.DataFrame({'pickup_datetime': [pickup_datetime_str]}))
        hour = int(df_time['hour'].iloc[0])
        is_rush_hour = int(df_time['is_rush_hour'].iloc[0]) == 1
        is_weekend = int(df_time['is_weekend'].iloc[0]) == 1
        
        # 3. Calculate raw surge and apply hard cap
        raw_surge = demand_factor
        if is_rush_hour:
            raw_surge *= 1.25
        if is_weekend and (hour >= 21 or hour <= 3):
            raw_surge *= 1.20
            
        applied_surge = min(raw_surge, self.max_surge_cap)
        is_surge_capped = raw_surge > self.max_surge_cap
        
        # 4. Itemized Cost Components
        distance_component = round(distance_km * self.per_km_rate, 2)
        time_component = round(estimated_minutes * self.per_minute_rate, 2)
        base_component = self.base_fare
        
        # Use ML prediction as the baseline subtotal, adjusted by capped surge
        unadjusted_subtotal = max(base_component + distance_component + time_component, ml_fare_prediction)
        subtotal_fare = round(unadjusted_subtotal * applied_surge, 2)
        surge_amount = round(subtotal_fare - unadjusted_subtotal, 2)
        
        tax_and_fees = round(subtotal_fare * self.tax_pct, 2)
        final_rider_fare = round(subtotal_fare + tax_and_fees, 2)
        
        # 5. Explainability Breakdown ("Why this price?")
        # Contribution breakdown relative to standard baseline trip
        base_contrib = round(base_component, 2)
        dist_contrib = round(distance_component, 2)
        time_contrib = round(time_component, 2)
        rush_contrib = round(unadjusted_subtotal * 0.15, 2) if is_rush_hour else 0.0
        surge_contrib = round(surge_amount, 2)
        
        explainability = {
            'base_fare': base_contrib,
            'distance_contribution': dist_contrib,
            'time_contribution': time_contrib,
            'rush_hour_factor': rush_contrib,
            'surge_demand_multiplier': round(applied_surge, 2),
            'surge_uncapped_requested': round(raw_surge, 2),
            'is_surge_capped': is_surge_capped,
            'capped_savings_for_rider': round((raw_surge - applied_surge) * unadjusted_subtotal, 2) if is_surge_capped else 0.0,
            'summary': f"Distance ({distance_km:.2f} km) contributes ${dist_contrib:.2f}, Time ({estimated_minutes:.1f} min) contributes ${time_contrib:.2f}."
        }
        
        # 6. Driver Payout Calculation with Minimum Floor Protection
        # Driver gets 80% cut of base fare + 100% of surge bonus
        driver_base_cut = unadjusted_subtotal * self.driver_split_pct
        driver_surge_cut = surge_amount * 0.90 # Driver receives 90% of surge multiplier
        raw_driver_payout = driver_base_cut + driver_surge_cut
        
        is_floor_applied = raw_driver_payout < self.min_driver_floor
        floor_subsidy = round(self.min_driver_floor - raw_driver_payout, 2) if is_floor_applied else 0.0
        final_driver_payout = round(max(self.min_driver_floor, raw_driver_payout), 2)
        platform_net_take = round(final_rider_fare - final_driver_payout - tax_and_fees, 2)
        
        driver_breakdown = {
            'raw_payout': round(raw_driver_payout, 2),
            'minimum_floor': self.min_driver_floor,
            'is_floor_subsidy_applied': bool(is_floor_applied),
            'floor_subsidy_amount': floor_subsidy,
            'driver_split_pct': int(self.driver_split_pct * 100),
            'final_driver_payout': final_driver_payout,
            'summary': f"Driver guaranteed floor of ${self.min_driver_floor:.2f} enforced. Floor subsidy added: ${floor_subsidy:.2f}." if is_floor_applied else f"Driver payout of ${final_driver_payout:.2f} calculated ({int(self.driver_split_pct*100)}% base + surge)."
        }

        
        # 7. Quote Locking (15 mins)
        quote_id = f"Q-{uuid.uuid4().hex[:8].upper()}"
        created_at = int(time.time())
        expires_at = created_at + 900  # 15 minutes
        
        return {
            'quote_id': quote_id,
            'created_at': created_at,
            'expires_at': expires_at,
            'trip_details': {
                'distance_km': round(distance_km, 2),
                'estimated_minutes': round(estimated_minutes, 1),
                'passenger_count': passenger_count,
                'pickup_datetime': pickup_datetime_str,
                'is_rush_hour': is_rush_hour,
                'is_weekend': is_weekend
            },
            'ml_model': {
                'raw_fare_prediction': round(ml_fare_prediction, 2),
                'confidence_interval_95': [
                    round(max(2.50, ml_fare_prediction - 1.96 * 2.10), 2),
                    round(ml_fare_prediction + 1.96 * 2.10, 2)
                ]
            },
            'rider_fare_breakdown': {
                'base_fare': base_component,
                'distance_fee': distance_component,
                'time_fee': time_component,
                'surge_multiplier': round(applied_surge, 2),
                'surge_amount': surge_amount,
                'subtotal': subtotal_fare,
                'taxes_and_fees': tax_and_fees,
                'total_rider_fare': final_rider_fare
            },
            'explainability': explainability,
            'driver_payout_breakdown': driver_breakdown,
            'platform_finance': {
                'platform_net_revenue': platform_net_take,
                'tax_collected': tax_and_fees
            }
        }
        
    def calculate_cancellation_payout(self, distance_driven_km: float, wait_minutes: float) -> dict:
        """
        Calculate driver compensation for aborted or cancelled trips.
        """
        cancellation_base = 2.50
        distance_comp = round(distance_driven_km * self.per_km_rate, 2)
        wait_comp = round(wait_minutes * 0.40, 2)
        total_compensation = round(max(self.min_driver_floor * 0.6, cancellation_base + distance_comp + wait_comp), 2)
        
        return {
            'cancellation_base': cancellation_base,
            'distance_compensation': distance_comp,
            'wait_time_compensation': wait_comp,
            'total_driver_cancellation_payout': total_compensation,
            'reason': "Driver compensated for time & distance on aborted trip."
        }

# Need pandas for extract_time_features call inside calculate_fair_pricing
import pandas as pd
