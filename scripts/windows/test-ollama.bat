@echo off
if "%~1"=="" (
    echo Usage: test-ollama.bat [host] [model]
    echo Example: test-ollama.bat 192.168.1.110 llama2
    exit /b 1
)

if "%~2"=="" (
    echo Model parameter is required
    echo Usage: test-ollama.bat [host] [model]
    echo Example: test-ollama.bat 192.168.1.110 llama2
    exit /b 1
)

set HOST=%~1
set MODEL=%~2
set ENDPOINT=http://%HOST%:11434

echo Ensuring dependencies are installed...
call npm install

echo Testing Ollama provider with endpoint %ENDPOINT% and model %MODEL%...
call npx tsx src/tests/test-ollama.ts %ENDPOINT% %MODEL%

echo Cleaning up...
rmdir /s /q temp 