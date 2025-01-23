#!/bin/bash

echo "Setting up development environment for Lirum Chrome Extension..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "npm is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Install required npm packages globally
echo "Installing required npm packages..."
npm install -g yarn typescript eslint

# Create package.json if it doesn't exist
if [ ! -f package.json ]; then
    echo "Initializing npm project..."
    npm init -y
fi

# Install project dependencies
echo "Installing project dependencies..."
npm install --save-dev \
    @types/chrome \
    typescript \
    eslint \
    @typescript-eslint/parser \
    @typescript-eslint/eslint-plugin \
    jest \
    @types/jest \
    ts-jest \
    webpack \
    webpack-cli \
    ts-loader \
    copy-webpack-plugin \
    react \
    react-dom \
    @types/react \
    @types/react-dom

# Create tsconfig.json if it doesn't exist
if [ ! -f tsconfig.json ]; then
    echo "Creating TypeScript configuration..."
    cat > tsconfig.json << EOL
{
  "compilerOptions": {
    "target": "es6",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react",
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["chrome", "jest"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
EOL
fi

echo "Setup completed successfully!" 