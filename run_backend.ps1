cd backend
if (-Not (Test-Path "venv")) {
    py -3.11 -m venv venv
    .\venv\Scripts\Activate.ps1
    pip install -r requirements.txt
} else {
    .\venv\Scripts\Activate.ps1
}
python -m uvicorn app.main:app --reload --port 8000
