# Simple Firewall Project

A full-stack packet filtering demo with:
- FastAPI backend (`backend/`)
- React + Vite frontend (`firewall-frontend/`)
- Packet engine (`backend/engine.py`) that requires Administrator privileges on Windows

## Quick Start (Recommended)

Use the provided `start.bat` from the project root.

```bat
start.bat
```

What `start.bat` does:
- Checks Node.js version (installs Node v24.14.1 if missing/outdated)
- Creates Python virtual environment in `backend/.venv` (if missing)
- Installs backend requirements and frontend npm packages (if missing)
- Initializes database `backend/firewall.db` (if missing)
- Launches:
  - Backend API (`python app.py`)
  - Frontend dashboard (`npm run dev`)
  - Packet engine (`python engine.py`) with Admin rights

After startup:
- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://127.0.0.1:5000](http://127.0.0.1:5000)

## How to Use

1. Open the dashboard in your browser (`http://localhost:5173`).
2. Watch packet flow from `Internet -> FW-01 -> Local Host`.
3. Add rules from **Rule Dashboard**:
   - Enter IP/subnet
   - Optional port
   - Protocol and direction filters
   - Click **Add Rule**
4. Trigger traffic and observe:
   - Allowed packets continue to host
   - Blocked packets turn red and shake at firewall
   - Rejection details appear below firewall (reason, source, destination, type, port, protocol)
5. Use **Delete** in rules table to remove rules.

## If `start.bat` Fails: Manual Setup

Run these steps from project root in separate terminals.

### 1) Prerequisites

- Windows 10/11
- Python 3.10+ (`python --version`)
- Node.js 20+ (project script expects modern Node; v24 works)
- Administrator access (required for packet engine/sniffing)

### 2) Backend Setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python database.py
```

### 3) Start Backend API

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python app.py
```

Expected: FastAPI running on `127.0.0.1:5000`.

### 4) Frontend Setup + Run

```powershell
cd firewall-frontend
npm install
npm run dev
```

Expected: Vite running on `http://localhost:5173`.

### 5) Start Packet Engine (Admin Terminal)

Open a new **Administrator** PowerShell/CMD:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python engine.py
```

Without admin privileges, packet capture/injection may fail.

## Common Issues and Fixes

- `ModuleNotFoundError: No module named 'fastapi'`
  - Activate backend venv and run `pip install -r backend/requirements.txt`.

- `node`/`npm` not found
  - Install Node.js, then restart terminal.

- Frontend opens but no live traffic
  - Verify backend API and engine are both running.
  - Check API at `http://127.0.0.1:5000`.

- Engine permission errors
  - Run `engine.py` from an Administrator terminal.

- Port already in use (`5000` or `5173`)
  - Stop old processes or change ports in backend/frontend configs.

## Project Structure

- `start.bat` - One-click launcher
- `backend/app.py` - FastAPI + WebSocket API
- `backend/engine.py` - Packet engine
- `backend/database.py` - Database initialization
- `backend/requirements.txt` - Python dependencies
- `firewall-frontend/` - React dashboard

