@echo off
cd /d "%~dp0"
start "Journal server" /min python server.py
rem Wait up to 30 seconds for the server to answer before opening the browser.
for /l %%i in (1,1,30) do (
  curl -s -o nul http://localhost:8765/ && goto open
  timeout /t 1 /nobreak >nul
)
:open
start "" http://localhost:8765
