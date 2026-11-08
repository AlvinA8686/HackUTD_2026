@echo off
cd /d "%~dp0"
echo Starting NEXUS Property Intelligence...
echo Open http://127.0.0.1:3000 in your browser after the server starts.
node server.js
if errorlevel 1 pause
