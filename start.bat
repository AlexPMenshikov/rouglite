@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\ws\package.json" (
  where npm >nul 2>nul
  if errorlevel 1 (
    echo npm is required to install the LAN server dependency.
    pause
    exit /b 1
  )
  call npm install
  if errorlevel 1 (
    echo Could not install the LAN server dependency.
    pause
    exit /b 1
  )
)
node server.js
if errorlevel 1 pause
