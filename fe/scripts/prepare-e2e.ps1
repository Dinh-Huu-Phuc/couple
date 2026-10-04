$ErrorActionPreference = 'Stop'
$backendRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\be'))
Push-Location -LiteralPath $backendRoot
try {
  $raw = (corepack pnpm exec supabase status --output json) | Out-String
  if ($LASTEXITCODE -ne 0) { throw 'Supabase local must be running first.' }
  $state = $raw | ConvertFrom-Json
} finally { Pop-Location }
if (-not $state.API_URL -or -not $state.ANON_KEY -or -not $state.SERVICE_ROLE_KEY) { throw 'Supabase local status is incomplete.' }
$hostName = ([uri]$state.API_URL).Host
if ($hostName -notin @('localhost', '127.0.0.1')) { throw 'Refusing to configure tests for a remote project.' }
$lines = @(
  ('E2E_SUPABASE_URL=' + $state.API_URL)
  ('E2E_SUPABASE_ANON_KEY=' + $state.ANON_KEY)
  ('E2E_SUPABASE_SERVICE_ROLE_KEY=' + $state.SERVICE_ROLE_KEY)
)
$dest = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.env.e2e'))
[IO.File]::WriteAllLines($dest, $lines, [Text.UTF8Encoding]::new($false))
Write-Output 'Prepared ignored .env.e2e for local tests; credentials not printed.'
