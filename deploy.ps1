# Pinnovix one-shot deploy
# Builds the frontend, commits all changes, and pushes to GitHub.
# Pushing to GitHub auto-triggers Vercel (frontend) and Render (backend) deploys.
#
# Usage:
#   .\deploy.ps1                       # uses a default commit message
#   .\deploy.ps1 -Message "my message" # custom commit message
#   .\deploy.ps1 -SkipBuild            # skip the local build (faster; CI/Vercel will build)

param(
    [string]$Message = "Update Pinnovix (automated deploy)",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> Pinnovix deploy starting..." -ForegroundColor Cyan

if (-not $SkipBuild) {
    Write-Host "==> Building frontend (catches errors before pushing)..." -ForegroundColor Cyan
    Push-Location frontend
    if (-not (Test-Path "node_modules")) {
        Write-Host "    installing dependencies..." -ForegroundColor DarkGray
        npm install
    }
    npm run build
    Pop-Location
    Write-Host "==> Build OK." -ForegroundColor Green
}

# Stop early if there is nothing to commit
$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
    Write-Host "==> Nothing to commit. Working tree is clean." -ForegroundColor Yellow
    exit 0
}

Write-Host "==> Committing changes..." -ForegroundColor Cyan
git add backend frontend
git commit -m $Message

Write-Host "==> Pushing to GitHub..." -ForegroundColor Cyan
git push

Write-Host "==> Done. Vercel (frontend) and Render (backend) will redeploy automatically." -ForegroundColor Green
