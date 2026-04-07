@echo off
echo 🛡️ Starting Simple Firewall Full-Stack...

:: 1. Start the FastAPI Backend
start "FastAPI Backend" cmd /k "cd /d "%~dp0backend" && call ..\.venv\Scripts\activate && python app.py"

:: 2. Start the React Frontend
start "React Dashboard" cmd /k "cd /d "%~dp0firewall-frontend" && npm run dev"

:: 3. Start the Engine (Bulletproof Absolute Path Fix)
echo Requesting Administrator privileges for the Packet Engine...
powershell -Command "Start-Process cmd -ArgumentList '/k cd /d \"%~dp0backend\" && call ..\.venv\Scripts\activate && python engine.py' -Verb RunAs"

echo ✅ All systems go! You can close this window.