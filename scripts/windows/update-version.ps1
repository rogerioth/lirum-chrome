#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"

# Configuration
$sourceDir = Join-Path $PSScriptRoot ".." ".."
$packageJsonPath = Join-Path $sourceDir "package.json"
$manifestJsonPath = Join-Path $sourceDir "src" "manifest.json"

function Update-Version {
    param (
        [string]$NewVersion
    )

    # Read the current version from package.json
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $currentVersion = $packageJson.version

    # If no version specified, increment the build number
    if (-not $NewVersion) {
        $versionParts = $currentVersion.Split('.')
        $versionParts[2] = [int]$versionParts[2] + 1
        $NewVersion = $versionParts -join '.'
        Write-Host "No version specified. Incrementing build number from $currentVersion to $NewVersion"
    }

    # Update package.json
    Write-Host "Updating package.json version to $NewVersion"
    $packageJson.version = $NewVersion
    $packageJson | ConvertTo-Json -Depth 100 | Set-Content $packageJsonPath

    # Update manifest.json
    Write-Host "Updating manifest.json version to $NewVersion"
    $manifestJson = Get-Content $manifestJsonPath -Raw | ConvertFrom-Json
    $manifestJson.version = $NewVersion
    $manifestJson | ConvertTo-Json -Depth 100 | Set-Content $manifestJsonPath

    Write-Host "Version update complete!"
}

# Get version from command line argument if provided
$version = $args[0]
Update-Version -NewVersion $version
