@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PY_VER="
py -3.12 --version >nul 2>&1
if not errorlevel 1 set "PY_VER=3.12"
if not defined PY_VER (
  py -3.11 --version >nul 2>&1
  if not errorlevel 1 set "PY_VER=3.11"
)
if not defined PY_VER (
  py -3.13 --version >nul 2>&1
  if not errorlevel 1 set "PY_VER=3.13"
)
if not defined PY_VER (
  echo ERROR: Install Python 3.12 x64 (recommended), 3.11 or 3.13 first.
  pause
  exit /b 1
)
if not exist "out\index.html" (
  echo UI bundle is not built yet. Starting the full build first...
  call "%~dp0build_exe.bat" --no-launch
  if errorlevel 1 exit /b 1
)
py -%PY_VER% -c "import webview, psutil, pystray, PIL" >nul 2>&1
if errorlevel 1 (
  echo Installing missing Python dependencies...
  py -%PY_VER% -m pip --disable-pip-version-check install -r requirements.txt
  if errorlevel 1 goto FAIL
)
set PYTHONFAULTHANDLER=1
py -%PY_VER% webview_main.py
if errorlevel 1 goto FAIL
endlocal
exit /b 0
:FAIL
echo.
echo type_0 stopped with an error. See "%APPDATA%\type_0\crash.log"
pause
endlocal
exit /b 1
