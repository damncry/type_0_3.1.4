$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$tools = Join-Path $root ".build_tools"
$marker = Join-Path $tools "node_path.txt"
New-Item -ItemType Directory -Force -Path $tools | Out-Null

function Test-NodeHome([string]$nodeHomePath) {
    # Do not name this parameter $home: PowerShell has a read-only automatic $HOME variable.
    if ([string]::IsNullOrWhiteSpace($nodeHomePath)) { return $false }
    $exe = Join-Path $nodeHomePath "node.exe"
    $npm = Join-Path $nodeHomePath "npm.cmd"
    if (!(Test-Path $exe) -or !(Test-Path $npm)) { return $false }
    try {
        $version = (& $exe --version 2>$null | Select-Object -First 1).Trim()
        return ($version -match '^v22\.')
    } catch {
        return $false
    }
}

try {
    if (Test-Path $marker) {
        $existing = (Get-Content -LiteralPath $marker -Raw -ErrorAction SilentlyContinue).Trim()
        if (Test-NodeHome $existing) {
            Write-Host "Reusing portable Node.js at $existing"
            exit 0
        }
    }

    $base = "https://nodejs.org/dist"
    Write-Host "Querying the official Node.js release index..."
    $index = Invoke-RestMethod -Uri "$base/index.json" -TimeoutSec 45
    $release = $index | Where-Object { $_.version -match '^v22\.' -and $_.lts } | Select-Object -First 1
    if (!$release) {
        $release = $index | Where-Object { $_.version -match '^v22\.' } | Select-Object -First 1
    }
    if (!$release) { throw "No Node.js 22 release was found in the official release index." }

    $version = [string]$release.version
    $archiveName = "node-$version-win-x64.zip"
    $archivePath = Join-Path $tools $archiveName
    $temporary = Join-Path $tools ("extract-" + [Guid]::NewGuid().ToString("N"))
    $downloadUri = "$base/$version/$archiveName"

    Write-Host "Downloading official $archiveName ..."
    Invoke-WebRequest -Uri $downloadUri -UseBasicParsing -OutFile $archivePath -TimeoutSec 180

    Write-Host "Verifying SHA-256 checksum..."
    $sums = (Invoke-WebRequest -Uri "$base/$version/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 45).Content
    $line = $sums -split "`n" | Where-Object {
        $_.Trim() -match ("^[0-9a-fA-F]{64}\s+\*?" + [regex]::Escape($archiveName) + "\s*$")
    } | Select-Object -First 1
    if (!$line) { throw "The official SHA-256 entry for $archiveName was not found." }
    $expected = (($line.Trim() -split '\s+')[0]).ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "SHA-256 verification failed for the Node.js archive." }

    if (Test-Path $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $temporary | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $temporary -Force

    $source = Join-Path $temporary "node-$version-win-x64"
    if (!(Test-Path (Join-Path $source "node.exe"))) { throw "Node.js archive has an unexpected directory layout." }
    $target = Join-Path $tools "node-$version"
    if (Test-Path $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    Move-Item -LiteralPath $source -Destination $target
    Set-Content -LiteralPath $marker -Value $target -Encoding Ascii

    Remove-Item -LiteralPath $temporary -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    Write-Host "Portable Node.js prepared at $target"
    exit 0
}
catch {
    [Console]::Error.WriteLine("Node.js setup failed: " + $_.Exception.Message)
    [Console]::Error.WriteLine("You can install Node.js 22 LTS manually from https://nodejs.org/en/download")
    exit 1
}
