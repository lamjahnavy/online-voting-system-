@echo off
title Voting App - Local Server
echo ================================================
echo   VOTING APP - Starting Local Server
echo ================================================
echo.

:: Try Python 3 first
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Python found - starting server...
    echo.
    echo Server running at: http://localhost:8000/voter.html
    echo Admin panel at:    http://localhost:8000/admin.html
    echo.
    echo Press Ctrl+C to stop the server.
    echo ================================================
    start "" "http://localhost:8000/voter.html"
    python -m http.server 8000
    goto end
)

:: Try Python 3 explicit
python3 --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Python3 found - starting server...
    echo.
    echo Server running at: http://localhost:8000/voter.html
    echo Admin panel at:    http://localhost:8000/admin.html
    echo.
    echo Press Ctrl+C to stop the server.
    echo ================================================
    start "" "http://localhost:8000/voter.html"
    python3 -m http.server 8000
    goto end
)

:: Try Node.js npx serve
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo [OK] Node.js found - starting server...
    echo.
    echo Server running at: http://localhost:3000/voter.html
    echo Admin panel at:    http://localhost:3000/admin.html
    echo.
    echo Press Ctrl+C to stop the server.
    echo ================================================
    start "" "http://localhost:3000/voter.html"
    npx serve . -p 3000
    goto end
)

:: Nothing found
echo [ERROR] Neither Python nor Node.js found on this computer.
echo.
echo Please install one of these (free):
echo   Python: https://www.python.org/downloads/
echo   Node.js: https://nodejs.org/
echo.
echo After installing, double-click START_SERVER.bat again.
echo.
pause
:end
