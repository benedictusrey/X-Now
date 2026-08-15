param(
  [string]$OutDir = "icons/menu"
)

# Renders the tray-menu glyphs used by the native tray menu in
# src-tauri/src/tray.rs (menu_icon()). The icons are 16x16 white renders of
# Segoe MDL2 Assets codepoints, matching the classic v2.0.0 tray-menu look.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/render-menu-icons.ps1

Add-Type -AssemblyName System.Drawing

# file name -> Segoe MDL2 Assets codepoint
$glyphs = [ordered]@{
  "window"         = 0xE737  # window frame (Show / Hide X-Now)
  "home"           = 0xE80F  # home (Navigate, Home feed)
  "explore"        = 0xE721  # magnifier (Explore)
  "notifications"  = 0xEA8F  # bell (Notifications)
  "messages"       = 0xE715  # envelope (Messages)
  "bookmarks"      = 0xE734  # star (Bookmarks)
  "profile"        = 0xE77B  # person (My profile)
  "refresh"        = 0xE72C  # circular arrow (Refresh)
  "zoom-in"        = 0xE8A3  # magnifier + (Zoom in)
  "zoom-out"       = 0xE8A5  # magnifier - (Zoom out)
  "zoom-reset"     = 0xE81C  # clock w/ arrow (Reset zoom)
  "devtools"       = 0xE943  # curly braces (Developer tools)
  "copy-url"       = 0xE71B  # chain links (Copy URL)
  "open-browser"   = 0xE774  # globe (Open in browser)
  "compact-memory" = 0xE74D  # trash (Compact memory & cache)
  "cobalt"         = 0xE896  # download into tray (Cobalt downloader)
  "about"          = 0xE946  # circled i (About X-Now)
  "quit"           = 0xE8BB  # X (Quit X-Now)
}

function Render-Glyph([char]$code, [string]$path) {
  $size = 64
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)
  $font = New-Object System.Drawing.Font("Segoe MDL2 Assets", 46, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.DrawString([string]$code, $font, $brush, (New-Object System.Drawing.RectangleF(0, 0, $size, $size)), $sf)
  $g.Dispose(); $sf.Dispose(); $font.Dispose(); $brush.Dispose()

  $small = New-Object System.Drawing.Bitmap(16, 16, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($small)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g2.Clear([System.Drawing.Color]::Transparent)
  $g2.DrawImage($bmp, (New-Object System.Drawing.Rectangle(0, 0, 16, 16)), 0, 0, $size, $size, [System.Drawing.GraphicsUnit]::Pixel)
  $g2.Dispose()
  $small.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $small.Dispose(); $bmp.Dispose()
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
foreach ($k in $glyphs.Keys) {
  Render-Glyph ([char]$glyphs[$k]) (Join-Path $OutDir "$k.png")
}
Write-Host ("wrote " + $glyphs.Count + " menu icons to " + $OutDir)
