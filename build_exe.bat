@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "NEXT_TELEMETRY_DISABLED=1"
set "npm_config_fund=false"
set "npm_config_audit=false"
set "npm_config_progress=true"
set "npm_config_loglevel=notice"
set "npm_config_fetch_retries=2"
set "npm_config_fetch_timeout=60000"
set "npm_config_cache=%~dp0.build_tools\npm-cache"
set "PY_VER="
set "NODE_HOME="
set "NODE_SOURCE="

if not exist ".build_tools" mkdir ".build_tools"

echo ============================================================
echo type_0 3.1.4 - Windows build
echo ============================================================
echo.
echo This script continues automatically after preparing Node.js.
echo The React dependencies and packaging can take several minutes.
echo.

echo [1/6] Checking Python...
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
if not defined PY_VER goto NO_PYTHON
echo Using Python %PY_VER%

echo.
echo [2/6] Installing Python dependencies...
py -%PY_VER% -m pip --disable-pip-version-check install -r requirements.txt
if errorlevel 1 goto PYTHON_DEPS_FAILED

echo.
echo [3/6] Checking Node.js and npm...
where node >nul 2>&1
if not errorlevel 1 (
  node -e "const p=process.versions.node.split('.').map(Number);process.exit((p[0]>=22||(p[0]===20&&p[1]>=9))?0:1)" >nul 2>&1
  if not errorlevel 1 (
    where npm >nul 2>&1
    if not errorlevel 1 (
      set "NODE_SOURCE=system"
      goto NODE_READY
    )
  )
)

echo No compatible system Node.js found. Checking portable Node.js...
if not exist ".build_tools\node_path.txt" (
  echo Preparing official portable Node.js 22 LTS. Please wait...
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_node.ps1"
  if errorlevel 1 goto NODE_SETUP_FAILED
)
if not exist ".build_tools\node_path.txt" goto NODE_SETUP_FAILED

rem Use FOR /F to read paths reliably, including paths containing spaces.
for /f "usebackq delims=" %%N in (".build_tools\node_path.txt") do set "NODE_HOME=%%N"
if not defined NODE_HOME goto NODE_SETUP_FAILED
if not exist "%NODE_HOME%\node.exe" goto NODE_SETUP_FAILED
if not exist "%NODE_HOME%\npm.cmd" goto NODE_SETUP_FAILED
set "PATH=%NODE_HOME%;%PATH%"
set "NODE_SOURCE=portable"

echo Portable Node.js is ready at:
echo %NODE_HOME%

goto NODE_READY

:NODE_READY
echo Node source: %NODE_SOURCE%
echo Node version:
if /i "%NODE_SOURCE%"=="portable" (
  call "%NODE_HOME%\node.exe" --version
) else (
  node --version
)
if errorlevel 1 goto NODE_RUNTIME_FAILED
echo npm version:
if /i "%NODE_SOURCE%"=="portable" (
  call "%NODE_HOME%\npm.cmd" --version
) else (
  call npm.cmd --version
)
if errorlevel 1 goto NODE_RUNTIME_FAILED

echo.
echo Checking access to the npm package registry. This may take up to 30 seconds...
if /i "%NODE_SOURCE%"=="portable" (
  call "%NODE_HOME%\npm.cmd" ping --fetch-timeout=30000 --fetch-retries=0
) else (
  call npm.cmd ping --fetch-timeout=30000 --fetch-retries=0
)
if errorlevel 1 goto NPM_REGISTRY_FAILED

echo.
echo [4/6] Installing JavaScript packages. This can take several minutes...
if /i "%NODE_SOURCE%"=="portable" (
  call "%NODE_HOME%\npm.cmd" install --no-audit --no-fund --no-progress --loglevel=notice
) else (
  call npm.cmd install --no-audit --no-fund --no-progress --loglevel=notice
)
if errorlevel 1 goto NPM_FAILED

echo.
echo [5/6] Building the React interface...
if /i "%NODE_SOURCE%"=="portable" (
  call "%NODE_HOME%\npm.cmd" run build
) else (
  call npm.cmd run build
)
if errorlevel 1 goto UI_BUILD_FAILED
if not exist "out\index.html" goto NO_UI

echo.
echo [6/6] Packaging the type_0 desktop app...
if exist "build\type_0" rmdir /s /q "build\type_0"
if exist "dist\type_0" rmdir /s /q "dist\type_0"
py -%PY_VER% -m PyInstaller --noconfirm --clean --windowed --onedir --name type_0 --icon "assets\type_0.ico" --add-data "out;out" --add-data "assets;assets" --collect-all webview --collect-all pystray --collect-all PIL --collect-all clr_loader --hidden-import=clr --hidden-import=clr_loader --hidden-import=pythonnet --hidden-import=webview.platforms.edgechromium --hidden-import=webview.platforms.winforms --hidden-import=webview.platforms.mshtml webview_main.py
if errorlevel 1 goto PYINSTALLER_FAILED
if not exist "dist\type_0\type_0.exe" goto NO_EXE

echo.
echo Building the installer if Inno Setup 6 is installed...
if not exist "installer_output" mkdir "installer_output"
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" (
  "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" "installer.iss"
  if errorlevel 1 goto INSTALLER_FAILED
) else if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" (
  "%ProgramFiles%\Inno Setup 6\ISCC.exe" "installer.iss"
  if errorlevel 1 goto INSTALLER_FAILED
) else (
  echo Inno Setup 6 was not found. The application was built successfully.
  echo To create Setup.exe, open installer.iss in Inno Setup Compiler and press F9.
)

echo.
echo BUILD SUCCESSFUL.
echo App:       dist\type_0\type_0.exe
if exist "installer_output\type_0_Setup_3.1.4.exe" echo Installer: installer_output\type_0_Setup_3.1.4.exe
echo.
if /i "%~1"=="--no-launch" goto SUCCESS_NO_LAUNCH
set "LAUNCH_NOW="
set /p "LAUNCH_NOW=Launch type_0 now? [Y/n]: "
if /i not "%LAUNCH_NOW%"=="n" start "" "%~dp0dist\type_0\type_0.exe"
echo.
pause
exit /b 0

:SUCCESS_NO_LAUNCH
echo Build finished. Returning to the calling script without launching the app.
exit /b 0

:NO_PYTHON
echo ERROR: Python 3.12 x64 is recommended. Python 3.11 and 3.13 are also supported.
echo Install Python from https://www.python.org/downloads/windows/ and enable Python Launcher.
goto BUILD_FAILED
:PYTHON_DEPS_FAILED
echo ERROR: Python requirements failed to install. Check the pip error above.
goto BUILD_FAILED
:NODE_SETUP_FAILED
echo ERROR: Portable Node.js is not ready.
echo Check whether .build_tools\node_path.txt and node.exe exist in the folder shown above.
echo You can install Node.js 22 LTS manually from https://nodejs.org/en/download.
goto BUILD_FAILED
:NODE_RUNTIME_FAILED
echo ERROR: Node.js or npm could not run. Check antivirus quarantine and .build_tools contents.
goto BUILD_FAILED
:NPM_REGISTRY_FAILED
echo ERROR: Node/npm work, but registry.npmjs.org is not reachable from this PC.
echo Check DNS, proxy, VPN, or firewall, then run build_exe.bat again.
goto BUILD_FAILED
:NPM_FAILED
echo ERROR: npm install failed. A detailed npm log is stored under .build_tools\npm-cache\_logs.
goto BUILD_FAILED
:UI_BUILD_FAILED
echo ERROR: Next.js could not export the UI. Read the first npm error above.
goto BUILD_FAILED
:NO_UI
echo ERROR: out\index.html was not created. The static UI export did not finish.
goto BUILD_FAILED
:PYINSTALLER_FAILED
echo ERROR: PyInstaller failed. Read the traceback above.
goto BUILD_FAILED
:NO_EXE
echo ERROR: dist\type_0\type_0.exe was not created.
goto BUILD_FAILED
:INSTALLER_FAILED
echo ERROR: Inno Setup failed. The app may still be available in dist\type_0.
goto BUILD_FAILED

:BUILD_FAILED
echo.
echo BUILD FAILED. Fix the first reported error before launching the app.
echo If npm failed, inspect .build_tools\npm-cache\_logs for the full log.
echo.
pause
exit /b 1
