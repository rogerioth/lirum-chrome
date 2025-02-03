#!/bin/bash

set -e

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SOURCE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PACKAGE_JSON="$SOURCE_DIR/package.json"
MANIFEST_JSON="$SOURCE_DIR/src/manifest.json"

update_version() {
    local new_version=$1
    
    # Read current version from package.json
    current_version=$(node -p "require('$PACKAGE_JSON').version")
    
    # If no version specified, increment the build number
    if [ -z "$new_version" ]; then
        # Split version into array
        IFS='.' read -ra version_parts <<< "$current_version"
        # Increment build number
        version_parts[2]=$((version_parts[2] + 1))
        # Join back together
        new_version="${version_parts[0]}.${version_parts[1]}.${version_parts[2]}"
        echo "No version specified. Incrementing build number from $current_version to $new_version"
    fi
    
    # Update package.json
    echo "Updating package.json version to $new_version"
    tmp=$(mktemp)
    jq ".version = \"$new_version\"" "$PACKAGE_JSON" > "$tmp" && mv "$tmp" "$PACKAGE_JSON"
    
    # Update manifest.json
    echo "Updating manifest.json version to $new_version"
    tmp=$(mktemp)
    jq ".version = \"$new_version\"" "$MANIFEST_JSON" > "$tmp" && mv "$tmp" "$MANIFEST_JSON"
    
    echo "Version update complete!"
}

# Get version from command line argument if provided
version=$1
update_version "$version"
