[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Task,

    [ValidateSet("codex", "opencode")]
    [string]$Agent = "codex",

    [string]$Name,

    [switch]$NoActivate,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function ConvertTo-TaskSlug {
    param([Parameter(Mandatory = $true)][string]$Value)

    $valueWithAsciiD = $Value.Replace([char]0x0111, "d").Replace([char]0x0110, "D")
    $decomposed = $valueWithAsciiD.Normalize([Text.NormalizationForm]::FormD)
    $builder = [Text.StringBuilder]::new()

    foreach ($character in $decomposed.ToCharArray()) {
        $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($character)
        if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark -and
            [int]$character -lt 128) {
            [void]$builder.Append($character)
        }
    }

    $slug = $builder.ToString().ToLowerInvariant() -replace "[^a-z0-9]+", "-"
    $slug = $slug.Trim("-")
    if ([string]::IsNullOrWhiteSpace($slug)) {
        $slug = "task"
    }

    if ($slug.Length -gt 44) {
        $slug = $slug.Substring(0, 44).TrimEnd("-")
    }

    return $slug
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Push-Location $repoRoot

try {
    & git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "CRM repository is not a Git worktree: $repoRoot"
    }

    & git rev-parse --verify main *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "The CRM repository does not have a local main branch."
    }

    $currentBranch = (& git branch --show-current).Trim()
    if ($currentBranch -ne "main") {
        throw "Run this launcher from the CRM main worktree, not branch '$currentBranch'."
    }

    $pendingChanges = @(& git status --porcelain)
    if ($pendingChanges.Count -gt 0) {
        throw "The CRM main worktree has uncommitted changes. Review or commit them before starting a new task."
    }

    foreach ($commandName in @("git", "orca", $Agent)) {
        if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
            throw "Required command is not available: $commandName"
        }
    }

    $requiredPaths = @(
        ".agents/skills/crm-orchestrator/SKILL.md",
        "scripts/run-codex-coordinator.ps1",
        ".opencode/agents/crm-coordinator.md",
        ".opencode/commands/crm.md"
    )
    foreach ($requiredPath in $requiredPaths) {
        & git cat-file -e "main:$requiredPath" 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "The launcher is not fully installed on main: $requiredPath"
        }
    }

    if ([string]::IsNullOrWhiteSpace($Task)) {
        $Task = Read-Host "Describe the CRM result you want"
    }

    if ([string]::IsNullOrWhiteSpace($Task)) {
        throw "A CRM task description is required."
    }

    if ($Task.Length -gt 4000) {
        throw "The task description is too long for agent startup. Keep it under 4000 characters."
    }

    if ([string]::IsNullOrWhiteSpace($Name)) {
        $slug = ConvertTo-TaskSlug -Value $Task
        $Name = "crm-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff')-$slug"
    } else {
        $Name = ConvertTo-TaskSlug -Value $Name
    }

    if ($Agent -eq "codex") {
        $promptTemplate = @'
Use $crm-orchestrator to complete this CRM requirement end to end:

{0}

Start immediately and work autonomously through discovery, implementation, review,
verification, and evidenced repair. Leave the final diff ready for inspection in
Orca. Ask only for a decision that materially changes business behavior, data,
permissions, a destructive operation, cost, or an external side effect. Do not push,
deploy, commit, mutate remote Supabase, or read .env values.
'@
        $prompt = $promptTemplate -f $Task
    } else {
        $prompt = "/crm $Task"
    }

    $comment = $Task.Trim()
    if ($comment.Length -gt 180) {
        $comment = $comment.Substring(0, 180)
    }

    if ($DryRun) {
        [pscustomobject]@{
            Agent = $Agent
            WorktreeName = $Name
            BaseBranch = "main"
            Prompt = $prompt
        } | ConvertTo-Json -Depth 3
        return
    }

    & orca status --json *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Starting Orca..."
        & orca open *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "Orca could not be started."
        }
    }

    $orcaArguments = @(
        "worktree", "create",
        "--repo=path:$repoRoot",
        "--name=$Name",
        "--base-branch=main",
        "--parent-worktree=path:$repoRoot",
        "--setup=run",
        "--comment=$comment",
        "--json"
    )

    if ($Agent -eq "opencode") {
        $orcaArguments += "--agent=opencode"
        $orcaArguments += "--prompt=$prompt"
    }

    if (-not $NoActivate) {
        $orcaArguments += "--activate"
    }

    $rawResult = & orca @orcaArguments
    if ($LASTEXITCODE -ne 0) {
        throw ($rawResult -join [Environment]::NewLine)
    }

    $result = ($rawResult -join [Environment]::NewLine) | ConvertFrom-Json
    if (-not $result.ok) {
        throw "Orca did not create the CRM worktree."
    }

    $worktree = $result.result.worktree

    if ($Agent -eq "codex") {
        $encodedPrompt = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($prompt))
        $runnerPath = Join-Path $worktree.path "scripts\run-codex-coordinator.ps1"
        $terminalCommand = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`" -EncodedPrompt `"$encodedPrompt`""
        $terminalArguments = @(
            "terminal", "create",
            "--worktree=path:$($worktree.path)",
            "--title=CRM Coordinator",
            "--command=$terminalCommand",
            "--json"
        )

        if (-not $NoActivate) {
            $terminalArguments += "--focus"
        }

        $terminalResult = & orca @terminalArguments
        if ($LASTEXITCODE -ne 0) {
            $cleanup = "orca worktree rm --worktree `"id:$($worktree.id)`" --json"
            throw "The worktree was created, but Codex could not start. Worktree: $($worktree.path). Cleanup: $cleanup. Details: $($terminalResult -join [Environment]::NewLine)"
        }
    }

    Write-Host ""
    Write-Host "CRM task started."
    Write-Host "Mode: $Agent"
    Write-Host "Branch: $($worktree.branch -replace '^refs/heads/', '')"
    Write-Host "Path: $($worktree.path)"
    Write-Host "Orca is now running the coordinator."
} finally {
    Pop-Location
}
