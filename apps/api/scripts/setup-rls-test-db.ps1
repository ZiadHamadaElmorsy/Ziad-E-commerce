# Ziad E-commerce — RLS test database setup (Windows / PowerShell)
# ---------------------------------------------------------------------------
# Creates the dedicated `ziad_rls_test` database and applies all migrations.
# Prerequisite: a local PostgreSQL on localhost:5432 with a superuser.
#
# Usage:
#   ./scripts/setup-rls-test-db.ps1 [-DbUser postgres] [-DbPassword postgres]
# ---------------------------------------------------------------------------
param(
  [string]$DbUser = "postgres",
  [string]$DbPassword = "postgres",
  [string]$DbName = "ziad_rls_test",
  [string]$DbHost = "localhost"
)

$ErrorActionPreference = "Stop"
$env:PGPASSWORD = $DbPassword
$root = Split-Path -Parent $PSScriptRoot   # repo root

Write-Host "[1/3] Creating database '$DbName' (if missing)..." -ForegroundColor Cyan
$exists = & psql -U $DbUser -h $DbHost -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
if ($LASTEXITCODE -ne 0) { throw "psql failed. Is PostgreSQL installed and on PATH?" }
if ($exists -ne "1") {
  & createdb -U $DbUser -h $DbHost $DbName
  if ($LASTEXITCODE -ne 0) { throw "createdb failed." }
  Write-Host "  Database created."
} else {
  Write-Host "  Database already exists (migrations will be re-applied / no-op)."
}

Write-Host "[2/3] Applying migrations..." -ForegroundColor Cyan
$env:DATABASE_URL = "postgresql://$DbUser`:$DbPassword@$DbHost`:$($env:PGPORT ?? '5432')/$DbName"
& npx prisma migrate deploy --schema "$root/apps/api/prisma/schema.prisma"
if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed." }
Write-Host "  Migrations applied."

Write-Host "[3/3] Verifying RLS plumbing..." -ForegroundColor Cyan
& psql -U $DbUser -h $DbHost -d $DbName -c "SELECT rolname FROM pg_roles WHERE rolname IN ('authenticated','anon','ziad_runtime') ORDER BY rolname;"
if ($LASTEXITCODE -ne 0) { throw "verification query failed." }

Write-Host ""
Write-Host "Setup complete. Run the RLS/database suites with:" -ForegroundColor Green
Write-Host "  `$env:POSTGRES_RLS_TEST_DATABASE_URL='postgresql://$DbUser`:$DbPassword@$DbHost:5432/$DbName'"
Write-Host "  `$env:RLS_ENFORCEMENT_ROLE='ziad_runtime'"
Write-Host "  npm run test:e2e -w @ziad/api"
