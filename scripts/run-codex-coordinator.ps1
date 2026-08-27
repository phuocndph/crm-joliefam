[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$EncodedPrompt
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$prompt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($EncodedPrompt))

Set-Location -LiteralPath $repoRoot

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw "Codex CLI is not available."
}

& codex --dangerously-bypass-hook-trust --sandbox workspace-write --ask-for-approval never $prompt
exit $LASTEXITCODE
