@echo off
setlocal
echo 🛡️ Starting Simple Firewall Full-Stack...

:: --- 🚀 STEP 0: PRE-FLIGHT CHECKS ---

:: 1. Check for Node.js and Verify Version
set NEED_NODE=0
set NODE_MAJOR=0

node -v >nul 2>&1
if %errorlevel% neq 0 (
    set NEED_NODE=1
) else (
    :: Grab the version, strip the 'v', and pick the first number
    for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
)

:: Debug line (you can remove this after it works)
echo 🔍 Detected Node Major Version: %NODE_MAJOR%

:: Compare numbers: If 0 (missing) or less than 24, trigger install
if %NODE_MAJOR% LSS 24 set NEED_NODE=1

if "%NEED_NODE%"=="1" (
    echo ❌ Node.js is missing or outdated (v%NODE_MAJOR% detected, Vite needs v20+^). 
    echo 📥 Downloading Node.js v20 LTS...
    
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.14.1/node-v24.14.1-x64.msi' -OutFile '%temp%\node_installer.msi'"
    
    echo 🔐 Requesting Admin rights to upgrade Node...
    powershell -Command "Start-Process msiexec.exe -ArgumentList '/i \"%temp%\node_installer.msi\" /qn /norestart' -Verb RunAs -Wait"
    
    echo ✅ Node.js v20.11.0 installed.
    echo ⚠️  IMPORTANT: You MUST RESTART this terminal now!
    pause
    exit
)

:: 2. Setup Python Virtual Environment (Targeting Backend Folder)
if not exist "%~dp0backend\.venv\" (
    echo 🐍 Creating Python Virtual Environment in backend...
    cd /d "%~dp0backend"
    python -m venv .venv
    echo 📦 Installing Python Requirements...
    call .venv\Scripts\activate && python -m pip install --upgrade pip && pip install -r requirements.txt
    cd /d "%~dp0"
)

:: 3. Setup Frontend Dependencies
if not exist "%~dp0firewall-frontend\node_modules\" (
    echo 📦 Running npm install...
    cd /d "%~dp0firewall-frontend" && npm install
    cd /d "%~dp0"
)

:: 4. --- ✨ NEW: Auto-Initialize Database if missing ---
if not exist "%~dp0backend\firewall.db" (
    echo 🗄️ Database not found. Initializing...
    cd /d "%~dp0backend" && call .venv\Scripts\activate && python database.py
)

:: --- 🏁 STEP 1: START THE ENGINES ---

echo 🚀 Launching all systems...

:: Start the FastAPI Backend
start "FastAPI Backend" cmd /k "cd /d "%~dp0backend" && call .venv\Scripts\activate && python app.py"

:: Start the React Frontend
start "React Dashboard" cmd /k "cd /d "%~dp0firewall-frontend" && npm run dev"

:: Start the Engine as Admin
echo Requesting Administrator privileges for the Packet Engine...
powershell -Command "Start-Process cmd -ArgumentList '/k cd /d \"%~dp0backend\" && call .venv\Scripts\activate && python engine.py' -Verb RunAs"

echo ✅ All systems online!
endlocal