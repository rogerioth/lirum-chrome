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
if [ -d "/Applications/Google Chrome.app" ]; then
    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [ -d "$HOME/Applications/Google Chrome.app" ]; then
    CHROME_PATH="$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi

if [ -z "$CHROME_PATH" ]; then
    echo "Chrome not found in common locations. Please install Chrome or update the script with the correct path."
    exit 1
fi

# Launch Chrome with the extension
echo "Launching Chrome with the extension..."
"$CHROME_PATH" \
    --load-extension="$PROJECT_ROOT/dist" \
    --user-data-dir="$PROJECT_ROOT/temp-chrome-data" \
    --no-first-run \
    --no-default-browser-check 