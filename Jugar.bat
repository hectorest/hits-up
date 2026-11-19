@echo off
title Hit's Up
cd /d "%~dp0"
where node >nul 2>nul || (echo. & echo  Falta instalar Node.js: descargalo de https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo. & echo. & pause & exit /b)
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000/tv"
node server.js
pause
