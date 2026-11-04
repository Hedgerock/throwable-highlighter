param(
    [Parameter(Mandatory)]
    [ValidateRange(1, 2147483647)]
    [int]$ExtensionHostProcessId,

    [Parameter(Mandatory)]
    [string]$WorkspacePath
)

$prototypeRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$workspaceRoot = (Resolve-Path -LiteralPath $WorkspacePath -ErrorAction Stop).ProviderPath
$manifestPath = Join-Path $workspaceRoot 'resource-workspace.json'
$workspaceManifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop |
        ConvertFrom-Json -ErrorAction Stop

$javaFilter = "ParentProcessId = $ExtensionHostProcessId"
$javaCandidates = @(
Get-CimInstance -ClassName Win32_Process -Filter $javaFilter -ErrorAction Stop |
        Where-Object {
            $_.Name -in @('java.exe', 'javaw.exe') -and
                    $_.CommandLine -match 'org\.eclipse\.jdt\.ls\.core'
        }
)

if ($javaCandidates.Count -ne 1) {
    throw 'Expected one standard Java server for the selected Extension Host.'
}

$sourceCommit = & git -C $prototypeRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0) {
    throw 'Cannot determine the source commit.'
}

$workingTreeStatus = @(& git -C $prototypeRoot status --porcelain=v1 --untracked-files=normal)
if ($LASTEXITCODE -ne 0) {
    throw 'Cannot determine the working tree state.'
}

$usageCounts = @(10, 50, 100)
$phasePlan = @(
    @{atMs = 0; name = 'baseline'}
foreach ($index in 0..2) {
    @{atMs = 30000 + $index * 30000; name = "first-$($usageCounts[$index])"}
}
foreach ($cycle in 1..3) {
    foreach ($index in 0..2) {
        @{
            atMs = 120000 + ($cycle - 1) * 30000 + $index * 10000
            name = "repeat-$cycle-$($usageCounts[$index])"
        }
    }
}
    @{atMs = 210000; name = 'recovery'}
)

$runName = 'resources-scale-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$reportDirectory = Join-Path $prototypeRoot "build/reports/performance/$runName"
[void](New-Item -ItemType Directory -Path $reportDirectory -ErrorAction Stop)
$reportPath = Join-Path $reportDirectory 'java-process.json'

Write-Host "Reports: $reportDirectory"
[void](Read-Host 'Close all Java editors, then press Enter to start')

$javaMetadata = $javaCandidates[0]
$javaProcess = Get-Process -Id $javaMetadata.ProcessId -ErrorAction Stop
$javaStartedAtUtc = $javaProcess.StartTime.ToUniversalTime()
$processSamples = [System.Collections.Generic.List[object]]::new()
$measurementStatus = 'incomplete'
$measurementError = $null
$phaseIndex = 0
$previousPhase = $null
$captureStartedAtUtc = [DateTime]::UtcNow.ToString('o')
$measurementClock = [System.Diagnostics.Stopwatch]::StartNew()

try {
    while ($measurementClock.Elapsed.TotalMilliseconds -lt 270000) {
        $javaProcess.Refresh()

        if ($javaProcess.HasExited -or
                $javaProcess.StartTime.ToUniversalTime() -ne $javaStartedAtUtc) {
            throw 'The Java process exited or changed during measurement.'
        }

        $elapsedMs = [Math]::Round($measurementClock.Elapsed.TotalMilliseconds, 3)
        while ($phaseIndex + 1 -lt $phasePlan.Count -and
                $elapsedMs -ge $phasePlan[$phaseIndex + 1].atMs) {
            $phaseIndex++
        }

        $plannedPhase = $phasePlan[$phaseIndex].name
        if ($plannedPhase -ne $previousPhase) {
            Write-Host ('{0}: {1:N1} s' -f $plannedPhase, ($elapsedMs / 1000))
            $previousPhase = $plannedPhase
        }

        $processSamples.Add([pscustomobject][ordered]@{
            elapsedMs = $elapsedMs
            capturedAtUtc = [DateTime]::UtcNow.ToString('o')
            plannedPhase = $plannedPhase
            workingSetBytes = $javaProcess.WorkingSet64
            privateBytes = $javaProcess.PrivateMemorySize64
        })

        Start-Sleep -Milliseconds 1000
    }

    $measurementStatus = 'complete'
} catch {
    $measurementStatus = 'failed'
    $measurementError = $_.Exception.Message
    throw
} finally {
    $measurementClock.Stop()
    $javaProcess.Dispose()

    $report = [ordered]@{
        environment = [ordered]@{
            kind = 'windows-java-process'
            sourceCommit = $sourceCommit
            workingTreeStatus = $workingTreeStatus
            workspacePath = $workspaceRoot
            workspaceManifest = $workspaceManifest
            extensionHostProcessId = $ExtensionHostProcessId
            javaProcessId = $javaMetadata.ProcessId
            javaStartedAtUtc = $javaStartedAtUtc.ToString('o')
            javaExecutable = $javaMetadata.ExecutablePath
            javaCommandLine = $javaMetadata.CommandLine
        }
        sampling = [ordered]@{
            intervalMs = 1000
            plannedDurationMs = 270000
            startedAtUtc = $captureStartedAtUtc
            phasePlan = $phasePlan
            status = $measurementStatus
            error = $measurementError
        }
        measurements = $processSamples.ToArray()
    }

    [System.IO.File]::WriteAllText(
            $reportPath,
            ($report | ConvertTo-Json -Depth 8) + [Environment]::NewLine,
            [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host "Report saved: $reportPath"
}
