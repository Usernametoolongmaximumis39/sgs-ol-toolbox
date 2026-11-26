param(
    [ValidateSet('1', '3')][string]$PackageId,
    [switch]$Default,
    [switch]$Status,
    [string]$ConfigPath = $(if ($env:APPDATA) { Join-Path $env:APPDATA 'SGSOL\sgs-toolbox-channel.json' } else { '' })
)
$ErrorActionPreference = 'Stop'
if (-not $ConfigPath) { throw '找不到 APPDATA，无法定位微端用户目录。' }
$channels = @{ 1 = '官服'; 3 = '4399' }

function Read-Channel {
    try {
        $value = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $id = [int]$value.packageId
        if ($channels.ContainsKey($id)) { return $id }
        return $null
    } catch { return $null }
}
function Write-Channel([int]$Id) {
    $directory = Split-Path -Parent $ConfigPath
    if (-not (Test-Path -LiteralPath $directory)) { New-Item -ItemType Directory -Path $directory -Force | Out-Null }
    $temp = $ConfigPath + '.tmp'
    [IO.File]::WriteAllText($temp, (@{ packageId = $Id } | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temp -Destination $ConfigPath -Force
}
function Remove-Channel {
    if (Test-Path -LiteralPath $ConfigPath) { Remove-Item -LiteralPath $ConfigPath -Force }
}
function Show-State {
    $id = Read-Channel
    if ($id) { return ('当前配置：' + $channels[$id]) }
    return '当前配置：客户端默认（没有覆盖配置或配置无效）'
}

if ($Status) { Write-Output (Show-State); exit 0 }
if ($Default) { Remove-Channel; Write-Output '已删除渠道覆盖配置，下次启动使用客户端默认渠道。'; exit 0 }
if ($PackageId) {
    Write-Channel ([int]$PackageId)
    Write-Output ('已切换到' + $channels[[int]$PackageId] + '，请完全退出后重新打开微端。')
    exit 0
}

try { $host.UI.RawUI.WindowTitle = '三国杀 OL 微端渠道切换' } catch {}
while ($true) {
    Write-Host ''
    Write-Host '三国杀 OL 微端渠道切换' -ForegroundColor Yellow
    Write-Host (Show-State)
    if (Get-Process -Name SGSOL -ErrorAction SilentlyContinue) { Write-Host '检测到微端正在运行；切换将在下次启动生效。' -ForegroundColor DarkYellow }
    Write-Host ('配置：' + $ConfigPath) -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '1. 切换到官服'
    Write-Host '2. 切换到 4399'
    Write-Host '3. 使用客户端默认渠道（删除覆盖配置）'
    Write-Host '0. 退出'
    $choice = Read-Host '请输入 1、2、3 或 0'
    switch ($choice) {
        '1' { Write-Channel 1; Write-Host '已切换到官服，请完全退出后重新打开微端。' -ForegroundColor Green }
        '2' { Write-Channel 3; Write-Host '已切换到 4399，请完全退出后重新打开微端。' -ForegroundColor Green }
        '3' { Remove-Channel; Write-Host '已删除覆盖配置，下次启动使用客户端默认渠道。' -ForegroundColor Green }
        '0' { return }
        default { Write-Host '无效选择。' -ForegroundColor Red }
    }
}
