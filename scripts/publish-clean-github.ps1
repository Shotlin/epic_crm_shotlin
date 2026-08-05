[CmdletBinding()]
param(
  [switch]$Force,
  [string]$Repository = 'https://github.com/Shotlin/epic_crm_shotlin.git'
)

$ErrorActionPreference = 'Stop'

if (-not $Force) {
  throw 'Safety stop: this command replaces the remote master branch. Re-run with -Force only after rotating the exposed credential.'
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$expectedRepository = 'https://github.com/Shotlin/epic_crm_shotlin.git'
if ($Repository.TrimEnd('/') -ne $expectedRepository.TrimEnd('/')) {
  throw "Safety stop: expected $expectedRepository, received $Repository."
}

$ghPath = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $ghPath) {
  $candidate = Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'
  if (Test-Path -LiteralPath $candidate) { $ghPath = $candidate }
}
if (-not $ghPath) { throw 'GitHub CLI was not found. Install it with: winget install --id GitHub.cli' }

& $ghPath auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI authentication failed. Run: gh auth login -h github.com -p https -w' }

& $ghPath repo view 'Shotlin/epic_crm_shotlin' --json nameWithOwner --jq '.nameWithOwner'
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify access to Shotlin/epic_crm_shotlin.' }

# Fail closed if a likely live credential slipped into product source. Never print values.
$secretPatterns = @{
  'GitHub token' = 'gh[pousr]_[A-Za-z0-9_]{20,}'
  'OpenAI key' = 'sk-(?:proj-)?[A-Za-z0-9_-]{20,}'
  'Google API key' = 'AIza[0-9A-Za-z_-]{20,}'
  'AWS access key' = 'A(?:KIA|SIA)[A-Z0-9]{16}'
  'Slack token' = 'xox[baprs]-[A-Za-z0-9-]{10,}'
  'Stripe live key' = 'sk_live_[A-Za-z0-9]+'
  'Private key' = '-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----'
}
$textExtensions = @('.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.ps1', '.txt')
$rgPath = (Get-Command rg -ErrorAction SilentlyContinue).Source
if (-not $rgPath) { throw 'ripgrep (rg) is required for the publish safety scan.' }

Push-Location $projectRoot
try {
  # Enumerate only publishable source paths. This avoids traversing generated
  # directories and local agent state, which may contain stale credentials.
  $textFiles = @(& $rgPath --files --hidden `
    -g '!node_modules/**' `
    -g '!out/**' `
    -g '!out-*/**' `
    -g '!output/**' `
    -g '!tmp/**' `
    -g '!.vite/**' `
    -g '!.git/**' `
    -g '!.agents/**' `
    -g '!.claude/**' `
    -g '!.codex/**' |
    Where-Object { [System.IO.Path]::GetExtension($_) -in $textExtensions } |
    ForEach-Object { Join-Path $projectRoot $_ })
} finally {
  Pop-Location
}
$findings = foreach ($entry in $secretPatterns.GetEnumerator()) {
  $matches = $textFiles | Select-String -Pattern $entry.Value -ErrorAction SilentlyContinue
  foreach ($match in $matches) {
    [pscustomobject]@{ Pattern = $entry.Key; Path = $match.Path }
  }
}
if ($findings) {
  $summary = $findings | Select-Object Pattern, Path -Unique | Format-Table -AutoSize | Out-String
  throw "Safety stop: likely credentials found in publishable source. Remove/rotate them before publishing.\n$summary"
}

$gitDirectory = Join-Path $projectRoot '.git'
if (-not (Test-Path -LiteralPath $gitDirectory)) {
  & git -C $projectRoot init -b master
  if ($LASTEXITCODE -ne 0) { throw 'Could not initialise the local clean Git repository.' }
} else {
  $commitCount = 0
  $hasExistingHistory = $false
  try {
    $commitCount = (& git -C $projectRoot rev-list --count HEAD 2>$null)
    $hasExistingHistory = $LASTEXITCODE -eq 0
  } catch {
    $hasExistingHistory = $false
  }
  if ($hasExistingHistory -and [int]$commitCount -gt 1) {
    throw 'Safety stop: local Git history already has multiple commits. Do not mix it into the clean remote replacement.'
  }
}

& git -C $projectRoot add --all
if ($LASTEXITCODE -ne 0) { throw 'Git staging failed.' }

$stagedFiles = @(& git -C $projectRoot diff --cached --name-only)

$identityName = & git -C $projectRoot config user.name
$identityEmail = & git -C $projectRoot config user.email
if (-not $identityName -or -not $identityEmail) {
  throw 'Git author identity is missing. Run: git config --global user.name "Your Name"; git config --global user.email "you@example.com"'
}

$hadHead = $false
try {
  & git -C $projectRoot rev-parse --verify HEAD *> $null
  $hadHead = $LASTEXITCODE -eq 0
} catch {
  $hadHead = $false
}
if ($hadHead -and $stagedFiles.Count -gt 0) {
  & git -C $projectRoot commit --amend --no-edit
} elseif (-not $hadHead) {
  if ($stagedFiles.Count -eq 0) { throw 'No publishable files were staged and no local commit exists to publish.' }
  & git -C $projectRoot commit -m 'Publish clean Epic BOS Electron source'
}
if ($hadHead -and $stagedFiles.Count -eq 0) {
  Write-Host 'No source changes to commit; publishing the existing verified commit.'
} elseif ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }

$origin = $null
$hasExpectedRemote = $false
try {
  $origin = (& git -C $projectRoot remote get-url origin 2>$null)
  $hasExpectedRemote = $LASTEXITCODE -eq 0
} catch {
  $hasExpectedRemote = $false
}
if (-not $hasExpectedRemote) {
  & git -C $projectRoot remote add origin $expectedRepository
  if ($LASTEXITCODE -ne 0) { throw 'Could not configure the expected GitHub remote.' }
} elseif ($origin.TrimEnd('/') -ne $expectedRepository.TrimEnd('/')) {
  throw "Safety stop: existing origin is $origin, not $expectedRepository."
}

& git -C $projectRoot push --force origin HEAD:master
if ($LASTEXITCODE -ne 0) { throw 'GitHub push failed. The remote was not confirmed as replaced.' }

$revision = (& git -C $projectRoot rev-parse HEAD).Trim()
$publishedFileCount = @(& git -C $projectRoot ls-tree -r --name-only HEAD).Count
Write-Host "Published $publishedFileCount source files to Shotlin/epic_crm_shotlin master. Commit: $revision"
Write-Warning 'The prior public commit may remain in GitHub object storage temporarily. Rotate the exposed credential and request GitHub sensitive-data cache removal.'
