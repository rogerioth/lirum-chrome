#!/bin/bash

set -e

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SOURCE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$SOURCE_DIR/dist"
BUILD_DIR="$DIST_DIR/build"
ZIP_FILE="$DIST_DIR/lirum-chrome.zip"

# Ensure we're in the right directory
cd "$SOURCE_DIR"

# Clean up previous builds
rm -rf "$DIST_DIR"

# Create necessary directories
mkdir -p "$BUILD_DIR"
mkdir -p "$DIST_DIR"

# Run build process
echo "Building extension..."
npm run build

# Copy necessary files to build directory
echo "Copying files..."
FILES_TO_COPY=(
    "src/assets"
    "src/background"
    "src/content"
    "src/options"
    "src/popup"
    "src/styles"
    "src/manifest.json"
)

for file in "${FILES_TO_COPY[@]}"; do
    if [ -e "$SOURCE_DIR/$file" ]; then
        cp -R "$SOURCE_DIR/$file" "$BUILD_DIR/$(basename "$file")"
    else
        echo "Warning: Source path not found: $SOURCE_DIR/$file"
    fi
done

# Create ZIP file
echo "Creating ZIP file..."
cd "$BUILD_DIR"
zip -r "$ZIP_FILE" ./*

echo "Package created successfully at: $ZIP_FILE"
echo "You can now upload this file to the Chrome Web Store."
