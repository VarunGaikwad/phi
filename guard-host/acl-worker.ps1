# INTERNAL file-only ACL fixture. Fixed cwd/nonce/role, no arbitrary paths or commands.
# Descriptors are supplied ONLY to CreateNew. Never SetAccessControl/ACL repair.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$nonce = $env:PHI_ACL_NONCE
$role = $env:PHI_ACL_ROLE
$checks = [ordered]@{}
$step = 'setup'
$identity = $null
$failed = $null

function Need($value) { if (-not $value) { throw 'ACL_CHECK_FAILED' } }
function Native-Code($exception) {
    while ($null -ne $exception.InnerException) { $exception = $exception.InnerException }
    return ($exception.HResult -band 65535)
}
function Descriptor([bool]$denyRead) {
    $security = New-Object System.Security.AccessControl.FileSecurity
    $security.SetOwner($sid)
    $security.SetAccessRuleProtection($true, $false)
    $allow = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)
    $security.AddAccessRule($allow)
    if ($denyRead) {
        $deny = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, [System.Security.AccessControl.FileSystemRights]::ReadData, [System.Security.AccessControl.AccessControlType]::Deny)
        $security.AddAccessRule($deny)
    }
    return $security
}
function Check-Acl($security, [bool]$denyRead) {
    Need ($security.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ceq $sid.Value)
    Need ($security.AreAccessRulesProtected -and $security.AreAccessRulesCanonical)
    $rules = $security.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])
    $expected = 1; if ($denyRead) { $expected = 2 }
    Need ($rules.Count -eq $expected)
    $allowCount = 0; $denyCount = 0
    foreach ($rule in $rules) {
        Need ($rule.IdentityReference.Value -ceq $sid.Value)
        Need (-not $rule.IsInherited -and $rule.InheritanceFlags -eq [System.Security.AccessControl.InheritanceFlags]::None -and $rule.PropagationFlags -eq [System.Security.AccessControl.PropagationFlags]::None)
        if ($rule.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow) {
            Need ([int]$rule.FileSystemRights -eq 0x1f01ff); $allowCount++
        } else { Need ($denyRead -and [int]$rule.FileSystemRights -eq 1); $denyCount++ }
    }
    Need ($allowCount -eq 1 -and $denyCount -eq ($expected - 1))
}
function Write-Fixture([string]$path, [bool]$denyRead) {
    $stream = $null
    try {
        # WriteData + ReadPermissions: can write and query DACL, but never request ReadData.
        $rights = [System.Security.AccessControl.FileSystemRights]::WriteData -bor [System.Security.AccessControl.FileSystemRights]::ReadPermissions
        $security = Descriptor $denyRead
        $stream = New-Object System.IO.FileStream($path, [System.IO.FileMode]::CreateNew, $rights, [System.IO.FileShare]::None, 4096, [System.IO.FileOptions]::None, $security)
        Check-Acl ($stream.GetAccessControl()) $denyRead
        $stream.Write($payload, 0, $payload.Length); $stream.Flush($true)
        return [Convert]::ToBase64String($stream.GetAccessControl().GetSecurityDescriptorBinaryForm())
    } finally { if ($null -ne $stream) { $stream.Dispose() } }
}
function Read-Fixture([string]$path) {
    $stream = $null
    try {
        $stream = New-Object System.IO.FileStream($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
        Check-Acl ($stream.GetAccessControl()) $false
        Need ($stream.Length -eq $payload.Length)
        $bytes = New-Object byte[] $payload.Length
        $offset = 0
        while ($offset -lt $bytes.Length) { $n = $stream.Read($bytes, $offset, $bytes.Length - $offset); Need ($n -gt 0); $offset += $n }
        Need ([Convert]::ToBase64String($bytes) -ceq [Convert]::ToBase64String($payload))
        return [Convert]::ToBase64String($stream.GetAccessControl().GetSecurityDescriptorBinaryForm())
    } finally { if ($null -ne $stream) { $stream.Dispose() } }
}
function Metadata-Acl([string]$path) {
    $stream = $null
    try {
        # Metadata-only access, not a write-capable fallback or a ReadData request.
        $stream = New-Object System.IO.FileStream($path, [System.IO.FileMode]::Open, [System.Security.AccessControl.FileSystemRights]::ReadPermissions, [System.IO.FileShare]::None, 4096, [System.IO.FileOptions]::None, $null)
        Need (-not $stream.CanRead -and -not $stream.CanWrite)
        Check-Acl ($stream.GetAccessControl()) $true
        return [Convert]::ToBase64String($stream.GetAccessControl().GetSecurityDescriptorBinaryForm())
    } finally { if ($null -ne $stream) { $stream.Dispose() } }
}
try {
    Need ($args.Count -eq 0 -and $env:OS -eq 'Windows_NT' -and $nonce -cmatch '^[a-f0-9]{32}$' -and @('create','read') -ccontains $role)
    $root = [Environment]::CurrentDirectory
    Need ([System.IO.Path]::GetFileName($root) -cmatch ('^phi-acl-' + $nonce + '-[a-zA-Z0-9]+$'))
    Need (([System.IO.File]::GetAttributes($root) -band [System.IO.FileAttributes]::ReparsePoint) -eq 0)
    $marker = [System.IO.Path]::Combine($root, 'owner.marker')
    Need (([System.IO.File]::GetAttributes($marker) -band [System.IO.FileAttributes]::ReparsePoint) -eq 0)
    Need ((Get-Item -LiteralPath $marker).Length -eq 32 -and [System.IO.File]::ReadAllText($marker) -ceq $nonce)
    # Only Query, only this process/thread's current user SID; never Name/claims/privileges.
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent([System.Security.Principal.TokenAccessLevels]::Query)
    $sid = $identity.User
    Need ($null -ne $sid)
    $payload = [System.Text.Encoding]::ASCII.GetBytes('phi-acl-synthetic-v1')
    $allowPath = [System.IO.Path]::Combine($root, 'allow.bin')
    $denyPath = [System.IO.Path]::Combine($root, 'deny.bin')
    if ($role -eq 'create') {
        $step = 'creationTimeAllowAcl'; $allowAcl = Write-Fixture $allowPath $false; $checks[$step] = $true
        $step = 'creationTimeDenyAcl'; $denyAcl = Write-Fixture $denyPath $true; $checks[$step] = $true
        $step = 'createNewCollision'
        $collision = $null; $code = 0
        try {
            $rights = [System.Security.AccessControl.FileSystemRights]::WriteData -bor [System.Security.AccessControl.FileSystemRights]::ReadPermissions
            $collision = New-Object System.IO.FileStream($allowPath, [System.IO.FileMode]::CreateNew, $rights, [System.IO.FileShare]::None, 4096, [System.IO.FileOptions]::None, (Descriptor $true))
        } catch { $code = Native-Code $_.Exception }
        finally { if ($null -ne $collision) { $collision.Dispose() } }
        Need ($code -eq 80 -or $code -eq 183); $checks[$step] = $true
        $step = 'collisionPreservedBytes'; $afterAcl = Read-Fixture $allowPath; $checks[$step] = $true
        $step = 'collisionPreservedAcl'; Need ($afterAcl -ceq $allowAcl); $checks[$step] = $true
    } else {
        foreach ($path in @($allowPath, $denyPath)) { Need (([System.IO.File]::GetAttributes($path) -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) }
        $step = 'allowReadBefore'; $allowAcl = Read-Fixture $allowPath; $checks[$step] = $true
        $step = 'denyAclReadback'; $denyAcl = Metadata-Acl $denyPath; $checks[$step] = $true
        $step = 'denyReadAccessDenied'; $reader = $null; $code = 0
        try { $reader = New-Object System.IO.FileStream($denyPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None) }
        catch { $code = Native-Code $_.Exception }
        finally { if ($null -ne $reader) { $reader.Dispose() } }
        Need ($code -eq 5); $checks[$step] = $true # Never sharing violation 32, missing file or timeout.
        $step = 'allowReadAfter'; $afterAcl = Read-Fixture $allowPath; $checks[$step] = $true
        $step = 'readerAclUnchanged'; Need ($allowAcl -ceq $afterAcl -and $denyAcl -ceq (Metadata-Acl $denyPath)); $checks[$step] = $true
    }
} catch { $failed = $step } # Never serialize native exception, path, SID or descriptor.
finally { if ($null -ne $identity) { $identity.Dispose() } }
[Console]::Out.WriteLine((@{version=1;nonce=$nonce;role=$role;checks=$checks;failedCheck=$failed} | ConvertTo-Json -Depth 3 -Compress))
if ($null -ne $failed) { exit 1 }
exit 0
