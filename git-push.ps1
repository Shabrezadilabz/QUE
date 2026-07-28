# Push this folder only to QUE (not prosols).
# Usage:
#   .\git-push.ps1
#   .\git-push.ps1 -Message "fix BYOK copy"
#   .\git-push.ps1 -SkipCommit   # push commits already made
param(
  [string]$Message = '',
  [switch]$SkipCommit
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$remote = git remote get-url origin
if ($remote -notmatch 'Shabrezadilabz/QUE') {
  Write-Error "Unexpected origin: $remote (expected Shabrezadilabz/QUE)"
}

git status -sb
git add -A

$staged = git diff --cached --name-only
if (-not $SkipCommit -and $staged) {
  if (-not $Message) {
    $Message = Read-Host 'Commit message (empty = cancel commit)'
    if (-not $Message) {
      Write-Host 'No commit message — aborting (working tree still staged).'
      exit 1
    }
  }
  git commit -m $Message
} elseif (-not $SkipCommit -and -not $staged) {
  Write-Host 'Nothing to commit.'
}

$ahead = git rev-list --count origin/main..HEAD 2>$null
if (-not $ahead) { $ahead = 0 }
if ([int]$ahead -eq 0) {
  Write-Host 'Nothing to push (already up to date with origin/main).'
  exit 0
}

Write-Host "Pushing $ahead commit(s) to $remote ..."
git push origin main
git status -sb
