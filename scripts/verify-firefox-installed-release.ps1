param(
  [Parameter(Mandatory)][string]$MsiPath,
  [Parameter(Mandatory)][string]$XpiPath,
  [string]$Firefox = 'firefox',
  [string]$Geckodriver = 'geckodriver',
  [switch]$CleanAccountConfirmed
)

$ErrorActionPreference = 'Stop'
if (-not $CleanAccountConfirmed) { throw 'This verifier requires a disposable clean Windows account.' }
$MsiPath = (Resolve-Path $MsiPath).Path
$XpiPath = (Resolve-Path $XpiPath).Path
if ((Get-AuthenticodeSignature $MsiPath).Status -ne 'Valid') { throw 'MSI is not Authenticode signed.' }

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class EchoFirefoxCredential {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct CREDENTIAL { public uint Flags, Type; public string TargetName, Comment; public long LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist, AttributeCount; public IntPtr Attributes; public string TargetAlias, UserName; }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredWriteW(ref CREDENTIAL credential, uint flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CredDeleteW(string target, uint type, int flags);
  public static void Write(string target, string value) {
    byte[] bytes = Encoding.Unicode.GetBytes(value); IntPtr blob = Marshal.AllocCoTaskMem(bytes.Length);
    try { Marshal.Copy(bytes, 0, blob, bytes.Length); var c = new CREDENTIAL { Type=1, TargetName=target, CredentialBlobSize=(uint)bytes.Length, CredentialBlob=blob, Persist=2, UserName="firefox-pairing-token" }; if (!CredWriteW(ref c, 0)) Marshal.ThrowExceptionForHR(Marshal.GetHRForLastWin32Error()); }
    finally { Marshal.FreeCoTaskMem(blob); }
  }
  public static void Delete(string target) { CredDeleteW(target, 1, 0); }
}
'@

$uninstallRoots = @('HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*')
function Get-EchoInstall { Get-ItemProperty $uninstallRoots -ErrorAction SilentlyContinue | Where-Object DisplayName -eq 'Echo' }
if (Get-EchoInstall) { throw 'Echo is already installed; refusing to alter it.' }
$token = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
$app = $null
try {
  $install = Start-Process msiexec.exe -Wait -PassThru -ArgumentList '/i', "`"$MsiPath`"", '/qn', '/norestart'
  if ($install.ExitCode) { throw "MSI install failed ($($install.ExitCode))." }
  $registered = Get-EchoInstall | Select-Object -First 1
  if (-not $registered) { throw 'Echo has no uninstall registration after installation.' }
  $installDir = if ($registered.InstallLocation) { $registered.InstallLocation } else { Join-Path $env:ProgramFiles 'Echo' }
  $sidecar = Get-ChildItem $installDir -Filter 'luma-sidecar*.exe' -Recurse | Select-Object -First 1
  if (-not $sidecar) { throw 'Installed sidecar executable is missing.' }
  $exe = Get-ChildItem $installDir -Filter '*.exe' -Recurse | Where-Object FullName -ne $sidecar.FullName | Select-Object -First 1 -ExpandProperty FullName
  if (-not $exe) { throw 'Installed desktop executable is missing.' }
  foreach ($binary in $exe, $sidecar.FullName) { if ((Get-AuthenticodeSignature $binary).Status -ne 'Valid') { throw "Installed binary is not signed: $binary" } }
  [EchoFirefoxCredential]::Write('firefox-pairing-token.app.luma.desktop', $token)
  $app = Start-Process $exe -PassThru
  node "$PSScriptRoot\verify-firefox-release.mjs" --xpi $XpiPath --pairing-token $token --firefox $Firefox --geckodriver $Geckodriver
  if ($LASTEXITCODE) { throw "Firefox interoperability verifier failed ($LASTEXITCODE)." }
} finally {
  if ($app -and -not $app.HasExited) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue; $app.WaitForExit() }
  [EchoFirefoxCredential]::Delete('firefox-pairing-token.app.luma.desktop')
  $registered = Get-EchoInstall | Select-Object -First 1
  if ($registered) {
    $productCode = Split-Path $registered.PSPath -Leaf
    $uninstall = Start-Process msiexec.exe -Wait -PassThru -ArgumentList '/x', $productCode, '/qn', '/norestart'
    if ($uninstall.ExitCode -or (Get-EchoInstall)) { throw 'Echo cleanup uninstall failed.' }
  }
}
