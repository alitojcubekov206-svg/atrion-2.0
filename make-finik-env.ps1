$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

# Always regenerate because any previously shared private key is unsafe.
& "$PSScriptRoot\generate-finik-keys.ps1"

$privateFile = if (Test-Path "finik_private_new.pem") { "finik_private_new.pem" } else { "finik_private.pem" }
$publicFile = if (Test-Path "finik_public_new.pem") { "finik_public_new.pem" } else { "finik_public.pem" }

$private = Get-Content -Path $privateFile -Raw
$oneLine = ($private -replace "`r`n", "\n" -replace "`n", "\n").Trim()

Set-Clipboard -Value $oneLine
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot "finik_private_vercel.txt"), $oneLine)

Write-Host ""
Write-Host "Ready for Vercel."
Write-Host "1) Key name: FINIK_PRIVATE_PEM"
Write-Host "2) Value is already copied to clipboard as ONE LINE with \n"
Write-Host "3) Also saved to finik_private_vercel.txt"
Write-Host "4) Upload NEW public file to Finik: $publicFile"
Write-Host "5) NEVER send private key in chat"
Write-Host ""
