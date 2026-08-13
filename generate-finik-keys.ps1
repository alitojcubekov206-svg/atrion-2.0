$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Convert-ToPem([byte[]]$bytes, [string]$label) {
  $base64 = [Convert]::ToBase64String($bytes)
  $lines = for ($i = 0; $i -lt $base64.Length; $i += 64) {
    if ($i + 64 -lt $base64.Length) {
      $base64.Substring($i, 64)
    } else {
      $base64.Substring($i)
    }
  }
  return ("-----BEGIN $label-----`r`n" + ($lines -join "`r`n") + "`r`n-----END $label-----`r`n")
}

$rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider 2048
try {
  $privateBytes = $rsa.ExportCspBlob($true)
  $publicBytes = $rsa.ExportCspBlob($false)

  # Prefer modern PEM export when available (PowerShell 7+ / .NET 5+)
  $privatePem = $null
  $publicPem = $null
  try {
    $privatePem = $rsa.ExportPkcs8PrivateKeyPem()
    $publicPem = $rsa.ExportSubjectPublicKeyInfoPem()
  } catch {
    # Fallback for Windows PowerShell 5.1: create SPKI/PKCS8 via RSA parameters XML + OpenSSL-free encoding
    Add-Type -AssemblyName System.Security
    $params = $rsa.ExportParameters($true)

    function Encode-Length([int]$len) {
      if ($len -lt 128) { return [byte[]]@([byte]$len) }
      if ($len -lt 256) { return [byte[]]@(0x81, [byte]$len) }
      return [byte[]]@(0x82, [byte](($len -shr 8) -band 0xFF), [byte]($len -band 0xFF))
    }

    function Encode-Integer([byte[]]$raw) {
      $data = $raw
      # Remove leading zeros, then ensure positive INTEGER
      $start = 0
      while ($start -lt $data.Length - 1 -and $data[$start] -eq 0) { $start++ }
      $data = $data[$start..($data.Length - 1)]
      if (($data[0] -band 0x80) -ne 0) {
        $data = [byte[]]@(0) + $data
      }
      return [byte[]]@(0x02) + (Encode-Length $data.Length) + $data
    }

    function Encode-Sequence([byte[]]$content) {
      return [byte[]]@(0x30) + (Encode-Length $content.Length) + $content
    }

    function Encode-BitString([byte[]]$content) {
      $payload = [byte[]]@(0x00) + $content
      return [byte[]]@(0x03) + (Encode-Length $payload.Length) + $payload
    }

    function Encode-OctetString([byte[]]$content) {
      return [byte[]]@(0x04) + (Encode-Length $content.Length) + $content
    }

    # RSA public key BIT STRING body = SEQUENCE { n, e }
    $publicKeyInner = (Encode-Integer $params.Modulus) + (Encode-Integer $params.Exponent)
    $publicKeySeq = Encode-Sequence $publicKeyInner

    # AlgorithmIdentifier for rsaEncryption
    $oid = [byte[]]@(0x06, 0x09, 0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01)
    $nullParams = [byte[]]@(0x05, 0x00)
    $algId = Encode-Sequence ($oid + $nullParams)
    $spki = Encode-Sequence ($algId + (Encode-BitString $publicKeySeq))
    $publicPem = Convert-ToPem $spki "PUBLIC KEY"

    # PKCS#8 PrivateKeyInfo
    $version = Encode-Integer ([byte[]]@(0x00))
    $privateKeyPkcs1Inner =
      (Encode-Integer ([byte[]]@(0x00))) +
      (Encode-Integer $params.Modulus) +
      (Encode-Integer $params.Exponent) +
      (Encode-Integer $params.D) +
      (Encode-Integer $params.P) +
      (Encode-Integer $params.Q) +
      (Encode-Integer $params.DP) +
      (Encode-Integer $params.DQ) +
      (Encode-Integer $params.InverseQ)
    $privateKeyPkcs1 = Encode-Sequence $privateKeyPkcs1Inner
    $pkcs8 = Encode-Sequence ($version + $algId + (Encode-OctetString $privateKeyPkcs1))
    $privatePem = Convert-ToPem $pkcs8 "PRIVATE KEY"
  }

  if (-not $privatePem -or -not $publicPem) {
    throw "Failed to build PEM content"
  }

  $privatePath = Join-Path $PSScriptRoot "finik_private.pem"
  $publicPath = Join-Path $PSScriptRoot "finik_public.pem"
  $privateAlt = Join-Path $PSScriptRoot "finik_private_new.pem"
  $publicAlt = Join-Path $PSScriptRoot "finik_public_new.pem"

  try {
    [System.IO.File]::WriteAllText($privatePath, $privatePem)
    [System.IO.File]::WriteAllText($publicPath, $publicPem)
  } catch {
    Write-Host "Old pem files are locked. Writing finik_*_new.pem instead."
    [System.IO.File]::WriteAllText($privateAlt, $privatePem)
    [System.IO.File]::WriteAllText($publicAlt, $publicPem)
    $privatePath = $privateAlt
    $publicPath = $publicAlt
  }

  $pubSize = (Get-Item $publicPath).Length
  $privSize = (Get-Item $privatePath).Length
  if ($pubSize -lt 200 -or $privSize -lt 800) {
    throw "Generated files look empty/invalid (public=$pubSize private=$privSize)"
  }

  Write-Host "OK: created $([IO.Path]::GetFileName($privatePath)) ($privSize bytes)"
  Write-Host "OK: created $([IO.Path]::GetFileName($publicPath)) ($pubSize bytes)"
  Write-Host ""
  Write-Host "Upload ONLY the public pem to Finik."
  Write-Host "Never share the private pem."
}
finally {
  $rsa.PersistKeyInCsp = $false
  $rsa.Dispose()
}
