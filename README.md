# TerraSync
### hosted at: https://terra-sync.onrender.com
![Description of image](PHOTO-2026-10-24-20-20-00%202.jpg)
A runnable Flask dashboard for an agricultural quadruped soil-monitoring project. It uses **dummy data only**; no physical robot or sensors are connected.

## Requirements
- Python 3.10+
- pip

## Run locally

```bash
python -m venv .venv
```

Activate the environment:

**Linux/macOS**
```bash
source .venv/bin/activate
```

**Windows PowerShell**
```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies and run:

```bash
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000

The SQLite database (`agribot.db`) and initial dummy samples are created automatically.

## Included routes
- `GET /` — dashboard
- `GET /api/status` — simulated robot status
- `GET /api/readings?limit=24` — recent readings
- `POST /api/demo/sample` — add one generated dummy reading
- `POST /api/readings` — save a future sensor payload as unverified

## Example sensor payload

```json
{
  "sample_id": "FIELD01_P001",
  "latitude": 25.033,
  "longitude": 121.5654,
  "soil_moisture": 28.4,
  "soil_temperature": 26.2,
  "soil_ec": 0.72,
  "nitrogen": 42,
  "phosphorus": 26,
  "potassium": 115
}
```

Send it to `POST /api/readings` with `Content-Type: application/json`.

## Important notes
- All initial records and robot status are simulated.
- Units for NPK values are placeholders until the actual sensor model and calibration are confirmed.
- Soil moisture/temperature/EC fields are illustrative; replace them with the parameters actually supported by your KWS-800.
- Before public deployment, disable debug mode, configure a strong secret, add authentication, validate sensor ranges, and protect mission-control endpoints.
- This starter has no physical robot command endpoint by design.
