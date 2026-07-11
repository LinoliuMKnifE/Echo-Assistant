param(
  [string]$MsiPath,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [string]$PriorMsiPath,
  [switch]$AllowUnsigned,
  [switch]$CleanAccountConfirmed
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cleanupVerifierCredentials = $false
$app = $null
if (-not $CleanAccountConfirmed) {
  throw 'Run this verifier from a disposable clean Windows account, then pass -CleanAccountConfirmed. APPDATA isolation does not isolate Windows Credential Manager.'
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class EchoReleaseCredential {
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredReadW(string target, uint type, int flags, out IntPtr credential);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern bool CredDeleteW(string target, uint type, int flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr buffer);
  public static bool Exists(string target) {
    IntPtr credential;
    if (!CredReadW(target, 1, 0, out credential)) return false;
    CredFree(credential);
    return true;
  }
  public static void DeleteIfExists(string target) { if (Exists(target)) CredDeleteW(target, 1, 0); }
}
'@

if (-not $MsiPath) {
  $MsiPath = Get-ChildItem "$root\apps\desktop\src-tauri\target\release\bundle\msi\Echo_*.msi" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
  if (-not $MsiPath) { throw 'No Echo MSI found. Build and sign the release before running this gate.' }
}

$MsiPath = (Resolve-Path $MsiPath).Path
$signature = Get-AuthenticodeSignature $MsiPath
if ($signature.Status -ne 'Valid' -and -not $AllowUnsigned) {
  throw "Release MSI must have a valid Authenticode signature (found: $($signature.Status))."
}

$uninstallRoots = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
function Get-EchoInstall { Get-ItemProperty $uninstallRoots -ErrorAction SilentlyContinue | Where-Object DisplayName -eq 'Echo' }
function Wait-UiElement($Process, [scriptblock]$Match, [int]$Seconds = 20) {
  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    $Process.Refresh()
    if ($Process.MainWindowHandle) {
      $root = [Windows.Automation.AutomationElement]::FromHandle($Process.MainWindowHandle)
      $found = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition) |
        Where-Object $Match | Select-Object -First 1
      if ($found) { return $found }
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline -and -not $Process.HasExited)
  return $null
}
function Invoke-UiButton($Process, [string]$Name) {
  $button = Wait-UiElement $Process { $_.Current.Name -eq $Name -and $_.Current.ControlType -eq [Windows.Automation.ControlType]::Button }
  if (-not $button) { throw "Onboarding button was not accessible: $Name" }
  $button.GetCurrentPattern([Windows.Automation.InvokePattern]::Pattern).Invoke()
}
if (Get-EchoInstall) { throw 'Echo is already installed; refusing to alter an existing installation.' }

$scratch = Join-Path ([IO.Path]::GetTempPath()) "echo-release-$([guid]::NewGuid())"
$profile = Join-Path $scratch 'profile'
$legacyData = Join-Path $profile 'Roaming\Luma'
$legacyMarker = Join-Path $legacyData 'echo-release-upgrade-marker.txt'
$installLog = Join-Path $scratch 'install.log'
$uninstallLog = Join-Path $scratch 'uninstall.log'
New-Item $profile -ItemType Directory -Force | Out-Null
New-Item $legacyData -ItemType Directory -Force | Out-Null
Set-Content $legacyMarker 'preserve-me' -Encoding ascii

try {
  if ($ExpectedVersion -ne '0.1.0' -and -not $PriorMsiPath) {
    throw 'A prior signed MSI is required to prove upgrade behavior after the initial 0.1.0 release.'
  }
  if ($PriorMsiPath) {
    $PriorMsiPath = (Resolve-Path $PriorMsiPath).Path
    if (-not $AllowUnsigned -and (Get-AuthenticodeSignature $PriorMsiPath).Status -ne 'Valid') { throw 'Prior MSI signature is invalid.' }
    $prior = Start-Process msiexec.exe -Wait -PassThru -ArgumentList '/i', "`"$PriorMsiPath`"", '/qn', '/norestart'
    if ($prior.ExitCode) { throw "Prior MSI install failed ($($prior.ExitCode))." }
  }
  $process = Start-Process msiexec.exe -Wait -PassThru -ArgumentList '/i', "`"$MsiPath`"", '/qn', '/norestart', '/L*v', "`"$installLog`""
  if ($process.ExitCode) { throw "MSI install failed ($($process.ExitCode)); see $installLog" }

  $installed = Get-EchoInstall | Select-Object -First 1
  if (-not $installed) { throw 'MSI completed but Echo has no uninstall registration.' }
  if ($installed.DisplayVersion -ne $ExpectedVersion) { throw "Installed version is $($installed.DisplayVersion), expected $ExpectedVersion." }
  if ((Get-Content $legacyMarker -Raw).Trim() -ne 'preserve-me') { throw 'Legacy user data was not preserved through install/upgrade.' }

  $installDir = $installed.InstallLocation
  if (-not $installDir) { $installDir = Join-Path $env:ProgramFiles 'Echo' }
  $sidecar = Get-ChildItem $installDir -Filter 'luma-sidecar*.exe' -Recurse | Select-Object -First 1
  if (-not $sidecar) { throw 'Packaged sidecar executable was not installed.' }
  $exe = Get-ChildItem $installDir -Filter '*.exe' -Recurse |
    Where-Object FullName -ne $sidecar.FullName | Select-Object -First 1 -ExpandProperty FullName
  if (-not $exe) { throw "Installed desktop executable not found under $installDir." }
  if (-not $AllowUnsigned) {
    foreach ($binary in $exe, $sidecar.FullName) {
      $binarySignature = Get-AuthenticodeSignature $binary
      if ($binarySignature.Status -ne 'Valid') { throw "Installed binary must have a valid Authenticode signature: $binary ($($binarySignature.Status))." }
    }
  }

  $savedAppData, $savedLocalAppData = $env:APPDATA, $env:LOCALAPPDATA
  $savedWebViewArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
  $env:APPDATA = Join-Path $profile 'Roaming'
  $env:LOCALAPPDATA = Join-Path $profile 'Local'
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--force-renderer-accessibility'
  New-Item $env:APPDATA, $env:LOCALAPPDATA -ItemType Directory -Force | Out-Null
  try {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $app = Start-Process $exe -PassThru
    Start-Sleep -Seconds 5
    if ($app.HasExited) { throw "Echo exited during isolated-profile onboarding ($($app.ExitCode))." }

    $welcome = Wait-UiElement $app { $_.Current.Name -like 'Meet an assistant that remembers*' }
    if (-not $welcome) { throw 'Fresh-profile launch did not expose the first-run setup heading to Windows UI Automation.' }
    Invoke-UiButton $app 'Continue'

    $apiHeading = Wait-UiElement $app { $_.Current.Name -eq 'Add your OpenAI API key' }
    $apiInput = Wait-UiElement $app { $_.Current.ControlType -eq [Windows.Automation.ControlType]::Edit -and $_.Current.Name -like '*OpenAI API key*' }
    if (-not $apiHeading -or -not $apiInput) { throw 'First-run setup did not expose the OpenAI API key step and input.' }
    $savedKey = Wait-UiElement $app { $_.Current.Name -like 'Use the OpenAI key already saved*' } 1
    if ($savedKey) { throw 'The confirmed clean account already contains an Echo API credential; refusing to reuse or delete it.' }
    $apiInput.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern).SetValue('sk-echo-release-verifier-not-a-real-key')
    Invoke-UiButton $app 'Continue'

    if (-not (Wait-UiElement $app { $_.Current.Name -like 'Choose how * remembers' })) { throw 'Memory setup step was not reached.' }
    Invoke-UiButton $app 'Continue'
    if (-not (Wait-UiElement $app { $_.Current.Name -eq 'Create a backup recovery key' })) { throw 'Recovery setup step was not reached.' }
    Invoke-UiButton $app 'Continue'
    if (-not (Wait-UiElement $app { $_.Current.Name -eq 'Everything looks good' })) { throw 'Final setup check was not reached.' }

    $cleanupVerifierCredentials = $true
    Invoke-UiButton $app 'Open Echo'
    if (-not (Wait-UiElement $app { $_.Current.Name -eq 'Search everything' -and $_.Current.ControlType -eq [Windows.Automation.ControlType]::Edit })) {
      throw 'Completing onboarding did not open the main Echo workspace.'
    }
    if (-not [EchoReleaseCredential]::Exists('echo-onboarding-v1.app.luma.desktop')) {
      throw 'Native echo-onboarding-v1 completion marker was not stored.'
    }
    Stop-Process -Id $app.Id -Force
    $app.WaitForExit()

    $app = Start-Process $exe -PassThru
    if (-not (Wait-UiElement $app { $_.Current.Name -eq 'Search everything' -and $_.Current.ControlType -eq [Windows.Automation.ControlType]::Edit })) {
      throw 'Restart did not restore the main Echo workspace.'
    }
    if ((Wait-UiElement $app { $_.Current.Name -like 'Meet an assistant that remembers*' -or $_.Current.Name -eq 'Add your OpenAI API key' } 2)) {
      throw 'Onboarding reappeared after its native completion marker was stored.'
    }
    Stop-Process -Id $app.Id -Force
    $app.WaitForExit()
  } finally {
    $env:APPDATA, $env:LOCALAPPDATA = $savedAppData, $savedLocalAppData
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $savedWebViewArguments
  }

  $productCode = Split-Path $installed.PSPath -Leaf
  $process = Start-Process msiexec.exe -Wait -PassThru -ArgumentList '/x', $productCode, '/qn', '/norestart', '/L*v', "`"$uninstallLog`""
  if ($process.ExitCode) { throw "MSI uninstall failed ($($process.ExitCode)); see $uninstallLog" }
  if (Get-EchoInstall) { throw 'Echo uninstall registration remains after uninstall.' }
  if (Test-Path $exe) { throw "Installed executable remains after uninstall: $exe" }
  if ((Get-Content $legacyMarker -Raw).Trim() -ne 'preserve-me') { throw 'Uninstall removed or changed legacy user data required for rollback.' }

  Write-Host "PASS: $MsiPath ($($signature.Status)); install/upgrade, legacy data preservation, signatures, complete onboarding, native marker, restart persistence, uninstall, and rollback data preservation verified."
} finally {
  if ($app -and -not $app.HasExited) {
    Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
    $app.WaitForExit()
  }
  if (Get-EchoInstall) {
    $cleanupCode = Split-Path (Get-EchoInstall | Select-Object -First 1 -ExpandProperty PSPath) -Leaf
    Start-Process msiexec.exe -Wait -ArgumentList '/x', $cleanupCode, '/qn', '/norestart'
  }
  if ($cleanupVerifierCredentials -and $CleanAccountConfirmed) {
    [EchoReleaseCredential]::DeleteIfExists('openai-api-key.app.luma.desktop')
    [EchoReleaseCredential]::DeleteIfExists('echo-onboarding-v1.app.luma.desktop')
  }
  if (Test-Path $scratch) { Remove-Item $scratch -Recurse -Force }
}
