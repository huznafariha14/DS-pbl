from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class FarePredictionRequest(BaseModel):
    pickup_latitude: float = Field(..., example=40.7589)
    pickup_longitude: float = Field(..., example=-73.9851)
    dropoff_latitude: float = Field(..., example=40.6413)
    dropoff_longitude: float = Field(..., example=-73.7781)
    pickup_datetime: str = Field(..., example="2026-09-17T18:00:00")
    passenger_count: int = Field(default=1, ge=1, le=6)
    demand_factor: Optional[float] = Field(default=1.0, ge=0.5, le=3.0)

class TripBookingRequest(BaseModel):
    quote_id: str
    rider_id: str = "rider-101"
    rider_name: str = "Alex Rider"

class DriverResponseRequest(BaseModel):
    quote_id: str
    action: str = Field(..., example="ACCEPT")  # "ACCEPT" or "DECLINE"
    driver_id: str = "drv-4829"
    driver_name: str = "Driver Marco"

class TripStatusUpdateRequest(BaseModel):
    quote_id: str
    new_status: str = Field(..., example="IN_TRANSIT")
    driver_lat: Optional[float] = None
    driver_lon: Optional[float] = None

class CancellationRequest(BaseModel):
    quote_id: str
    distance_driven_km: float = 0.5
    wait_minutes: float = 3.0

class AdminConfigUpdateRequest(BaseModel):
    base_fare: Optional[float] = Field(None, ge=1.0, le=10.0)
    per_km_rate: Optional[float] = Field(None, ge=0.5, le=5.0)
    max_surge_cap: Optional[float] = Field(None, ge=1.0, le=3.0)
    min_driver_floor: Optional[float] = Field(None, ge=2.0, le=15.0)
    driver_split_pct: Optional[float] = Field(None, ge=0.50, le=0.95)

class DisputeUpdateRequest(BaseModel):
    quote_id: str
    dispute_status: str = Field(..., example="RESOLVED_REFUND_DRIVER_KEPT")
    note: str

