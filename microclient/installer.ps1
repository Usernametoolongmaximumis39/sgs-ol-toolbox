param(
    [ValidateSet('Manage', 'Install', 'Uninstall', 'Restore', 'Audit')][string]$Action = 'Install',
    [string]$Resources = $env:SGS_TOOLBOX_RESOURCES,
    [string]$PackageRoot = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
$utf8 = New-Object Text.UTF8Encoding($false)
if ($Action -ne 'Audit') { Write-Host '请右键点击 BAT，选择“以管理员身份运行”；若使用终端，请先以管理员身份打开终端。' }

function Read-Json([string]$File) { return ([IO.File]::ReadAllText($File, [Text.Encoding]::UTF8) | ConvertFrom-Json) }
function Hash([string]$File) {
    $algorithm = [Security.Cryptography.SHA256]::Create(); $stream = [IO.File]::OpenRead($File)
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}
function Text-Hash([string]$Text) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() } finally { $algorithm.Dispose() }
}
function Read-OfficialText([string]$Archive, [string]$Relative) {
    $bytes = [IO.File]::ReadAllBytes($Archive)
    $header = [Text.Encoding]::UTF8.GetString($bytes, 16, [BitConverter]::ToInt32($bytes, 12)) | ConvertFrom-Json
    $entry = $header
    foreach ($part in $Relative.Split('/')) { $entry = $entry.files.$part }
    $offset = 8 + [BitConverter]::ToInt32($bytes, 4) + [int]$entry.offset
    return ([Text.Encoding]::UTF8.GetString($bytes, $offset, [int]$entry.size)).TrimStart([char]0xFEFF)
}
function Within([string]$Root, [string]$Relative) {
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $result = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if (-not $result.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw '文件路径超出指定目录。' }
    return $result
}
function Files([string]$Root) {
    if ((Get-Item -LiteralPath $Root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw ('不支持链接目录：' + $Root) }
    foreach ($item in Get-ChildItem -LiteralPath $Root -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw ('发现未知链接，停止：' + $item.FullName) }
        if ($item.PSIsContainer) { Files $item.FullName } else { $item }
    }
}
function Verify-Tree([string]$Root, $Entries, [string[]]$Ignore = @()) {
    $expected = @{}
    foreach ($entry in $Entries) {
        $file = Within $Root $entry.path
        if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Hash $file) -cne $entry.sha256) { throw ('文件缺失或已修改，拒绝继续：' + $file) }
        $expected[$file] = $true
    }
    foreach ($file in Files $Root) {
        $relative = $file.FullName.Substring($Root.TrimEnd('\').Length + 1).Replace('\', '/')
        if (-not $expected.ContainsKey($file.FullName) -and $relative -notin $Ignore) { throw ('发现未知文件，必须先删除：' + $file.FullName) }
    }
}
function Assert-Closed {
    if (Get-Process -Name SGSOL -ErrorAction SilentlyContinue) { throw '三国杀微端仍在运行，请完全退出（包括托盘）后重试。' }
}
function Test-ResourcesDirectory([string]$Path) {
    if (-not $Path) { return $null }
    try {
        $full = [IO.Path]::GetFullPath($Path.Trim().Trim('"'))
        $full = $full.TrimEnd([char[]]@('\', '/'))
        if ([IO.Path]::GetFileName($full) -ieq 'SGSOL.exe') { $full = [IO.Path]::GetDirectoryName($full) }
        if ([IO.Path]::GetFileName($full) -ine 'resources') {
            $child = Join-Path $full 'resources'
            if (Test-Path -LiteralPath $child -PathType Container) { $full = $child }
        }
        if ([IO.Path]::GetFileName($full) -ine 'resources') { return $null }
        if (-not (Test-Path -LiteralPath $full -PathType Container)) { return $null }
        if (-not (Test-Path -LiteralPath (Join-Path (Split-Path $full) 'SGSOL.exe') -PathType Leaf)) { return $null }
        return (Resolve-Path -LiteralPath $full).Path.TrimEnd('\')
    } catch { return $null }
}
function Read-InstallDirectory {
    while ($true) {
        $answer = Read-Host '未找到唯一的微端目录。请输入微端安装目录（可带或不带 resources，例如 D:\SGSOL 或 D:\SGSOL\resources；支持官服和 4399。直接回车取消）'
        if ([string]::IsNullOrWhiteSpace($answer)) { throw '未提供微端目录，安装已取消。' }
        $resolved = Test-ResourcesDirectory $answer
        if ($resolved) { return $resolved }
        Write-Host '目录无效：请选择包含 SGSOL.exe 的客户端根目录，或它的 resources 目录。' -ForegroundColor Yellow
    }
}
function Resolve-Resources {
    if ($Resources) {
        $resolved = Test-ResourcesDirectory $Resources
        if (-not $resolved) { throw '指定的微端目录无效：请提供包含 SGSOL.exe 的客户端根目录或 resources 目录。' }
        return $resolved
    }
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'SGSOL\resources' }
    if (${env:ProgramFiles(x86)}) { $candidates += Join-Path ${env:ProgramFiles(x86)} 'SGSOL\resources' }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\SGSOL\resources' }
    $found = @($candidates | ForEach-Object { Test-ResourcesDirectory $_ } | Where-Object { $_ } | Select-Object -Unique)
    if ($found.Count -eq 1) { return (Resolve-Path -LiteralPath $found[0]).Path.TrimEnd('\') }
    if ($found.Count -gt 1) { Write-Host ('发现多个默认安装目录：' + ($found -join '；')) }
    foreach ($candidate in @((Get-Location).Path, $PSScriptRoot)) {
        $resolved = Test-ResourcesDirectory $candidate
        if ($resolved) { return $resolved }
    }
    return Read-InstallDirectory
}
function Test-Resources($Variant) {
    foreach ($entry in $Variant.resources) {
        $file = Within $Resources $entry.path
        if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Hash $file) -cne $entry.sha256) { return $false }
    }
    return $true
}
function Move-Aside([string]$Path, [string]$Label) {
    $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
    $target = Within $Resources ('.sgs-toolbox-forced-' + $Label + '-' + $stamp)
    $index = 1
    while (Test-Path -LiteralPath $target) { $target = Within $Resources ('.sgs-toolbox-forced-' + $Label + '-' + $stamp + '-' + $index); $index++ }
    Move-Item -LiteralPath $Path -Destination $target
    Write-Host ('已移到旁路目录（未删除）：' + $target)
    return $target
}
function Add-MainPatch([string]$Text) {
    $header = "require('./sgs-toolbox/host.cjs');`r`n"
    $result = if ($Text.StartsWith($header, [StringComparison]::Ordinal)) { $Text } else { $header + $Text }
    $anchor = 'global.PackageId = package.packageId;'
    $channel = "global.PackageId = require('./sgs-toolbox/host.cjs').channelPackageId(global.PackageId);"
    if (-not $result.Contains($channel)) {
        $index = $result.IndexOf($anchor, [StringComparison]::Ordinal)
        if ($index -lt 0) { throw '无法识别的微端 main.js：缺少 PackageId 初始化，无法启用渠道切换。' }
        $result = $result.Insert($index + $anchor.Length, "`r`n" + $channel)
    }
    return $result
}
function Add-ShellPatch([string]$Text) {
    if ($Text.Contains('id="sgs-toolbox-channel"')) { return $Text }
    $block = @'

<style id="sgs-toolbox-channel-style">
#sgs-toolbox-channel{position:fixed;right:16px;bottom:11px;z-index:100010;height:28px;padding:0 14px;border:1px solid #6a5630;border-radius:14px;background:linear-gradient(180deg,#2c271e,#171410);color:#d9c28c;font:12px/26px "Microsoft YaHei","PingFang SC",sans-serif;letter-spacing:.04em;cursor:pointer;box-shadow:inset 0 1px #ffffff12,0 2px 6px #0008;-webkit-app-region:no-drag;transition:border-color .15s,color .15s,background .15s}
#sgs-toolbox-channel:hover,#sgs-toolbox-channel[aria-expanded=true]{border-color:#d9b86c;color:#f0dfb4;background:linear-gradient(180deg,#3a3223,#1d1913)}
#sgs-toolbox-channel:focus-visible{outline:2px solid #d9b86c;outline-offset:2px;border-color:#d9b86c;color:#f0dfb4}
#sgs-toolbox-channel-menu{position:fixed;right:16px;bottom:46px;z-index:100011;display:grid;gap:4px;min-width:132px;padding:6px;border:1px solid #6a5630;border-radius:10px;background:linear-gradient(180deg,#2c271e,#171410);box-shadow:0 8px 22px #000a;-webkit-app-region:no-drag}
#sgs-toolbox-channel-menu[hidden]{display:none}
#sgs-toolbox-channel-menu button{height:28px;border:1px solid transparent;border-radius:6px;background:transparent;color:#d9c28c;font:12px/26px "Microsoft YaHei","PingFang SC",sans-serif;text-align:left;padding:0 10px;cursor:pointer}
#sgs-toolbox-channel-menu button:hover,#sgs-toolbox-channel-menu button:focus-visible{background:#3a3223;border-color:#6a5630;color:#f0dfb4;outline:none}
#sgs-toolbox-channel-menu button[aria-checked=true]{color:#f0dfb4;background:linear-gradient(90deg,#3a3223,#2c271e);border-color:#d9b86c}
#sgs-toolbox-channel-menu .note{padding:2px 10px 4px;color:#9d8f72;font:10px/16px "Microsoft YaHei","PingFang SC",sans-serif}
#sgs-toolbox-channel-toast{position:fixed;right:16px;bottom:46px;z-index:100012;max-width:260px;padding:7px 11px;border:1px solid #6a5630;border-radius:8px;background:#1d1913f2;color:#e7d5a8;font:11px/1.6 "Microsoft YaHei","PingFang SC",sans-serif;box-shadow:0 6px 18px #000a;-webkit-app-region:no-drag}
#sgs-toolbox-channel-toast[hidden]{display:none}
</style>
<button id="sgs-toolbox-channel" type="button" title="切换游戏渠道（切换后需重启微端）" aria-label="切换游戏渠道" aria-expanded="false">切换渠道</button>
<div id="sgs-toolbox-channel-menu" role="menu" aria-label="游戏渠道" hidden>
  <button type="button" role="menuitemradio" data-channel="1" aria-checked="false">官服</button>
  <button type="button" role="menuitemradio" data-channel="3" aria-checked="false">4399</button>
  <div class="note">切换后重启微端生效</div>
</div>
<div id="sgs-toolbox-channel-toast" role="status" hidden></div>
<script id="sgs-toolbox-channel-script">
(function () {
  try {
    const api = window.__SGS_TOOLBOX_CHANNEL__;
    const names = { 1: '官服', 3: '4399' };
    const button = document.getElementById('sgs-toolbox-channel');
    const menu = document.getElementById('sgs-toolbox-channel-menu');
    const toast = document.getElementById('sgs-toolbox-channel-toast');
    let toastTimer = 0;
    const read = async () => {
      try { const state = await api({ action: 'get' }); return state && names[state.selected] ? Number(state.selected) : 0; } catch (_) { return 0; }
    };
    const write = async id => {
      try { await api({ action: 'set', packageId: id }); return true; } catch (_) { return false; }
    };
    const paint = async () => {
      const id = await read();
      button.textContent = '渠道：' + (names[id] || '切换');
      for (const choice of menu.querySelectorAll('[data-channel]')) choice.setAttribute('aria-checked', String(Number(choice.dataset.channel) === id));
    };
    const showToast = text => {
      toast.textContent = text; toast.hidden = false; clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
    };
    const close = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', async event => {
      event.stopPropagation();
      if (typeof api !== 'function') { showToast('当前接入层不支持渠道切换，请使用游戏目录的 switch-channel.bat。'); return; }
      await paint();
      const open = menu.hidden;
      menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', async event => {
      const choice = event.target.closest('[data-channel]');
      if (!choice) return;
      event.stopPropagation();
      const id = Number(choice.dataset.channel);
      if (typeof api !== 'function' || !await write(id)) { showToast('渠道配置写入失败，请使用游戏目录的 switch-channel.bat。'); return; }
      await paint(); close();
      showToast('已切换到' + names[id] + '，请完全退出后重新打开微端。');
    });
    document.addEventListener('click', event => { if (!menu.hidden && !menu.contains(event.target) && event.target !== button) close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { close(); button.focus(); } });
    if (typeof api === 'function') paint();
  } catch (error) { console.error('[工具箱渠道]', error); }
})();
</script>
'@
    $index = $Text.LastIndexOf('</body>', [StringComparison]::OrdinalIgnoreCase)
    if ($index -lt 0) { throw '无法识别的微端 index_wd.html：缺少 </body>。' }
    return $Text.Insert($index, $block + "`r`n")
}
function Add-FramePatch([string]$Text) {
    if ($Text.Contains('__SGS_TOOLBOX_CHANNEL__')) { return $Text }
    $block = @'

;(function () {
    try {
        const { ipcRenderer } = require('electron');
        window.__SGS_TOOLBOX_CHANNEL__ = request => ipcRenderer.invoke('sgs-toolbox:channel-shell:v1', request);
    } catch (error) { console.error('[工具箱渠道]', error); }
})();
'@
    return $Text.TrimEnd() + "`r`n" + $block + "`r`n"
}
function Expand-Official([string]$Archive, [string]$Destination) {
    $stream = [IO.File]::OpenRead($Archive)
    try {
        $prefix = New-Object byte[] 16
        if ($stream.Read($prefix, 0, 16) -ne 16) { throw 'ASAR 文件头不完整。' }
        $headerBytes = [BitConverter]::ToUInt32($prefix, 12)
        $dataStart = 8L + [BitConverter]::ToUInt32($prefix, 4)
        if ($headerBytes -gt 16MB -or $headerBytes -lt 2 -or 16L + $headerBytes -gt $stream.Length) { throw 'ASAR 文件头无效。' }
        $buffer = New-Object byte[] $headerBytes
        if ($stream.Read($buffer, 0, $buffer.Length) -ne $buffer.Length) { throw 'ASAR 文件头读取失败。' }
        $header = [Text.Encoding]::UTF8.GetString($buffer) | ConvertFrom-Json
        function Expand-Node($Node, [string]$Relative) {
            foreach ($property in $Node.files.PSObject.Properties) {
                if ($property.Name -match '[\\/:]' -or $property.Name -in @('.', '..')) { throw 'ASAR 中存在无效路径。' }
                $entry = $property.Value
                $name = if ($Relative) { $Relative + '/' + $property.Name } else { $property.Name }
                $target = Within $Destination $name
                if ($entry.PSObject.Properties['link']) { throw 'ASAR 中存在不支持的链接。' }
                if ($entry.PSObject.Properties['files']) { [IO.Directory]::CreateDirectory($target) | Out-Null; Expand-Node $entry $name; continue }
                if ($entry.PSObject.Properties['unpacked'] -and $entry.unpacked) {
                    Copy-Item -LiteralPath (Within (Join-Path $Resources 'app.asar.unpacked') $name) -Destination $target
                } else {
                    $size = [long]$entry.size; $offset = $dataStart + [long]$entry.offset
                    if ($size -lt 0 -or $size -gt 128MB -or $offset -lt $dataStart -or $offset + $size -gt $stream.Length) { throw 'ASAR 文件范围无效。' }
                    $bytes = New-Object byte[] $size; $stream.Position = $offset
                    if ($stream.Read($bytes, 0, $bytes.Length) -ne $bytes.Length) { throw 'ASAR 文件读取失败。' }
                    [IO.File]::WriteAllBytes($target, $bytes)
                }
            }
        }
        [IO.Directory]::CreateDirectory($Destination) | Out-Null
        Expand-Node $header ''
    } finally { $stream.Dispose() }
}

try {
    if ($Action -eq 'Manage') {
        Write-Host '1. 安装 / 更新工具箱'
        Write-Host '2. 卸载工具箱，恢复官方微端（保留设置与插件数据）'
        Write-Host '0. 退出，不修改文件'
        switch (Read-Host '请输入 1、2 或 0') {
            '1' { $Action = 'Install' }
            '2' { $Action = 'Uninstall' }
            '0' { Write-Host '已取消，未修改微端。'; exit 0 }
            default { throw '无效选择，未修改微端。' }
        }
    }
    $PackageRoot = (Resolve-Path -LiteralPath $PackageRoot).Path.TrimEnd('\')
    $Resources = Resolve-Resources
    if ((Get-Item -LiteralPath $Resources).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '不支持链接形式的 resources 目录。' }
    if ([IO.Path]::GetFileName($Resources) -ine 'resources' -or -not (Test-Path -LiteralPath (Join-Path (Split-Path $Resources) 'SGSOL.exe') -PathType Leaf)) { throw '请选择官方 SGSOL.exe 旁边的 resources 目录。' }
    # Verify the resolved target before any recursive cleanup or directory move.
    $app = Within $Resources 'app'; $backup = Within $Resources 'sgs-toolbox-official.asar'; $asar = Within $Resources 'app.asar'
    $stateFile = Within $app 'sgs-toolbox-install.json'
    $stage = Within $Resources '.sgs-toolbox-stage'; $rollback = Within $Resources '.sgs-toolbox-rollback'
    $official = $null; $owned = $false; $original = $null; $payload = $null; $manifest = $null; $force = $false; $variants = @()
    Assert-Closed
    try {
    if (Test-Path -LiteralPath $stage) { throw '存在上次安装的暂存目录 .sgs-toolbox-stage，请先检查并移走后重试。' }
    if (Test-Path -LiteralPath $rollback) { throw '存在上次安装的回退目录 .sgs-toolbox-rollback，请先恢复或移走后重试。' }
    $officialSet = Read-Json (Join-Path $PackageRoot 'official-windows.json')
    $variants = if ($officialSet -is [array]) { @($officialSet) } elseif ($officialSet.PSObject.Properties['variants']) { @($officialSet.variants) } else { @($officialSet) }
    $owned = Test-Path -LiteralPath $stateFile -PathType Leaf
    if ((Test-Path -LiteralPath $app) -and -not $owned) { throw '发现未知 app 目录（可能含旧小抄）。必须删除旧脚本并恢复官方微端后才能安装。' }
    if ($owned) {
        $state = Read-Json $stateFile
        if ($state.format -cne 'sgs-toolbox-microclient-v1') { throw '无法识别已安装的微端版本。' }
        Verify-Tree $app $state.files @('sgs-toolbox-install.json')
        if (Test-Path -LiteralPath $asar) { throw '同时存在 app.asar 与工具箱 app，必须先恢复官方微端。' }
        $original = $backup
    } else {
        if (Test-Path -LiteralPath $backup) { throw '存在孤立的官方备份，请先恢复为 app.asar。' }
        $original = $asar
    }
    $originalHash = if (Test-Path -LiteralPath $original -PathType Leaf) { Hash $original } else { '' }
    $candidates = @($variants | Where-Object { $_.sha256 -ceq $originalHash })
    if (-not (Test-Path -LiteralPath $original -PathType Leaf) -or -not $candidates.Count) { throw '官方 app.asar 不属于已核实版本的 SHA-256 校验。请使用支持的微端版本，不能使用旧小抄或来源不明的修改版。' }
    $official = $candidates[0]
    if ($candidates.Count -gt 1) {
        $matched = @($candidates | Where-Object { Test-Resources $_ })
        if ($matched.Count) { $official = $matched[0] }
    }
    if ($owned) {
        # The local install-state is not an authority for accepting arbitrary code.
        # Reconstruct the allowed tree from the official archive and verified releases.
        $approved = @(Read-Json (Join-Path $PackageRoot 'approved-payloads.json'))
        $toolboxRoot = Within $app 'sgs-toolbox'
        $coreHash = Hash (Within $toolboxRoot 'toolbox.js')
        $hostHash = Hash (Within $toolboxRoot 'host.cjs')
        $preloadHash = Hash (Within $toolboxRoot 'preload.cjs')
        $matches = @($approved | Where-Object { $_.toolboxSha256 -ceq $coreHash -and $_.hostSha256 -ceq $hostHash -and $_.preloadSha256 -ceq $preloadHash })
        if (-not $matches.Count) { throw '已安装工具箱不属于已核实的微端发行包，拒绝用本机清单自行认证未知脚本。' }
        $expectedMain = Add-MainPatch (Read-OfficialText $original 'main.js')
        $expectedPreload = (Read-OfficialText $original 'script/electron_renderer.js') + "`r`n" + [IO.File]::ReadAllText((Within $toolboxRoot 'preload.cjs'), [Text.Encoding]::UTF8)
        $expectedTree = @($official.files | ForEach-Object {
            $digest = $_.sha256
            if ($_.path -ceq 'main.js') { $digest = Text-Hash $expectedMain }
            if ($_.path -ceq 'script/electron_renderer.js') { $digest = Text-Hash $expectedPreload }
            if ($_.path -ceq 'script/electron_frame.js') { $digest = Text-Hash (Add-FramePatch (Read-OfficialText $original 'script/electron_frame.js')) }
            if ($_.path -ceq 'index_wd.html') { $digest = Text-Hash (Add-ShellPatch (Read-OfficialText $original 'index_wd.html')) }
            [pscustomobject]@{ path=$_.path; sha256=$digest }
        })
        $expectedTree += @([pscustomobject]@{path='sgs-toolbox/toolbox.js';sha256=$coreHash}, [pscustomobject]@{path='sgs-toolbox/host.cjs';sha256=$hostHash}, [pscustomobject]@{path='sgs-toolbox/preload.cjs';sha256=$preloadHash})
        Verify-Tree $app $expectedTree @('sgs-toolbox-install.json')
    }
    # Original unpacked assets remain untouched so restore is byte-for-byte.
    foreach ($entry in $official.resources) {
        $file = Within $Resources $entry.path
        if (-not (Test-Path -LiteralPath $file -PathType Leaf) -or (Hash $file) -cne $entry.sha256) { throw ('官方资源已修改或缺失：' + $file) }
    }
    $allowed = @{}
    foreach ($entry in $official.resources) { $allowed[(Within $Resources $entry.path)] = $true }
    foreach ($item in Get-ChildItem -LiteralPath $Resources -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw ('发现未知链接：' + $item.FullName) }
        if ($item.FullName -eq $app -and $owned) { continue }
        if ($item.Name -in @('xc-ext', 'xiaochao', 'scripts', 'userscripts') -or $item.Name -match 'xiaochao|小抄') { throw ('必须先删除旧小抄或未知脚本目录：' + $item.FullName) }
        $items = if ($item.PSIsContainer) { @(Files $item.FullName) } else { @($item) }
        foreach ($file in $items) {
            if ($file.FullName -in @($original)) { continue }
            if ($file.Name -match '\.(?:[cm]?js|asar(?:\.bak)?|zip|bat|cmd|ps1|vbs)$' -and -not $allowed.ContainsKey($file.FullName)) { throw ('发现未知脚本或安装包，必须先删除：' + $file.FullName) }
        }
    }
    if ($Action -eq 'Install') {
        $payload = Join-Path $PackageRoot 'payload'; $manifest = Read-Json (Join-Path $PackageRoot 'payload.json')
        if ($manifest.format -cne 'sgs-toolbox-microclient-v1' -or $manifest.edition -notin @('full', 'lite')) { throw '安装包清单无效。' }
        Verify-Tree $payload $manifest.files
    }
    } catch {
        if ($Action -ne 'Install') { throw }
        if (-not (Test-Path -LiteralPath (Join-Path $PackageRoot 'payload.json') -PathType Leaf) -or -not (Test-Path -LiteralPath (Join-Path $PackageRoot 'payload') -PathType Container)) { throw '安装包不完整，无法继续安装，未修改微端。' }
        $probe = Read-Json (Join-Path $PackageRoot 'payload.json')
        if ($probe.format -cne 'sgs-toolbox-microclient-v1' -or $probe.edition -notin @('full', 'lite')) { throw '安装包清单无效，无法继续安装，未修改微端。' }
        if (-not (Test-Path -LiteralPath $asar -PathType Leaf) -and -not (Test-Path -LiteralPath $backup -PathType Leaf)) { throw '既没有 app.asar，也没有官方备份，无法继续安装。请先重装官方微端。' }
        Write-Host '安装检查未通过。你可能以前使用过小抄或其他辅助脚本，安装可能会导致你丢失这些脚本，确认风险后按 y 继续。'
        if ((Read-Host '按 y 继续（其他输入均取消）') -notmatch '^(?i)y$') { throw '未确认风险，安装已取消，未修改微端。' }
        $force = $true
    }
    if ($Action -eq 'Audit') { Write-Host '检查通过：官方文件和已安装工具箱完整，未发现未知脚本。'; exit 0 }
    if ($Action -in @('Restore', 'Uninstall')) {
        if (-not $owned) { Write-Host '当前已是通过校验的官方微端，无需卸载。'; exit 0 }
        Assert-Closed
        Move-Item -LiteralPath $app -Destination $rollback
        try { Move-Item -LiteralPath $backup -Destination $asar } catch { Move-Item -LiteralPath $rollback -Destination $app; throw }
        Remove-Item -LiteralPath $rollback -Recurse -Force
        Write-Host '已卸载工具箱并恢复官方微端。工具箱设置、插件和脚本更新缓存保留在用户数据中，不会被官方微端加载。'; exit 0
    }
    if ($force) {
        $payload = Join-Path $PackageRoot 'payload'
        if (-not (Test-Path -LiteralPath $payload -PathType Container) -or -not (Test-Path -LiteralPath (Join-Path $PackageRoot 'payload.json') -PathType Leaf)) { throw '安装包缺少 payload / payload.json，无法强制安装。' }
        $manifest = Read-Json (Join-Path $PackageRoot 'payload.json')
        if ($manifest.format -cne 'sgs-toolbox-microclient-v1' -or $manifest.edition -notin @('full', 'lite')) { throw '安装包清单无效，无法强制安装。' }
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
        if (Test-Path -LiteralPath $rollback) { Remove-Item -LiteralPath $rollback -Recurse -Force }
        if (Test-Path -LiteralPath $asar -PathType Leaf) { $original = $asar }
        elseif (Test-Path -LiteralPath $backup -PathType Leaf) { $original = $backup }
        else { throw '既没有 app.asar，也没有官方备份，无法强制安装。请先重装官方微端。' }
        Write-Host '已确认强制安装：跳过哈希与文件校验；resources 中 app 以外的未知脚本不代为删除。'
    } else {
        Write-Host '校验通过，未发现目录内未知脚本，直接安装；安装器不能检查微端目录外的注入器。'
    }
    $versionLabel = if ($manifest.PSObject.Properties['version']) { [string]$manifest.version } else { 'unknown' }
    $movedOriginal = $false; $movedApp = $false; $committed = $false; $asideAsar = $null
    try {
        # Expand directly from the exact official archive. No third-party app is copied.
        Expand-Official $original $stage
        Copy-Item -LiteralPath $payload -Destination (Join-Path $stage 'sgs-toolbox') -Recurse
        $mainFile = Within $stage 'main.js'; $preloadFile = Within $stage 'script/electron_renderer.js'
        [IO.File]::WriteAllText($mainFile, (Add-MainPatch ([IO.File]::ReadAllText($mainFile, [Text.Encoding]::UTF8))), $utf8)
        $shellFile = Within $stage 'index_wd.html'
        if (Test-Path -LiteralPath $shellFile -PathType Leaf) { [IO.File]::WriteAllText($shellFile, (Add-ShellPatch ([IO.File]::ReadAllText($shellFile, [Text.Encoding]::UTF8))), $utf8) }
        $frameFile = Within $stage 'script/electron_frame.js'
        if (Test-Path -LiteralPath $frameFile -PathType Leaf) { [IO.File]::WriteAllText($frameFile, (Add-FramePatch ([IO.File]::ReadAllText($frameFile, [Text.Encoding]::UTF8))), $utf8) }
        [IO.File]::AppendAllText($preloadFile, "`r`n" + [IO.File]::ReadAllText((Join-Path $payload 'preload.cjs'), [Text.Encoding]::UTF8), $utf8)
        $records = @(Files $stage | ForEach-Object { @{path=$_.FullName.Substring($stage.Length+1).Replace('\','/');sha256=(Hash $_.FullName)} })
        $officialSha = if ($official -and $official.PSObject.Properties['sha256']) { [string]$official.sha256 } else { '' }
        $record = @{format='sgs-toolbox-microclient-v1'; version=$versionLabel; edition=$manifest.edition; officialSha256=$officialSha; files=$records}
        if ($force) { $record.forced = $true; $record.forcedAt = (Get-Date).ToUniversalTime().ToString('o') }
        [IO.File]::WriteAllText((Join-Path $stage 'sgs-toolbox-install.json'), ($record | ConvertTo-Json -Depth 8), $utf8)
        Assert-Closed
        if ($original -ceq $asar) {
            if (Test-Path -LiteralPath $backup) { Move-Aside $backup 'conflicting-backup' | Out-Null }
            Move-Item -LiteralPath $asar -Destination $backup; $movedOriginal = $true
        } elseif ($force -and (Test-Path -LiteralPath $asar)) {
            $asideAsar = Move-Aside $asar 'conflicting-asar'
        }
        if (Test-Path -LiteralPath $app) { Move-Item -LiteralPath $app -Destination $rollback; $movedApp = $true }
        Move-Item -LiteralPath $stage -Destination $app
        $committed = $true
    } catch {
        if ($movedApp -and -not (Test-Path -LiteralPath $app)) { Move-Item -LiteralPath $rollback -Destination $app }
        if ($movedOriginal -and -not (Test-Path -LiteralPath $asar)) { Move-Item -LiteralPath $backup -Destination $asar }
        if ($asideAsar -and -not (Test-Path -LiteralPath $asar) -and (Test-Path -LiteralPath $asideAsar)) { Move-Item -LiteralPath $asideAsar -Destination $asar }
        throw
    } finally {
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    }
    if ($committed -and (Test-Path -LiteralPath $rollback)) { Remove-Item -LiteralPath $rollback -Recurse -Force }
    if ($force) { Write-Host '按确认删除了被替换的旧 app 目录。' }
    $clientRoot = Split-Path $Resources -Parent
    foreach ($name in @('switch-channel.bat', 'switch-channel.ps1')) {
        $source = Join-Path $PackageRoot $name
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { continue }
        try { Copy-Item -LiteralPath $source -Destination (Join-Path $clientRoot $name) -Force }
        catch { Write-Host ('渠道切换工具未能复制：' + $_.Exception.Message) }
    }
    Write-Host '切换游戏渠道：客户端底部右侧的“渠道”按钮，或游戏目录下的 switch-channel.bat。'
    Write-Host ('安装成功：' + $manifest.edition.ToUpperInvariant() + ' ' + $versionLabel + '。重新打开微端生效；原设置、已装插件、停用与卸载记录保留。')
    exit 0
} catch { Write-Host ('操作未完成，不能视为安装或卸载成功：' + ($_ | Out-String)); exit 1 }
