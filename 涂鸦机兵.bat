@echo off
rem ============================================================
rem  GraffiBots - Windows launcher (2.0)
rem  Opens the game in a dedicated Edge / Chrome app window (no toolbar, no extensions,
rem  GPU acceleration on, no background throttling) - smoother than double-clicking the html.
rem  With Node.js installed it starts the local server first (LAN play + accounts);
rem  otherwise it opens the offline single-file build.
rem ============================================================
chcp 65001 >nul
setlocal EnableExtensions
title GraffiBots Launcher
cd /d "%~dp0"

set "PORT=3000"
set "PROFILE_DIR=%LOCALAPPDATA%\GraffiBots\browser"
set "PF86=%ProgramFiles(x86)%"
set "URL="
set "SERVER="

rem ---- 1. find a browser (Edge ships with Windows 10 / 11) ----
set "BROWSER="
if exist "%PF86%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%PF86%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%PF86%\Google\Chrome\Application\chrome.exe" set "BROWSER=%PF86%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

rem ---- 2. server.js + Node.js available: start the local server ----
if not exist "server.js" goto offline
where node >nul 2>nul
if errorlevel 1 goto offline

echo [GraffiBots] 正在启动本地服务器（端口 %PORT%）...
start "GraffiBots-Server" /min cmd /c "set PORT=%PORT%&& node server.js"
set "SERVER=1"
set /a TRIES=0
:waitport
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient('127.0.0.1',%PORT%);$c.Close();exit 0}catch{exit 1}" >nul 2>nul
if not errorlevel 1 goto serverup
set /a TRIES+=1
if %TRIES% geq 20 goto serverup
timeout /t 1 /nobreak >nul
goto waitport
:serverup
set "URL=http://localhost:%PORT%/"
goto launch

rem ---- 3. no Node.js: open the offline single-file build ----
:offline
set "HTML=%~dp0GraffiBots.html"
if not exist "%HTML%" set "HTML=%~dp0涂鸦机兵-单文件版.html"
if not exist "%HTML%" set "HTML=%~dp0public\index.html"
if not exist "%HTML%" (
  echo [GraffiBots] 找不到游戏文件：请把这个 bat 和「涂鸦机兵-单文件版.html」放在同一个文件夹里（先解压再运行）。
  pause
  exit /b 1
)
set "URL=file:///%HTML:\=/%"

rem ---- 4. open it as an app window ----
:launch
if not defined BROWSER (
  echo [GraffiBots] 没有找到 Edge / Chrome，用默认浏览器打开。
  start "" "%URL%"
  goto done
)
echo [GraffiBots] 正在打开游戏窗口...（关掉游戏窗口后这个窗口会自动关闭）
start "" /wait "%BROWSER%" --app="%URL%" --user-data-dir="%PROFILE_DIR%" --no-first-run --no-default-browser-check --start-maximized --ignore-gpu-blocklist --enable-gpu-rasterization --enable-zero-copy --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --autoplay-policy=no-user-gesture-required

rem ---- 5. game window closed: stop the local server too ----
if defined SERVER taskkill /fi "WINDOWTITLE eq GraffiBots-Server*" /t /f >nul 2>nul

:done
endlocal
exit /b 0
