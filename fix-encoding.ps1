$files = @(
  'C:\Users\AbrahamEkstein\expfax\expfax-portal\src\components\fax\fax-list.tsx',
  'C:\Users\AbrahamEkstein\expfax\expfax-portal\src\app\(portal)\covers\page.tsx'
)
foreach ($f in $files) {
  $text = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
  # U+00C2 U+00B7 (Â·) -> U+00B7 (middle dot ·)
  $text = $text.Replace(([string][char]0x00C2 + [string][char]0x00B7), [string][char]0x00B7)
  # U+0022 U+201D ("") -> U+2014 (em dash —)
  $text = $text.Replace(([string][char]0x0022 + [string][char]0x201D), [string][char]0x2014)
  # U+00E2 U+201D U+20AC (â"€) -> U+2500 (box drawing ─)
  $text = $text.Replace(([string][char]0x00E2 + [string][char]0x201D + [string][char]0x20AC), [string][char]0x2500)
  [System.IO.File]::WriteAllText($f, $text, [System.Text.Encoding]::UTF8)
  Write-Host "Fixed: $f"
}
