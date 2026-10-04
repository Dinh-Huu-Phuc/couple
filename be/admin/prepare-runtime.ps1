# Capture CLI credentials directly into an ignored backend file; never print them.
$ErrorActionPreference = 'Stop'
$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
function Find-ServiceKey($document) {
  if ($null -eq $document) { return }
  if ($document -is [System.Array]) {
    foreach ($entry in $document) { Find-ServiceKey $entry }
  } elseif ($document -is [pscustomobject]) {
    if ($document.name -eq 'service_role' -and $document.api_key) { return $document.api_key }
    foreach ($property in $document.PSObject.Properties) {
      if ($property.Value -is [System.Array] -or $property.Value -is [pscustomobject]) { Find-ServiceKey $property.Value }
    }
  }
}
Push-Location $backendRoot
try {
  $raw = (& corepack pnpm exec supabase projects api-keys --project-ref ldxekwjpzxsnhhcvvlfi --reveal --output json 2>$null | Out-String)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to retrieve backend runtime key. Check Supabase CLI login.' }
  try { $document = ConvertFrom-Json $raw } catch { throw 'Unexpected CLI response; no credentials were printed.' }
  $serviceKey = @(Find-ServiceKey $document) | Select-Object -First 1
  if (-not $serviceKey) { throw 'Backend service key was not found; no credentials were printed.' }
  [System.IO.File]::WriteAllText((Join-Path $backendRoot '.env.admin-runtime'), "ADMIN_BACKEND_SERVICE_ROLE_KEY=$serviceKey`n", (New-Object System.Text.UTF8Encoding($false)))
  Write-Output 'Backend admin runtime configured (key hidden).'
} finally { Pop-Location }
