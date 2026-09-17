$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$docsRoot = Join-Path $projectRoot 'docs'
$documents = @(Get-ChildItem -LiteralPath $docsRoot -Filter '*.md' -File)
$design = @($documents | Where-Object { $_.Name -like '*MVP.md' })
if ($design.Count -ne 1) {
    throw 'Expected one MVP product design document.'
}

# Reject malformed UTF-8 instead of silently replacing invalid characters.
$decoder = New-Object System.Text.UTF8Encoding($false, $true)
$content = $decoder.GetString([System.IO.File]::ReadAllBytes($design[0].FullName))
if ($content -match 'TODO|TBD|\u5f85\u8865\u5145') {
    throw 'The product design contains unfinished placeholders.'
}

# Check the agreed format/encoding scope and the delivery acceptance section.
$required = @(
    '(?m)^# .+MVP',
    'TXT',
    'UTF-8',
    'GBK',
    '(?m)^## \u4e3b\u8981\u529f\u80fd\s*$',
    '(?m)^## \u6682\u4e0d\u5305\u542b\s*$',
    '(?m)^## \u4ea4\u4ed8\u9a8c\u6536\s*$'
)
foreach ($pattern in $required) {
    if ($content -notmatch $pattern) {
        throw "Missing product design requirement: $pattern"
    }
}

Write-Output 'PASS: MVP product design is valid UTF-8, has no placeholders, and includes scope and acceptance criteria.'
