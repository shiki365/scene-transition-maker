@echo off
cd /d "%~dp0"
".venv\Scripts\python.exe" make_transition.py all --open
echo.
pause
