#!/bin/bash

echo "Running Lirum Chrome Extension tests..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies first..."
    npm install
fi

# Run ESLint
echo "Running ESLint..."
npm run lint

# Run TypeScript compiler check
echo "Running TypeScript compiler check..."
npm run type-check

# Run Jest tests
echo "Running Jest tests..."
npm test

echo "Test run completed!" 