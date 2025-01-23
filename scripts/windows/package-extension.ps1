#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

# Configuration
$sourceDir = Join-Path $PSScriptRoot ".." ".."
$distDir = Join-Path $sourceDir "dist"
$buildDir = Join-Path $distDir "build"
$zipFile = Join-Path $distDir "lirum-chrome.zip"

# Ensure we're in the right directory
Set-Location $sourceDir

# Clean up previous builds
if (Test-Path $distDir) {
    Remove-Item -Recurse -Force $distDir
}

# Create necessary directories
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

# Run build process
Write-Host "Building extension..."
npm run build

# Copy necessary files to build directory
Write-Host "Copying files..."
$filesToCopy = @(
    "src/assets",
    "src/background",
    "src/content",
    "src/options",
    "src/popup",
    "src/styles",
    "src/manifest.json"
)

foreach ($file in $filesToCopy) {
    $source = Join-Path $sourceDir $file
    $dest = Join-Path $buildDir $(Split-Path -Leaf $file)
    if (Test-Path $source) {
        if (Test-Path $source -PathType Container) {
            Copy-Item -Path $source -Destination $dest -Recurse -Force
        } else {
            Copy-Item -Path $source -Destination $dest -Force
        }
    } else {
        Write-Warning "Source path not found: $source"
    }
}

# Create ZIP file
Write-Host "Creating ZIP file..."
Compress-Archive -Path "$buildDir\*" -DestinationPath $zipFile -Force

Write-Host "Package created successfully at: $zipFile"
Write-Host "You can now upload this file to the Chrome Web Store."
