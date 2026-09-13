# Read-only API reflection and SYNTHETIC IN-MEMORY descriptors only.
# No streams/listeners, identities/tokens/account lookup, file ACL read/write,
# native-code compilation, impersonation, Docker, services or host setting changes.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($args.Count -ne 0 -or $env:OS -ne 'Windows_NT') { throw 'WINDOWS_SECURITY_REVIEW_SCOPE_REQUIRED' }

function Constructors-With([type]$type, [type]$parameter) {
    return @($type.GetConstructors() | Where-Object { $_.GetParameters().ParameterType -contains $parameter } | ForEach-Object { $_.ToString() })
}
function Encoded-Descriptor($security) {
    return [Convert]::ToBase64String($security.GetSecurityDescriptorBinaryForm())
}
# Deliberately invented numeric SID. Never resolve a name or inspect a real token.
$sidText = 'S-1-5-21-100-200-300-1001'
$sid = New-Object System.Security.Principal.SecurityIdentifier($sidText)
$file = New-Object System.Security.AccessControl.FileSecurity
$file.SetOwner($sid); $file.SetGroup($sid)
$file.SetAccessRuleProtection($true, $false)
$fileRule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)
$file.AddAccessRule($fileRule)

$pipe = New-Object System.IO.Pipes.PipeSecurity
$pipe.SetOwner($sid); $pipe.SetGroup($sid)
$pipe.SetAccessRuleProtection($true, $false)
$pipeRule = New-Object System.IO.Pipes.PipeAccessRule($sid, [System.IO.Pipes.PipeAccessRights]::ReadWrite, [System.Security.AccessControl.AccessControlType]::Allow)
$pipe.AddAccessRule($pipeRule)
$fullPipeRule = New-Object System.IO.Pipes.PipeAccessRule($sid, [System.IO.Pipes.PipeAccessRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)

$nullDacl = New-Object System.Security.AccessControl.RawSecurityDescriptor(('O:' + $sidText + 'G:' + $sidText + 'D:NO_ACCESS_CONTROL'))
$nullBytes = New-Object byte[] $nullDacl.BinaryLength
$nullDacl.GetBinaryForm($nullBytes, 0)
$emptyDacl = New-Object System.Security.AccessControl.RawSecurityDescriptor(('O:' + $sidText + 'G:' + $sidText + 'D:P'))
$emptyBytes = New-Object byte[] $emptyDacl.BinaryLength
$emptyDacl.GetBinaryForm($emptyBytes, 0)

$result = [ordered]@{
    version = 1
    kind = 'windows-security-api-memory-review'
    state = 'locked'
    protection = 'not-active'
    canLaunch = $false
    executable = $false
    gateway = 'deferred'
    scope = 'reflection-and-synthetic-memory-only'
    powershell = $PSVersionTable.PSVersion.ToString()
    clr = [Environment]::Version.ToString()
    pipeOptions = @([Enum]::GetNames([System.IO.Pipes.PipeOptions]))
    fileOptions = @([Enum]::GetNames([System.IO.FileOptions]))
    fileSecurityConstructors = @(Constructors-With ([System.IO.FileStream]) ([System.Security.AccessControl.FileSecurity]))
    directorySecurityCreators = @([System.IO.Directory].GetMethods() | Where-Object { $_.Name -eq 'CreateDirectory' -and $_.GetParameters().ParameterType -contains [System.Security.AccessControl.DirectorySecurity] } | ForEach-Object { $_.ToString() })
    pipeSecurityConstructors = @(Constructors-With ([System.IO.Pipes.NamedPipeServerStream]) ([System.IO.Pipes.PipeSecurity]))
    fileHandleAclRead = ($null -ne [System.IO.FileStream].GetMethod('GetAccessControl', [type[]]@()))
    pipeHandleAclRead = ($null -ne [System.IO.Pipes.PipeStream].GetMethod('GetAccessControl', [type[]]@()))
    pipePeerMethods = @([System.IO.Pipes.NamedPipeServerStream].GetMethods() | Where-Object { $_.Name -match 'ProcessId|Impersonation|RunAsClient' } | ForEach-Object { $_.ToString() })
    fileRuleMask = [int]$fileRule.FileSystemRights
    pipeRuleMask = [int]$pipeRule.PipeAccessRights
    pipeFullControlIncludesCreateInstance = (([int]$fullPipeRule.PipeAccessRights -band [int][System.IO.Pipes.PipeAccessRights]::CreateNewInstance) -ne 0)
    pipeReadWriteIncludesCreateInstance = (([int]$pipeRule.PipeAccessRights -band [int][System.IO.Pipes.PipeAccessRights]::CreateNewInstance) -ne 0)
    descriptors = [ordered]@{file=(Encoded-Descriptor $file);pipe=(Encoded-Descriptor $pipe);nullDacl=[Convert]::ToBase64String($nullBytes);emptyDacl=[Convert]::ToBase64String($emptyBytes)}
    fileCreated = $false
    pipeCreated = $false
    realIdentityRead = $false
    accessCheckPerformed = $false
    nativePrivacyProven = $false
}
[Console]::Out.WriteLine(($result | ConvertTo-Json -Depth 5 -Compress))
