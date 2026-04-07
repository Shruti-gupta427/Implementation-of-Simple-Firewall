@echo off
setlocal
echo 🛡️ Starting Simple Firewall Full-Stack...

:: --- 🚀 STEP 0: PRE-FLIGHT CHECKS ---

:: 1. Check for Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js not found. 
    echo 📥 Requesting Admin rights to install Node.js...
    
    :: Download the installer
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%temp%\node_installer.msi'"
    
    :: ✨ NEW: Explicitly trigger an Admin prompt for the installer
    powershell -Command "Start-Process msiexec.exe -ArgumentList '/i \"%temp%\node_installer.msi\" /qn /norestart' -Verb RunAs -Wait"
    
    echo ✅ Installation command sent. 
    echo ⚠️  IMPORTANT: Please RESTART this terminal window now to refresh your PATH!
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