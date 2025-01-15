#!/bin/bash

echo "Running Lirum Chrome Extension tests..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies first..."
    npm install
fi

# Run ESLint
echo "Running ESLint..."
npx eslint src --ext .ts,.tsx

# Run TypeScript compiler check
echo "Running TypeScript compiler check..."
npx tsc --noEmit

# Run Jest tests
echo "Running Jest tests..."
npx jest

echo "Test run completed!" 