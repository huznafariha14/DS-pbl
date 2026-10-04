# FairFare NYC — Taxi Fare Prediction & Fair Pricing Platform

Production-ready MLOps platform for taxi fare prediction featuring a two-sided fairness layer, FastAPI REST backend, Leaflet.js interactive NYC map frontend, and immutable audit logs.

## Quick Start

### 1. Run Data Pipeline & Train Models
```bash
python -m src.data_pipeline
python -m src.train
```

### 2. Run Automated Tests
```bash
pytest tests/
```

### 3. Launch Web Server
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000
```
Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your web browser.

### 4. Run via Docker Compose
```bash
docker-compose up --build
```

## Project Structure
- `src/data_pipeline.py`: Dataset generation, ingestion, hardened cleaning (99.7% retention).
- `src/feature_engineering.py`: Haversine distance, temporal features, congestion scaffolding.
- `src/train.py`: Model benchmarks (Linear Regression, Random Forest, XGBoost) & pipeline serialization.
- `src/fair_pricing.py`: Two-sided fairness engine (rider surge caps, driver floor guarantee, explainability).
- `src/audit.py`: Immutable SQLite audit logging.
- `app/main.py`: FastAPI REST API server & web interface routes.
- `app/static/`: Interactive 3-in-1 web UI (Rider, Driver, Admin).
- `tests/`: Pytest suite.
- `review_3_presentation.md`: Review 3 Capstone Report.
