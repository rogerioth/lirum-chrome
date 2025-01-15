#!/bin/bash

echo "Building and running Lirum Chrome Extension..."

# Get the script's directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/../.."

# Build the extension
npm run build

# Create a temporary user data directory if it doesn't exist
mkdir -p "$PROJECT_ROOT/temp-chrome-data"

# Check if Chrome exists in common locations
CHROME_PATH=""
if command -v google-chrome &> /dev/null; then
    CHROME_PATH="google-chrome"
elif command -v google-chrome-stable &> /dev/null; then
    CHROME_PATH="google-chrome-stable"
elif command -v chromium &> /dev/null; then
    CHROME_PATH="chromium"
elif command -v chromium-browser &> /dev/null; then
    CHROME_PATH="chromium-browser"
fi

if [ -z "$CHROME_PATH" ]; then
    echo "Chrome/Chromium not found in common locations. Please install Chrome or update the script with the correct path."
    exit 1
fi

# Launch Chrome with the extension
echo "Launching Chrome with the extension..."
"$CHROME_PATH" \
    --load-extension="$PROJECT_ROOT/dist" \
    --user-data-dir="$PROJECT_ROOT/temp-chrome-data" \
    --no-first-run \
    --no-default-browser-check 