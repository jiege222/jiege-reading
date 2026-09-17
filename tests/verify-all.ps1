$ErrorActionPreference = 'Stop'
Get-ChildItem -LiteralPath $PSScriptRoot -Filter 'verify-*.ps1' -File |
    Where-Object { $_.Name -ne 'verify-all.ps1' } |
    ForEach-Object { & $_.FullName }
