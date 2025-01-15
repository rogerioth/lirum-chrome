@echo off
echo Building and running Lirum Chrome Extension...

:: Build the extension
call npm run build

:: Create a temporary user data directory if it doesn't exist
if not exist "%~dp0..\..\temp-chrome-data" mkdir "%~dp0..\..\temp-chrome-data"

:: Check if Chrome exists in common locations
set "CHROME_PATH="
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    set "CHROME_PATH=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if "%CHROME_PATH%"=="" (
    echo Chrome not found in common locations. Please install Chrome or update the script with the correct path.
    exit /b 1
)

:: Launch Chrome with the extension
echo Launching Chrome with the extension...
"%CHROME_PATH%" --load-extension="%~dp0..\..\dist" --user-data-dir="%~dp0..\..\temp-chrome-data" --no-first-run --no-default-browser-check 