@echo off
cd /d "%~dp0"
set "PATH=%~dp0.venv\Scripts;%PATH%"
".venv\Scripts\python.exe" make_transition.py list
echo.
cmd /k
