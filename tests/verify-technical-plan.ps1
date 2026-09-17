$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$docRoot = Join-Path $projectRoot 'docx'
$sources = @(Get-ChildItem -LiteralPath $docRoot -Filter '*.md' -File)
if ($sources.Count -ne 1) {
    throw 'Expected one technical plan Markdown source.'
}
$source = $sources[0]
$wordPath = [System.IO.Path]::ChangeExtension($source.FullName, '.docx')
if (-not (Test-Path -LiteralPath $wordPath -PathType Leaf)) {
    throw 'The generated Word technical plan is missing.'
}
$decoder = New-Object System.Text.UTF8Encoding($false, $true)
$sourceText = $decoder.GetString([System.IO.File]::ReadAllBytes($source.FullName))
if ($sourceText -match 'TODO|TBD|\u5f85\u8865\u5145') {
    throw 'The technical plan contains unfinished placeholders.'
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($wordPath)
try {
    $xmlFiles = @{}
    foreach ($name in @('[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'docProps/core.xml')) {
        $entry = $archive.GetEntry($name)
        if ($null -eq $entry) { throw "Missing Word package part: $name" }
        $reader = New-Object System.IO.StreamReader($entry.Open())
        try { $xmlFiles[$name] = [xml]$reader.ReadToEnd() }
        finally { $reader.Dispose() }
    }

    $ns = New-Object System.Xml.XmlNamespaceManager($xmlFiles['word/document.xml'].NameTable)
    $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    $nodes = $xmlFiles['word/document.xml'].SelectNodes('//w:t', $ns)
    $wordText = ($nodes | ForEach-Object { $_.InnerText }) -join "`n"
    $required = @('React', 'TypeScript', 'Vite', 'IndexedDB', 'UTF-8', 'GBK', 'Web Worker', 'textOffset', 'QuotaExceededError', 'Vitest', 'Playwright', 'Git commit')
    foreach ($term in $required) {
        if (-not $wordText.Contains($term)) { throw "Missing technical requirement in Word: $term" }
    }
    if ($xmlFiles['word/document.xml'].SelectNodes('//w:tbl', $ns).Count -ne 3) {
        throw 'Expected stack, data model and acceptance tables.'
    }

    # Compare every source paragraph and table cell with the actual Word text.
    foreach ($line in ($sourceText -split '\r?\n')) {
        $clean = $line.Trim()
        if (-not $clean) { continue }
        if ($clean.StartsWith('|')) {
            $cells = $clean.Trim('|').Split('|') | ForEach-Object { $_.Trim() }
            foreach ($cell in $cells) {
                if ($cell -match '^:?-+:?$') { continue }
                if (-not $wordText.Contains($cell)) { throw "Missing table cell: $cell" }
            }
        } else {
            $clean = $clean -replace '^#{1,3} ', ''
            if (-not $wordText.Contains($clean)) { throw "Missing source paragraph: $clean" }
        }
    }

    # Prevent a stale binary document after editing the reviewable source.
    $hash = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if (-not $xmlFiles['docProps/core.xml'].OuterXml.Contains("source-sha256:$hash")) {
        throw 'The Word document is stale; regenerate it from the Markdown source.'
    }
} finally {
    $archive.Dispose()
}

Write-Output 'PASS: Word technical plan is valid, covers the MVP decisions, and matches its UTF-8 source.'
