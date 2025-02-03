#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

# Configuration
$sourceDir = Join-Path $PSScriptRoot ".." ".."
$distDir = Join-Path $sourceDir "dist"
$zipFile = Join-Path $sourceDir "lirum-chrome.zip"

# Ensure we're in the right directory
Set-Location $sourceDir

# Clean up previous builds
if (Test-Path $distDir) {
    Remove-Item -Recurse -Force $distDir
}

# Run build process
Write-Host "Building extension..."
npm run build

# Create ZIP file directly from dist directory
Write-Host "Creating ZIP file..."
Compress-Archive -Path "$distDir\*" -DestinationPath $zipFile -Force

Write-Host "Package created successfully at: $zipFile"
Write-Host "You can now upload this file to the Chrome Web Store."
