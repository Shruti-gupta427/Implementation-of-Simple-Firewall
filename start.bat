@echo off
setlocal
echo 🛡️ Starting Simple Firewall Full-Stack...

:: --- 🚀 STEP 0: THE PRE-FLIGHT CHECK ---

:: 1. Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed!
    echo 📥 Downloading and installing Node.js for you...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile 'node_installer.msi'"
    msiexec.exe /i node_installer.msi /qn /norestart
    echo ✅ Node.js installed. Please RESTART this terminal to update your PATH.
    pause
    exit
)

:: 2. Check and Install Frontend Dependencies
if not exist "%~dp0firewall-frontend\node_modules\" (
    echo 📦 node_modules not found. Running npm install...
    cd /d "%~dp0firewall-frontend" && npm install
)

:: 3. Check and Install Backend Dependencies (Python)
if not exist "%~dp0.venv\" (
    echo 🐍 Virtual environment not found. Creating and installing...
    python -m venv .venv
    call .venv\Scripts\activate
    pip install -r requirements.txt
)

:: --- 🏁 STEP 1: START THE ENGINES ---

echo 🚀 Launching all systems...

:: Start the FastAPI Backend
start "FastAPI Backend" cmd /k "cd /d "%~dp0backend" && call ..\.venv\Scripts\activate && python app.py"

:: Start the React Frontend
start "React Dashboard" cmd /k "cd /d "%~dp0firewall-frontend" && npm run dev"

:: Start the Engine as Admin
echo Requesting Administrator privileges for the Packet Engine...
powershell -Command "Start-Process cmd -ArgumentList '/k cd /d \"%~dp0backend\" && call ..\.venv\Scripts\activate && python engine.py' -Verb RunAs"

echo ✅ All systems online!
endlocal