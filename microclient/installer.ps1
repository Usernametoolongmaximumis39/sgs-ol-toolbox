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
    return [Text.Encoding]::UTF8.GetString($bytes, $offset, [int]$entry.size)
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
function Resolve-Resources {
    if ($Resources) { return (Resolve-Path -LiteralPath $Resources).Path.TrimEnd('\') }
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'SGSOL\resources' }
    if (${env:ProgramFiles(x86)}) { $candidates += Join-Path ${env:ProgramFiles(x86)} 'SGSOL\resources' }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\SGSOL\resources' }
    $found = @($candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Container } | Select-Object -Unique)
    if ($found.Count -ne 1) { throw '未找到唯一的微端目录。请运行 install.bat "D:\SGSOL\resources" 明确指定。' }
    return (Resolve-Path -LiteralPath $found[0]).Path.TrimEnd('\')
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
    if (Test-Path -LiteralPath $stage) { throw '存在上次安装的暂存目录 .sgs-toolbox-stage，请先检查并移走后重试。' }
    if (Test-Path -LiteralPath $rollback) { throw '存在上次安装的回退目录 .sgs-toolbox-rollback，请先恢复或移走后重试。' }
    Assert-Closed
    $official = Read-Json (Join-Path $PackageRoot 'official-windows.json')
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
    if (-not (Test-Path -LiteralPath $original -PathType Leaf) -or (Hash $original) -cne $official.sha256) { throw '官方 app.asar 未通过已核实版本的 SHA-256 校验。请使用支持的官方 Windows 1.1.6 微端，不能使用旧小抄或来源不明的修改版。' }
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
        $expectedMain = "require('./sgs-toolbox/host.cjs');`r`n" + (Read-OfficialText $original 'main.js')
        $expectedPreload = (Read-OfficialText $original 'script/electron_renderer.js') + "`r`n" + [IO.File]::ReadAllText((Within $toolboxRoot 'preload.cjs'), [Text.Encoding]::UTF8)
        $expectedTree = @($official.files | ForEach-Object {
            $digest = $_.sha256
            if ($_.path -ceq 'main.js') { $digest = Text-Hash $expectedMain }
            if ($_.path -ceq 'script/electron_renderer.js') { $digest = Text-Hash $expectedPreload }
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
    if ($Action -eq 'Audit') { Write-Host '检查通过：官方文件和已安装工具箱完整，未发现未知脚本。'; exit 0 }
    if ($Action -in @('Restore', 'Uninstall')) {
        if (-not $owned) { Write-Host '当前已是通过校验的官方微端，无需卸载。'; exit 0 }
        Assert-Closed
        Move-Item -LiteralPath $app -Destination $rollback
        try { Move-Item -LiteralPath $backup -Destination $asar } catch { Move-Item -LiteralPath $rollback -Destination $app; throw }
        Remove-Item -LiteralPath $rollback -Recurse -Force
        Write-Host '已卸载工具箱并恢复官方微端。工具箱设置、插件和脚本更新缓存保留在用户数据中，不会被官方微端加载。'; exit 0
    }
    Write-Host '必须删除包括旧小抄在内的所有未知脚本。安装器不会替你关闭或隐藏它们。'
    Write-Host '请同时检查微端目录外自行配置的注入器；安装器不能检查其他程序的运行配置。'
    if ((Read-Host '确认已经删除后，请准确输入 CLEAN（其他输入均取消）') -cne 'CLEAN') { throw '未确认清理，安装已取消，未修改微端。' }
    $payload = Join-Path $PackageRoot 'payload'; $manifest = Read-Json (Join-Path $PackageRoot 'payload.json')
    if ($manifest.format -cne 'sgs-toolbox-microclient-v1' -or $manifest.edition -notin @('full', 'lite')) { throw '安装包清单无效。' }
    Verify-Tree $payload $manifest.files
    $movedOriginal = $false; $movedApp = $false; $committed = $false
    try {
        # Expand directly from the exact official archive. No third-party app is copied.
        Expand-Official $original $stage
        Copy-Item -LiteralPath $payload -Destination (Join-Path $stage 'sgs-toolbox') -Recurse
        $mainFile = Within $stage 'main.js'; $preloadFile = Within $stage 'script/electron_renderer.js'
        [IO.File]::WriteAllText($mainFile, "require('./sgs-toolbox/host.cjs');`r`n" + [IO.File]::ReadAllText($mainFile, [Text.Encoding]::UTF8), $utf8)
        [IO.File]::AppendAllText($preloadFile, "`r`n" + [IO.File]::ReadAllText((Join-Path $payload 'preload.cjs'), [Text.Encoding]::UTF8), $utf8)
        $records = @(Files $stage | ForEach-Object { @{path=$_.FullName.Substring($stage.Length+1).Replace('\','/');sha256=(Hash $_.FullName)} })
        $record = @{format='sgs-toolbox-microclient-v1'; version=$manifest.version; edition=$manifest.edition; officialSha256=$official.sha256; files=$records}
        [IO.File]::WriteAllText((Join-Path $stage 'sgs-toolbox-install.json'), ($record | ConvertTo-Json -Depth 8), $utf8)
        Assert-Closed
        if ($owned) { Move-Item -LiteralPath $app -Destination $rollback; $movedApp = $true }
        else { Move-Item -LiteralPath $asar -Destination $backup; $movedOriginal = $true }
        Move-Item -LiteralPath $stage -Destination $app
        $committed = $true
    } catch {
        if ($movedApp -and -not (Test-Path -LiteralPath $app)) { Move-Item -LiteralPath $rollback -Destination $app }
        if ($movedOriginal -and -not (Test-Path -LiteralPath $asar)) { Move-Item -LiteralPath $backup -Destination $asar }
        throw
    } finally {
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    }
    if ($committed -and (Test-Path -LiteralPath $rollback)) { Remove-Item -LiteralPath $rollback -Recurse -Force }
    Write-Host ('安装成功：' + $manifest.edition.ToUpperInvariant() + ' ' + $manifest.version + '。重新打开微端生效；原设置、已装插件、停用与卸载记录保留。')
    exit 0
} catch { Write-Host ('操作未完成，不能视为安装或卸载成功：' + ($_ | Out-String)); exit 1 }
