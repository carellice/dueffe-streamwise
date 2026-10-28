# Versione Windows di build-apk.command: compila l'APK firmato, lo pubblica su GitHub
# e rimuove le release StreamWise precedenti.
#   .\build-apk.ps1            incrementa la patch (1.0.0 -> 1.0.1)
#   .\build-apk.ps1 1.2.0      usa la versione indicata
param([string]$Version)

$ErrorActionPreference = 'Stop'
$ProjectDir = $PSScriptRoot
Set-Location $ProjectDir
$Host.UI.RawUI.WindowTitle = 'StreamWise APK build'

function Fail([string]$Message) {
  Write-Host $Message -ForegroundColor Red
  exit 1
}
function Invoke-Native([string]$Exe, [string[]]$Arguments) {
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($Exe)) è terminato con codice $LASTEXITCODE" }
}
# Esegue un comando solo per il suo esito; in Windows PowerShell lo stderr rediretto non deve interrompere lo script.
function Test-Native([string]$Exe, [string[]]$Arguments) {
  $ErrorActionPreference = 'Continue'
  & $Exe @Arguments *> $null
  return $LASTEXITCODE -eq 0
}
function Find-First([string[]]$Paths) {
  foreach ($p in $Paths) { if ($p -and (Test-Path $p)) { return (Resolve-Path $p).Path } }
  return $null
}

# Java: JAVA_HOME, poi la JBR di Android Studio, poi un JDK 17 Temurin.
if (-not ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe"))) {
  $temurin = Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
  $env:JAVA_HOME = Find-First @("$env:ProgramFiles\Android\Android Studio\jbr", $(if ($temurin) { $temurin.FullName }))
  if (-not $env:JAVA_HOME) { Fail "Java non è installato. Installa Android Studio oppure: winget install EclipseAdoptium.Temurin.17.JDK" }
}

$sdk = Find-First @($env:ANDROID_HOME, "$env:LOCALAPPDATA\Android\Sdk")
if ($sdk) { $env:ANDROID_HOME = $sdk; $env:ANDROID_SDK_ROOT = $sdk }

$GitHubReleaseRepo = if ($env:GITHUB_RELEASE_REPO) { $env:GITHUB_RELEASE_REPO } else { 'carellice/android-app-releases' }
$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = Find-First @("$env:ProgramFiles\GitHub CLI\gh.exe") }
if (-not $gh) { Fail "GitHub CLI non è installato. Installa 'gh' per pubblicare automaticamente l'APK (winget install GitHub.cli)." }
if (-not (Test-Native $gh @('auth', 'status', '-h', 'github.com'))) { Fail "L'autenticazione GitHub non è valida. Esegui: gh auth login -h github.com" }
if (-not (Test-Native $gh @('repo', 'view', $GitHubReleaseRepo))) { Fail "Non riesco ad accedere alla repository $GitHubReleaseRepo." }

$python = (Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1).FullName
if (-not $python) { $python = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $python) { Fail "Python 3 non è installato (winget install Python.Python.3.12)." }

# Chiave TMDB: variabile d'ambiente oppure local.properties; salvata solo su questo PC.
$utf8 = New-Object System.Text.UTF8Encoding($false)
if (-not $env:TMDB_API_KEY -and (Test-Path local.properties)) {
  $line = Get-Content local.properties | Where-Object { $_ -like 'tmdb.api.key=*' } | Select-Object -Last 1
  if ($line) { $env:TMDB_API_KEY = $line.Substring('tmdb.api.key='.Length) }
}
if (-not $env:TMDB_API_KEY) {
  $secure = Read-Host 'Inserisci la tua API Key TMDB (verrà salvata solo su questo PC)' -AsSecureString
  $env:TMDB_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if (-not $env:TMDB_API_KEY) { Fail "La chiave TMDB è necessaria. Inseriscila in local.properties e riprova." }
}
# Aggiorna solo la chiave TMDB: le altre impostazioni locali restano.
$otherLines = if (Test-Path local.properties) { @(Get-Content local.properties | Where-Object { $_ -notlike 'tmdb.api.key=*' -and $_ -ne '' }) } else { @() }
[IO.File]::WriteAllText("$ProjectDir\local.properties", ((@("tmdb.api.key=$($env:TMDB_API_KEY)") + $otherLines) -join "`n") + "`n", $utf8)

$props = Get-Content version.properties
$CurrentCode = [int](($props | Where-Object { $_ -like 'VERSION_CODE=*' }) -replace '^VERSION_CODE=', '')
$CurrentName = ($props | Where-Object { $_ -like 'VERSION_NAME=*' }) -replace '^VERSION_NAME=', ''
$NextCode = $CurrentCode + 1
if ($Version) {
  if ($Version -notmatch '^\d+\.\d+\.\d+$') { Fail "Versione non valida. Usa il formato 1.2.3" }
  $NextName = $Version
} else {
  $parts = $CurrentName.Split('.')
  $NextName = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)"
}

$VersionBackup = [IO.File]::ReadAllText("$ProjectDir\version.properties")
[IO.File]::WriteAllText("$ProjectDir\version.properties", "VERSION_CODE=$NextCode`nVERSION_NAME=$NextName`n", $utf8)

try {
  if (-not (Test-Path .streamwise-signing.properties)) {
    New-Item -ItemType Directory -Force signing | Out-Null
    $bytes = New-Object byte[] 18
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $SigningPassword = -join ($bytes | ForEach-Object { $_.ToString('x2') })
    Invoke-Native "$env:JAVA_HOME\bin\keytool.exe" @('-genkeypair', '-v',
      '-keystore', 'signing/streamwise-release.jks',
      '-storepass', $SigningPassword, '-keypass', $SigningPassword,
      '-alias', 'streamwise', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
      '-dname', 'CN=StreamWise, OU=Mobile, O=Dueffe, L=Rome, C=IT')
    [IO.File]::WriteAllText("$ProjectDir\.streamwise-signing.properties", "storeFile=signing/streamwise-release.jks`nstorePassword=$SigningPassword`nkeyAlias=streamwise`nkeyPassword=$SigningPassword`n", $utf8)
    Write-Host "Creata la firma permanente in signing. Conservala: serve per tutti gli aggiornamenti futuri."
  }

  Write-Host "Creo StreamWise $NextName ($NextCode)…"
  Invoke-Native "$ProjectDir\gradlew.bat" @('--no-daemon', 'clean', 'assembleRelease', "-PupdateRepository=$GitHubReleaseRepo")

  New-Item -ItemType Directory -Force dist | Out-Null
  $ApkPath = "$ProjectDir\dist\StreamWise-$NextName.apk"
  Copy-Item app\build\outputs\apk\release\app-release.apk $ApkPath -Force

  $ReleaseTag = "streamwise-v$NextName"
  $ReleaseTitle = "StreamWise $NextName"
  $ReleaseNotes = "APK Android firmato di StreamWise. Versione $NextName, codice aggiornamento $NextCode."

  Invoke-Native $python @('-I', "$ProjectDir\write-update-metadata.py", $ApkPath, "$NextCode", $NextName, 'it.dueffe.streamwise')
  Write-Host "Pubblico l'APK su GitHub…"
  if (Test-Native $gh @('release', 'view', $ReleaseTag, '--repo', $GitHubReleaseRepo)) {
    Invoke-Native $gh @('release', 'upload', $ReleaseTag, $ApkPath, "$ProjectDir\dist\latest.json", '--repo', $GitHubReleaseRepo, '--clobber')
  } else {
    Invoke-Native $gh @('release', 'create', $ReleaseTag, $ApkPath, "$ProjectDir\dist\latest.json",
      '--repo', $GitHubReleaseRepo, '--title', $ReleaseTitle, '--notes', $ReleaseNotes)
  }
} catch {
  [IO.File]::WriteAllText("$ProjectDir\version.properties", $VersionBackup, $utf8)
  Fail "Build o pubblicazione non riuscita: $($_.Exception.Message)"
}

$ErrorActionPreference = 'Continue'
if ($env:STREAMWISE_DELETE_OLD_RELEASES -ne '0') {
  Write-Host "Rimuovo le release StreamWise precedenti…"
  # Solo i tag streamwise-v*: le release delle altre app nella stessa repository non vanno toccate.
  $tags = & $gh release list --repo $GitHubReleaseRepo --limit 1000 --json tagName --jq '.[].tagName'
  foreach ($oldTag in @($tags)) {
    if (-not $oldTag -or -not $oldTag.StartsWith('streamwise-v') -or $oldTag -eq $ReleaseTag) { continue }
    & $gh release delete $oldTag --repo $GitHubReleaseRepo --yes --cleanup-tag
    if ($LASTEXITCODE -ne 0) { Write-Host "Non sono riuscito a rimuovere la release $oldTag." -ForegroundColor Yellow }
  }
} else {
  Write-Host "Conservo le release StreamWise precedenti (STREAMWISE_DELETE_OLD_RELEASES=0)."
}

Write-Host ''
Write-Host "APK pronto: $ApkPath"
Write-Host "Versione: $NextName · codice aggiornamento: $NextCode"
Write-Host "Release: https://github.com/$GitHubReleaseRepo/releases/tag/$ReleaseTag"
if ($sdk) { Write-Host "Per installarlo via USB: `"$sdk\platform-tools\adb.exe`" install -r `"$ApkPath`"" }
exit 0
