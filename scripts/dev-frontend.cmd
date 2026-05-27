@echo off
setlocal
cd /d "%~dp0.."
set "PATH=%CD%\.tools\node-v24.14.0-win-x64;%PATH%"
if not exist ".logs" mkdir ".logs"
call ".tools\node-v24.14.0-win-x64\npm.cmd" run dev:frontend > ".logs\frontend.out.log" 2> ".logs\frontend.err.log"
