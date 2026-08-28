[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[Windows.Forms.Application]::EnableVisualStyles()

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$launcherPath = Join-Path $PSScriptRoot "start-crm-agent.ps1"

$form = [Windows.Forms.Form]::new()
$form.Text = "CRM Agent"
$form.StartPosition = "CenterScreen"
$form.ClientSize = [Drawing.Size]::new(680, 500)
$form.MinimumSize = [Drawing.Size]::new(680, 500)
$form.MaximizeBox = $false
$form.FormBorderStyle = "FixedDialog"
$form.BackColor = [Drawing.Color]::FromArgb(246, 248, 250)
$form.Font = [Drawing.Font]::new("Segoe UI", 10)
$form.KeyPreview = $true

$title = [Windows.Forms.Label]::new()
$title.Text = "CRM Agent"
$title.Location = [Drawing.Point]::new(28, 22)
$title.Size = [Drawing.Size]::new(620, 38)
$title.Font = [Drawing.Font]::new("Segoe UI Semibold", 22)
$title.ForeColor = [Drawing.Color]::FromArgb(24, 37, 51)
$form.Controls.Add($title)

$subtitle = [Windows.Forms.Label]::new()
$subtitle.Text = "Nhap yeu cau. Orca se tu tao worktree, viet code, review va kiem thu."
$subtitle.Location = [Drawing.Point]::new(31, 65)
$subtitle.Size = [Drawing.Size]::new(620, 24)
$subtitle.ForeColor = [Drawing.Color]::FromArgb(82, 96, 109)
$form.Controls.Add($subtitle)

$modeLabel = [Windows.Forms.Label]::new()
$modeLabel.Text = "Che do thuc hien"
$modeLabel.Location = [Drawing.Point]::new(31, 108)
$modeLabel.Size = [Drawing.Size]::new(200, 22)
$modeLabel.Font = [Drawing.Font]::new("Segoe UI Semibold", 10)
$form.Controls.Add($modeLabel)

$codexRadio = [Windows.Forms.RadioButton]::new()
$codexRadio.Text = "Codex (khuyen dung)"
$codexRadio.Location = [Drawing.Point]::new(34, 137)
$codexRadio.Size = [Drawing.Size]::new(210, 26)
$codexRadio.Checked = $true
$form.Controls.Add($codexRadio)

$openCodeRadio = [Windows.Forms.RadioButton]::new()
$openCodeRadio.Text = "OpenCode (GPT + Claude)"
$openCodeRadio.Location = [Drawing.Point]::new(270, 137)
$openCodeRadio.Size = [Drawing.Size]::new(245, 26)
$form.Controls.Add($openCodeRadio)

$taskLabel = [Windows.Forms.Label]::new()
$taskLabel.Text = "Ban muon CRM lam gi?"
$taskLabel.Location = [Drawing.Point]::new(31, 181)
$taskLabel.Size = [Drawing.Size]::new(250, 22)
$taskLabel.Font = [Drawing.Font]::new("Segoe UI Semibold", 10)
$form.Controls.Add($taskLabel)

$taskBox = [Windows.Forms.TextBox]::new()
$taskBox.Location = [Drawing.Point]::new(34, 210)
$taskBox.Size = [Drawing.Size]::new(612, 165)
$taskBox.Multiline = $true
$taskBox.AcceptsReturn = $true
$taskBox.ScrollBars = "Vertical"
$taskBox.Font = [Drawing.Font]::new("Segoe UI", 11)
$form.Controls.Add($taskBox)

$example = [Windows.Forms.Label]::new()
$example.Text = "Vi du: Sua tong tien don hang khi ap dung giam gia va bo sung test lien quan."
$example.Location = [Drawing.Point]::new(34, 383)
$example.Size = [Drawing.Size]::new(610, 22)
$example.ForeColor = [Drawing.Color]::FromArgb(103, 116, 128)
$form.Controls.Add($example)

$statusLabel = [Windows.Forms.Label]::new()
$statusLabel.Text = "San sang"
$statusLabel.Location = [Drawing.Point]::new(34, 438)
$statusLabel.Size = [Drawing.Size]::new(420, 28)
$statusLabel.ForeColor = [Drawing.Color]::FromArgb(70, 84, 96)
$form.Controls.Add($statusLabel)

$startButton = [Windows.Forms.Button]::new()
$startButton.Text = "Bat dau"
$startButton.Location = [Drawing.Point]::new(516, 425)
$startButton.Size = [Drawing.Size]::new(130, 42)
$startButton.BackColor = [Drawing.Color]::FromArgb(14, 116, 104)
$startButton.ForeColor = [Drawing.Color]::White
$startButton.FlatStyle = "Flat"
$startButton.FlatAppearance.BorderSize = 0
$startButton.Font = [Drawing.Font]::new("Segoe UI Semibold", 10)
$form.Controls.Add($startButton)

$startAction = {
    $task = $taskBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($task)) {
        [Windows.Forms.MessageBox]::Show(
            $form,
            "Hay nhap yeu cau CRM can thuc hien.",
            "Thieu yeu cau",
            [Windows.Forms.MessageBoxButtons]::OK,
            [Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
        $taskBox.Focus()
        return
    }

    $agent = if ($openCodeRadio.Checked) { "opencode" } else { "codex" }
    $startButton.Enabled = $false
    $taskBox.Enabled = $false
    $codexRadio.Enabled = $false
    $openCodeRadio.Enabled = $false
    $statusLabel.Text = "Dang tao worktree va mo Orca..."
    $form.Refresh()

    try {
        $launcherOutput = & $launcherPath -Task $task -Agent $agent 2>&1
        [Windows.Forms.MessageBox]::Show(
            $form,
            "Da tao cong viec va mo trong Orca. Agent dang tu dong thuc hien yeu cau.",
            "CRM Agent da bat dau",
            [Windows.Forms.MessageBoxButtons]::OK,
            [Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
        $form.Close()
    } catch {
        $statusLabel.Text = "Khong the bat dau"
        $details = $_.Exception.Message
        if ($launcherOutput) {
            $details = ($launcherOutput | Out-String).Trim()
        }
        [Windows.Forms.MessageBox]::Show(
            $form,
            $details,
            "CRM Agent gap loi",
            [Windows.Forms.MessageBoxButtons]::OK,
            [Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
        $startButton.Enabled = $true
        $taskBox.Enabled = $true
        $codexRadio.Enabled = $true
        $openCodeRadio.Enabled = $true
    }
}

$startButton.Add_Click($startAction)
$form.Add_Shown({ $taskBox.Focus() })
$form.Add_KeyDown({
    param($sender, $eventArgs)
    if ($eventArgs.Control -and $eventArgs.KeyCode -eq [Windows.Forms.Keys]::Enter) {
        & $startAction
        $eventArgs.SuppressKeyPress = $true
    }
})

[void]$form.ShowDialog()
