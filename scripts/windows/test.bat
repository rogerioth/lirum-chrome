@echo off
echo Running Lirum Chrome Extension tests...

:: Check if node_modules exists
if not exist node_modules (
    echo Installing dependencies first...
    call npm install
)

:: Run ESLint
echo Running ESLint...
call npm run lint

:: Run TypeScript compiler check
echo Running TypeScript compiler check...
call npm run type-check

:: Run Jest tests
echo Running Jest tests...
call npm test

echo Test run completed! 