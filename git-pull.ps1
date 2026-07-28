# Pull latest from QUE only (this folder's git, not prosols).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$remote = git remote get-url origin
if ($remote -notmatch 'Shabrezadilabz/QUE') {
  Write-Error "Unexpected origin: $remote (expected Shabrezadilabz/QUE)"
}

Write-Host "Pulling from $remote ..."
git fetch origin
git pull --ff-only origin main
git status -sb
