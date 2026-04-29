@echo off
REM sanpo - 一発で git pull → Claude Code で開く
cd /d "%~dp0"
echo === Pulling latest from GitHub ===
git pull
echo.
echo === Opening Claude Code ===
claude .
