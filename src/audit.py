import os
import json
import sqlite3
import logging
from datetime import datetime

logger = logging.getLogger("AuditLogger")

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
DB_PATH = os.path.join(DATA_DIR, "audit_log.db")

class AuditLogger:
    """
    Immutable audit logger recording all fare calculations, ML predictions,
    fairness adjustments, rider quotes, and driver payouts for transparency and dispute resolution.
    """
    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    quote_id TEXT UNIQUE NOT NULL,
                    timestamp TEXT NOT NULL,
                    pickup_location TEXT NOT NULL,
                    dropoff_location TEXT NOT NULL,
                    pickup_datetime TEXT NOT NULL,
                    passenger_count INTEGER NOT NULL,
                    distance_km REAL NOT NULL,
                    ml_prediction REAL NOT NULL,
                    raw_surge REAL NOT NULL,
                    applied_surge REAL NOT NULL,
                    is_surge_capped INTEGER NOT NULL,
                    rider_fare REAL NOT NULL,
                    driver_payout REAL NOT NULL,
                    is_floor_applied INTEGER NOT NULL,
                    floor_subsidy REAL NOT NULL,
                    status TEXT NOT NULL DEFAULT 'QUOTED',
                    dispute_status TEXT NOT NULL DEFAULT 'NONE',
                    driver_name TEXT DEFAULT 'Driver Marco',
                    vehicle_info TEXT DEFAULT 'Toyota Camry (NYC TLC #4829)',
                    driver_lat REAL DEFAULT 0.0,
                    driver_lon REAL DEFAULT 0.0,
                    full_payload TEXT NOT NULL
                )
            """)
            conn.commit()
            
            # Ensure new columns exist if DB was created previously
            for col, col_type in [
                ("driver_name", "TEXT DEFAULT 'Driver Marco'"),
                ("vehicle_info", "TEXT DEFAULT 'Toyota Camry (NYC TLC #4829)'"),
                ("driver_lat", "REAL DEFAULT 0.0"),
                ("driver_lon", "REAL DEFAULT 0.0")
            ]:
                try:
                    cursor.execute(f"ALTER TABLE audit_logs ADD COLUMN {col} {col_type}")
                    conn.commit()
                except sqlite3.OperationalError:
                    pass  # Column already exists

    def log_fare_calculation(self, quote_data: dict) -> bool:
        """
        Record a fare calculation event into the audit database.
        """
        try:
            quote_id = quote_data['quote_id']
            timestamp = datetime.utcnow().isoformat()
            trip = quote_data['trip_details']
            ml = quote_data['ml_model']
            rider = quote_data['rider_fare_breakdown']
            explain = quote_data['explainability']
            driver = quote_data['driver_payout_breakdown']

            pickup_loc = f"{trip.get('pickup_lat', 0.0):.4f},{trip.get('pickup_lon', 0.0):.4f}"
            dropoff_loc = f"{trip.get('dropoff_lat', 0.0):.4f},{trip.get('dropoff_lon', 0.0):.4f}"

            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO audit_logs (
                        quote_id, timestamp, pickup_location, dropoff_location, pickup_datetime,
                        passenger_count, distance_km, ml_prediction, raw_surge, applied_surge,
                        is_surge_capped, rider_fare, driver_payout, is_floor_applied, floor_subsidy,
                        status, dispute_status, driver_name, vehicle_info, driver_lat, driver_lon, full_payload
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    quote_id, timestamp, pickup_loc, dropoff_loc, trip['pickup_datetime'],
                    trip['passenger_count'], trip['distance_km'], ml['raw_fare_prediction'],
                    explain['surge_uncapped_requested'], explain['surge_demand_multiplier'],
                    1 if explain['is_surge_capped'] else 0, rider['total_rider_fare'],
                    driver['final_driver_payout'], 1 if driver['is_floor_subsidy_applied'] else 0,
                    driver['floor_subsidy_amount'], 'QUOTED', 'NONE',
                    'Driver Marco', 'Toyota Camry (NYC TLC #4829)',
                    trip.get('pickup_lat', 0.0), trip.get('pickup_lon', 0.0),
                    json.dumps(quote_data)
                ))
                conn.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")
            return False

    def update_trip_status(self, quote_id: str, new_status: str):
        """
        Update status of a trip (e.g. BOOKED, ACCEPTED, IN_TRANSIT, COMPLETED, CANCELLED, DECLINED).
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE audit_logs SET status = ? WHERE quote_id = ?", (new_status, quote_id))
            conn.commit()

    def update_trip_status_and_driver(self, quote_id: str, new_status: str, driver_name: str = None, vehicle_info: str = None, driver_lat: float = None, driver_lon: float = None):
        """
        Update status and driver telemetry for active trip tracking.
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            updates = ["status = ?"]
            params = [new_status]
            if driver_name:
                updates.append("driver_name = ?")
                params.append(driver_name)
            if vehicle_info:
                updates.append("vehicle_info = ?")
                params.append(vehicle_info)
            if driver_lat is not None:
                updates.append("driver_lat = ?")
                params.append(driver_lat)
            if driver_lon is not None:
                updates.append("driver_lon = ?")
                params.append(driver_lon)
            params.append(quote_id)
            cursor.execute(f"UPDATE audit_logs SET {', '.join(updates)} WHERE quote_id = ?", params)
            conn.commit()

    def get_pending_trips(self) -> list:
        """
        Fetch trips waiting for driver accept/decline.
        """
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM audit_logs WHERE status = 'PENDING_ACCEPTANCE' ORDER BY id DESC")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def get_logs(self, limit: int = 50, search: str = None) -> list:
        """
        Retrieve audit records for admin monitoring and dispute resolution.
        """
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            if search:
                cursor.execute("""
                    SELECT * FROM audit_logs 
                    WHERE quote_id LIKE ? OR status LIKE ? OR dispute_status LIKE ?
                    ORDER BY id DESC LIMIT ?
                """, (f"%{search}%", f"%{search}%", f"%{search}%", limit))
            else:
                cursor.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,))
            
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def get_log_by_quote_id(self, quote_id: str) -> dict:
        """
        Fetch single audit record payload.
        """
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM audit_logs WHERE quote_id = ?", (quote_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_latest_active_trip(self) -> dict:
        """
        Fetch the most recent trip in PENDING_ACCEPTANCE, ACCEPTED, or IN_TRANSIT status.
        """
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM audit_logs 
                WHERE status IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'IN_TRANSIT')
                ORDER BY id DESC LIMIT 1
            """)
            row = cursor.fetchone()
            return dict(row) if row else None


