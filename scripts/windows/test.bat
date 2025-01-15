@echo off
echo Running Lirum Chrome Extension tests...

:: Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies first...
    call npm install
)

:: Run ESLint
echo Running ESLint...
call npx eslint src --ext .ts,.tsx

:: Run TypeScript compiler check
echo Running TypeScript compiler check...
call npx tsc --noEmit

:: Run Jest tests
echo Running Jest tests...
call npx jest

echo Test run completed! 