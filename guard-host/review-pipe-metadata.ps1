# Static metadata/IL review ONLY. Load signed readers; never invoke target pipe methods.
# No target methods invoked, compilation, listener, native interop or identity query.
param([switch]$Framework)
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or $env:OS -ne 'Windows_NT') { throw 'PIPE_METADATA_SCOPE_REQUIRED' }
$base = 'C:/Program Files/dotnet/sdk/8.0.408/Sdks/Microsoft.NET.Sdk/tools/net472/'
$target = 'C:/Program Files/dotnet/shared/Microsoft.NETCore.App/8.0.15/System.IO.Pipes.dll'
$expectedHash = '8e1285a55eb5d1091947b60856bdf3a29b4f65e6e3d043f7b0e96b08b2d2ca29'
$runtime = '8.0.15'
if ($Framework) {
    $target = 'C:/WINDOWS/Microsoft.Net/assembly/GAC_MSIL/System.Core/v4.0_4.0.0.0__b77a5c561934e089/System.Core.dll'
    $expectedHash = 'fd1097aed825d392a5dc8d19384381d4bb2a43498ea1c9d917f5d80c66600e1b'
    $runtime = 'Framework-4.8.9347.0'
}
$pins = [ordered]@{
    'System.Runtime.CompilerServices.Unsafe.dll' = '37768488e8ef45729bc7d9a2677633c6450042975bb96516e186da6cb9cd0dcf'
    'System.Buffers.dll' = 'accccfbe45d9f08ffeed9916e37b33e98c65be012cfff6e7fa7b67210ce1fefb'
    'System.Memory.dll' = 'bf3fb84664f4097f1a8a9bc71a51dcf8cf1a905d4080a4d290da1730866e856f'
    'System.Collections.Immutable.dll' = 'd5ec0837bb176abf13dcd52c658c4e84c5264f67065b9c19679b6643f7d21564'
    'System.Reflection.Metadata.dll' = 'f79ea5e38af769cbde5d7f5e873564708941a148bb461472019e10373ea4c780'
}
foreach ($name in $pins.Keys) {
    $path = $base + $name
    if ((Get-FileHash -Algorithm SHA256 $path).Hash.ToLowerInvariant() -cne $pins[$name]) { throw 'PIPE_METADATA_READER_DRIFT' }
    $signature = Get-AuthenticodeSignature $path
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft') { throw 'PIPE_METADATA_READER_TRUST' }
    [void][Reflection.Assembly]::LoadFrom($path)
}
$targetHash = (Get-FileHash -Algorithm SHA256 $target).Hash.ToLowerInvariant()
if ($targetHash -cne $expectedHash) { throw 'PIPE_METADATA_TARGET_DRIFT' }
$signature = Get-AuthenticodeSignature $target
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft') { throw 'PIPE_METADATA_TARGET_TRUST' }
# The installed SDK's Microsoft.NET.Build.Tasks.dll.config redirects Unsafe to 6.0.
# Apply ONLY the observed old identity -> already hash/signature-checked assembly,
# in this short-lived reader process. No config file or system binding policy is changed.
$unsafeAssembly = [Reflection.Assembly]::LoadFrom($base + 'System.Runtime.CompilerServices.Unsafe.dll')
$resolver = [ResolveEventHandler]{ param($sender, $event)
    if ($event.Name -ceq 'System.Runtime.CompilerServices.Unsafe, Version=4.0.4.1, Culture=neutral, PublicKeyToken=b03f5f7f11d50a3a') { return $unsafeAssembly }
    return $null
}
[AppDomain]::CurrentDomain.add_AssemblyResolve($resolver)
$stream = $null; $pe = $null
try {
    $stream = [IO.File]::OpenRead($target)
    if ($stream.Length -gt 2097152) { throw 'PIPE_METADATA_SIZE' }
    $pe = New-Object System.Reflection.PortableExecutable.PEReader($stream)
    $reader = [System.Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($pe)
    function Type-Name($handle) {
        $handle = [System.Reflection.Metadata.EntityHandle]$handle
        $token = [System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken($handle)
        $row = $token -band 0xffffff
        if ($handle.Kind.ToString() -eq 'TypeDefinition') { $t = $reader.GetTypeDefinition([System.Reflection.Metadata.Ecma335.MetadataTokens]::TypeDefinitionHandle($row)) }
        elseif ($handle.Kind.ToString() -eq 'TypeReference') { $t = $reader.GetTypeReference([System.Reflection.Metadata.Ecma335.MetadataTokens]::TypeReferenceHandle($row)) }
        else { return $handle.Kind.ToString() }
        return ($reader.GetString($t.Namespace) + '.' + $reader.GetString($t.Name)).TrimStart('.')
    }
    $symbols = [ordered]@{}
    $methods = @(); $imports = @(); $fields = @()
    foreach ($handle in $reader.TypeDefinitions) {
        $type = $reader.GetTypeDefinition($handle)
        $name = ($reader.GetString($type.Namespace) + '.' + $reader.GetString($type.Name)).TrimStart('.')
        $symbols[([System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken([System.Reflection.Metadata.EntityHandle]$handle)).ToString()] = $name
        foreach ($mh in $type.GetMethods()) {
            $method = $reader.GetMethodDefinition($mh); $mn = $reader.GetString($method.Name)
            $token = [System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken([System.Reflection.Metadata.EntityHandle]$mh)
            $symbols[$token.ToString()] = $name + '::' + $mn
            $imp = $method.GetImport()
            if (-not $imp.Module.IsNil) {
                $imports += [ordered]@{ method=$name+'::'+$mn; entryPoint=$reader.GetString($imp.Name); module=$reader.GetString($reader.GetModuleReference($imp.Module).Name); signature=[Convert]::ToBase64String($reader.GetBlobBytes($method.Signature)) }
            }
            if ($name -in @('System.IO.Pipes.NamedPipeServerStream','System.IO.Pipes.NamedPipeClientStream','System.IO.Pipes.PipeStream')) {
                $il = ''
                if ($method.RelativeVirtualAddress -ne 0) {
                    $body = [System.Reflection.Metadata.PEReaderExtensions]::GetMethodBody($pe, $method.RelativeVirtualAddress)
                    $bytes = $body.GetILBytes()
                    if ($bytes.Length -gt 8192) { throw 'PIPE_METADATA_BODY_SIZE' }
                    $il = [Convert]::ToBase64String($bytes)
                }
                $methods += [ordered]@{type=$name;name=$mn;token=$token;attributes=[int]$method.Attributes;signature=[Convert]::ToBase64String($reader.GetBlobBytes($method.Signature));il=$il}
            }
        }
        foreach ($fh in $type.GetFields()) {
            $field = $reader.GetFieldDefinition($fh); $fn = $reader.GetString($field.Name)
            $symbols[([System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken([System.Reflection.Metadata.EntityHandle]$fh)).ToString()] = $name + '::' + $fn
            if ($name -eq 'System.IO.Pipes.PipeOptions') {
                $ch = $field.GetDefaultValue()
                if (-not $ch.IsNil) { $constant = $reader.GetConstant($ch); $fields += [ordered]@{name=$fn;bytes=[Convert]::ToBase64String($reader.GetBlobBytes($constant.Value))} }
            }
        }
    }
    foreach ($rh in $reader.MemberReferences) {
        $reference = $reader.GetMemberReference($rh)
        $symbols[([System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken([System.Reflection.Metadata.EntityHandle]$rh)).ToString()] = (Type-Name $reference.Parent) + '::' + $reader.GetString($reference.Name)
    }
    foreach ($th in $reader.TypeReferences) {
        $symbols[([System.Reflection.Metadata.Ecma335.MetadataTokens]::GetToken([System.Reflection.Metadata.EntityHandle]$th)).ToString()] = Type-Name $th
    }
    # Retain only symbols whose tokens occur in some overlapping four-byte IL
    # window. This is a compact candidate inventory, NOT instruction/call evidence.
    # The separate bounded decoder establishes actual instruction boundaries.
    $candidates = [ordered]@{}
    foreach ($method in $methods) {
        $bytes = [Convert]::FromBase64String($method.il)
        for ($i = 0; $i + 4 -le $bytes.Length; $i++) {
            $key = [BitConverter]::ToInt32($bytes, $i).ToString()
            if ($symbols.Contains($key)) { $candidates[$key] = $symbols[$key] }
        }
    }
    $symbols = $candidates
    $opcodes = @([Reflection.Emit.OpCodes].GetFields([Reflection.BindingFlags]'Public,Static') | ForEach-Object {
        $op = $_.GetValue($null)
        [ordered]@{value=([int]$op.Value -band 65535);name=$op.Name;operand=$op.OperandType.ToString()}
    })
    $result = [ordered]@{
        version=1;kind='dotnet-pipe-static-metadata';state='locked';protection='not-active';canLaunch=$false;executable=$false;gateway='deferred'
        scope='installed-assembly-static-analysis-only';targetSha256=$targetHash;readerPins=$pins
        targetSignature='Valid / Microsoft';readerSignatures='Valid / Microsoft'
        powershell=$PSVersionTable.PSVersion.ToString();clr=[Environment]::Version.ToString()
        targetRuntime=$runtime;targetAssemblyVersion=$reader.GetAssemblyDefinition().Version.ToString()
        fields=$fields;imports=$imports;methods=$methods;symbols=$symbols;opcodes=$opcodes
        symbolSelection='overlapping-four-byte-candidates-not-call-evidence'
        targetPipeMethodsInvoked=$false;targetAssemblyLoadedByReader=$false
        listenerCreated=$false;identityQueried=$false;peerBindingProven=$false
    }
    $json = $result | ConvertTo-Json -Depth 7 -Compress
    if ($json.Length -gt 262144) { throw 'PIPE_METADATA_OUTPUT_SIZE' }
    [Console]::Out.WriteLine($json)
} finally {
    [AppDomain]::CurrentDomain.remove_AssemblyResolve($resolver)
    if ($null -ne $pe) { $pe.Dispose() }
    if ($null -ne $stream) { $stream.Dispose() }
}
