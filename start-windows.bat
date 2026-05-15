@echo off
cd /d "%~dp0"
echo PDF Hanko Reader local server starting...
echo.
echo Open this URL in Chrome if it does not open automatically:
echo http://localhost:8000
start http://localhost:8000
python -m http.server 8000
pause
