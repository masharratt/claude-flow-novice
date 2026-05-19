param(
  [Parameter(Mandatory=$true)][int]$Handle,
  [string]$Out = "$env:TEMP\win.png"
)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap {
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int s);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
}
"@
$r = New-Object WinCap+RECT
[WinCap]::DwmGetWindowAttribute([IntPtr]$Handle, 9, [ref]$r, [Runtime.InteropServices.Marshal]::SizeOf($r)) | Out-Null
$w = $r.R - $r.L; $h = $r.B - $r.T
if ($w -le 0) { [WinCap]::GetWindowRect([IntPtr]$Handle, [ref]$r) | Out-Null; $w = $r.R - $r.L; $h = $r.B - $r.T }
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [WinCap]::PrintWindow([IntPtr]$Handle, $hdc, 0x2)
$g.ReleaseHdc($hdc)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
$fi = Get-Item $Out
"ok=$ok ${w}x${h} $Out ($([math]::Round($fi.Length/1KB,1))KB)"
