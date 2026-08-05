$ErrorActionPreference = "Continue"
$LOG = "training_log_leukemia_20260720_062242.txt"
$ERRLOG = "training_log_leukemia_20260720_062242.err.txt"

Write-Host "=================================================="
Write-Host "Checking current state (read-only - this takes no action on its own)"
Write-Host "=================================================="

$proc = Get-Process python -ErrorAction SilentlyContinue
$weightsExist = Test-Path model_weights\leukemia_best.pt

if ($proc) {
    $ids = ($proc | ForEach-Object { $_.Id }) -join ", "
    Write-Host ("A python.exe process IS currently running (PID(s): " + $ids + ").")
} else {
    Write-Host "NO python.exe process is currently running."
}

if ($weightsExist) {
    $w = Get-Item model_weights\leukemia_best.pt
    Write-Host ("model_weights\leukemia_best.pt EXISTS - " + $w.Length + " bytes, saved " + $w.LastWriteTime)
} else {
    Write-Host "model_weights\leukemia_best.pt does NOT exist yet."
}

Write-Host ""
Write-Host "=== last 20 lines of the training log ==="
if (Test-Path $LOG) { Get-Content $LOG -Tail 20 } else { Write-Host ("log file not found: " + $LOG) }

Write-Host ""
Write-Host "=== last 20 lines of the stderr log ==="
if (Test-Path $ERRLOG) { Get-Content $ERRLOG -Tail 20 } else { Write-Host ("stderr log not found: " + $ERRLOG) }

Write-Host ""
if ($proc -and -not $weightsExist) {
    Write-Host "=================================================="
    Write-Host "Training is still in progress. Waiting for it to finish or stop."
    Write-Host "Checking every 60 seconds. This blocks the terminal but does not use AI tokens while it waits."
    Write-Host "=================================================="
    while ((Get-Process python -ErrorAction SilentlyContinue) -and -not (Test-Path model_weights\leukemia_best.pt)) {
        Start-Sleep -Seconds 60
        $lastLine = ""
        if (Test-Path $LOG) { $lastLine = Get-Content $LOG -Tail 1 }
        Write-Host ((Get-Date -Format "HH:mm:ss") + " - still running - last log line: " + $lastLine)
    }
    Write-Host ""
    Write-Host "=================================================="
    Write-Host "Wait loop ended. Final state:"
    Write-Host "=================================================="
    Write-Host "last 30 lines of training log:"
    if (Test-Path $LOG) { Get-Content $LOG -Tail 30 }
    Write-Host ""
    Write-Host "last 30 lines of stderr log:"
    if (Test-Path $ERRLOG) { Get-Content $ERRLOG -Tail 30 }
    Write-Host ""
    if (Test-Path model_weights\leukemia_best.pt) {
        Write-Host "model_weights\leukemia_best.pt now exists. Training finished successfully."
    } else {
        Write-Host "The process ended WITHOUT producing weights - it most likely crashed. Check the stderr log above for the actual error."
    }
} elseif ($weightsExist) {
    Write-Host "Weights already exist - training already finished. Nothing to wait for."
} else {
    Write-Host "No python process is running and no weights file exists - training is not currently active and did not finish. It was likely interrupted before completion."
}
