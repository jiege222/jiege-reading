$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$agentsPath = Join-Path $projectRoot 'AGENTS.md'
if (-not (Test-Path -LiteralPath $agentsPath -PathType Leaf)) {
    throw 'AGENTS.md is missing.'
}

# Unicode escapes keep the test compatible with Windows PowerShell 5.1.
$content = Get-Content -LiteralPath $agentsPath -Raw -Encoding UTF8
$required = @(
    'AI \u5728\u6bcf\u6b21\u65b0\u5bf9\u8bdd\u5f00\u59cb\u5de5\u4f5c\u524d\uff0c\u5fc5\u987b\u4f18\u5148\u8bfb\u53d6\u672c\u6587\u4ef6',
    '1\. \u6bcf\u6b21\u6539\u52a8\u540e\u5fc5\u987b\u521b\u5efa\u5bf9\u5e94\u7684 Git commit\uff0c\u4fbf\u4e8e\u8ffd\u8e2a\u548c\u56de\u6eda\u3002',
    '2\. \u6bcf\u6b21\u6539\u52a8\u540e\u5fc5\u987b\u7f16\u5199\u6216\u66f4\u65b0\u6d4b\u8bd5\uff0c\u4ea4\u4ed8\u524d\u786e\u4fdd\u6240\u6709\u6d4b\u8bd5\u548c\u9a8c\u8bc1\u901a\u8fc7\u3002'
)

foreach ($pattern in $required) {
    if ($content -notmatch $pattern) {
        throw "Required instruction is missing or changed: $pattern"
    }
}

Write-Output 'PASS: AGENTS.md contains the startup instruction and both mandatory rules.'
