# Internal disposable FILE worker only. No Docker, pi, host project or service API.
# Invoked as fixed -Command text; no policy override, profile, downloaded helper or Add-Type.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$nonce = $env:PHI_STORE_NONCE
$stream = $null
function Send-Result([string]$status, [string]$data = '') {
    [Console]::Out.WriteLine((@{version=1;nonce=$nonce;status=$status;data=$data} | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
}
function Read-BoundedLine {
    $s = New-Object System.Text.StringBuilder
    while ($true) {
        $c = [Console]::In.Read()
        if ($c -lt 0) { throw 'EOF' }
        if ($c -eq 10) { return $s.ToString() }
        if ($c -lt 32 -or $c -gt 126 -or $s.Length -ge 70000) { throw 'INPUT' }
        [void]$s.Append([char]$c)
    }
}
function Snapshot {
    if ($stream.Length -gt 131072) { throw 'SIZE' }
    $stream.Position = 0
    $bytes = New-Object byte[] ([int]$stream.Length)
    $offset = 0
    while ($offset -lt $bytes.Length) {
        $n = $stream.Read($bytes, $offset, $bytes.Length - $offset)
        if ($n -le 0) { throw 'READ' }
        $offset += $n
    }
    return ,$bytes
}
function Digest([byte[]]$bytes) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
try {
    if ($env:OS -ne 'Windows_NT' -or $nonce -cnotmatch '^[a-f0-9]{32}$') { throw 'HOST' }
    $root = [Environment]::CurrentDirectory
    if ([System.IO.Path]::GetFileName($root) -cnotmatch ('^phi-store-' + $nonce + '-[a-zA-Z0-9]+$')) { throw 'ROOT' }
    if (([System.IO.File]::GetAttributes($root) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'ROOT' }
    $marker = [System.IO.Path]::Combine($root, 'owner.marker')
    if ((Get-Item -LiteralPath $marker).Length -ne 32 -or [System.IO.File]::ReadAllText($marker) -cne $nonce) { throw 'MARKER' }
    $path = [System.IO.Path]::Combine($root, 'store.bin')
    if (([System.IO.File]::GetAttributes($path) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'LINK' }
    try { $stream = New-Object System.IO.FileStream($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None) }
    catch {
        $cause = $_.Exception
        while ($null -ne $cause.InnerException) { $cause = $cause.InnerException }
        # Only native ERROR_SHARING_VIOLATION is contention; permission/I/O errors aren't a pass.
        if (($cause.HResult -band 65535) -eq 32) { Send-Result 'busy'; exit 0 }
        throw 'OPEN'
    }
    Send-Result 'locked' ([Convert]::ToBase64String((Snapshot)))
    $line = Read-BoundedLine
    if ($line -cne ('release:' + $nonce)) {
        $request = $line | ConvertFrom-Json
        if ((($request.PSObject.Properties.Name | Sort-Object) -join ',') -cne 'body,expectedHash,fault,marker,nonce,version') { throw 'SCHEMA' }
        if ($request.version -ne 1 -or $request.nonce -cne $nonce -or $request.expectedHash -cnotmatch '^[a-f0-9]{64}$') { throw 'SCHEMA' }
        if (@('none','short-write','flush-failure','after-body-flush','after-marker-write','pause-after-body') -cnotcontains $request.fault) { throw 'FAULT' }
        $body = [Convert]::FromBase64String($request.body)
        $commit = [Convert]::FromBase64String($request.marker)
        if ($body.Length -le 0 -or $body.Length -gt 48000 -or $commit.Length -ne 76 -or
            [Convert]::ToBase64String($body) -cne $request.body -or [Convert]::ToBase64String($commit) -cne $request.marker -or
            [Text.Encoding]::ASCII.GetString($commit) -cnotmatch '^PHI_COMMIT:[a-f0-9]{64}\n$' -or
            ($stream.Length + $body.Length + $commit.Length) -gt 131072) { throw 'SIZE' }
        if ((Digest (Snapshot)) -cne $request.expectedHash) { Send-Result 'conflict'; exit 0 }
        $stream.Position = $stream.Length
        if ($request.fault -eq 'short-write') {
            $stream.Write($body, 0, [int][Math]::Floor($body.Length / 2)); $stream.Flush($true); throw 'INJECTED'
        }
        $stream.Write($body, 0, $body.Length)
        if ($request.fault -eq 'flush-failure') { throw 'INJECTED' }
        $stream.Flush($true)
        if ($request.fault -eq 'after-body-flush') { throw 'INJECTED' }
        if ($request.fault -eq 'pause-after-body') {
            Send-Result 'cut'
            [void](Read-BoundedLine) # Controller may kill only THIS retained worker at this checkpoint.
            throw 'INJECTED'
        }
        $stream.Write($commit, 0, $commit.Length)
        if ($request.fault -eq 'after-marker-write') { throw 'INJECTED' }
        $stream.Flush($true)
        Send-Result 'committed' ([Convert]::ToBase64String((Snapshot)))
        if ((Read-BoundedLine) -cne ('release:' + $nonce)) { throw 'RELEASE' }
    }
    $stream.Dispose(); $stream = $null
    Send-Result 'released'
    exit 0
} catch {
    Send-Result 'failed'
    exit 1
} finally {
    if ($null -ne $stream) { $stream.Dispose() }
}
