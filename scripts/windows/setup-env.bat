@echo off
echo Setting up development environment for Lirum Chrome Extension...

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Node.js is not installed. Please install Node.js from https://nodejs.org/
    exit /b 1
)

:: Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo npm is not installed. Please install Node.js from https://nodejs.org/
    exit /b 1
)

:: Install required npm packages globally
echo Installing required npm packages...
call npm install -g yarn typescript eslint

:: Create package.json if it doesn't exist
if not exist package.json (
    echo Initializing npm project...
    call npm init -y
)

:: Install project dependencies
echo Installing project dependencies...
call npm install --save-dev ^
    @types/chrome ^
    typescript ^
    eslint ^
    @typescript-eslint/parser ^
    @typescript-eslint/eslint-plugin ^
    jest ^
    @types/jest ^
    ts-jest ^
    webpack ^
    webpack-cli ^
    ts-loader ^
    copy-webpack-plugin ^
    react ^
    react-dom ^
    @types/react ^
    @types/react-dom

:: Create tsconfig.json if it doesn't exist
if not exist tsconfig.json (
    echo Creating TypeScript configuration...
    echo {
    echo   "compilerOptions": {
    echo     "target": "es6",
    echo     "module": "commonjs",
    echo     "strict": true,
    echo     "esModuleInterop": true,
    echo     "skipLibCheck": true,
    echo     "forceConsistentCasingInFileNames": true,
    echo     "jsx": "react",
    echo     "outDir": "./dist",
    echo     "rootDir": "./src",
    echo     "types": ["chrome", "jest"]
    echo   },
    echo   "include": ["src/**/*"],
    echo   "exclude": ["node_modules"]
    echo } > tsconfig.json
)

echo Setup completed successfully! 