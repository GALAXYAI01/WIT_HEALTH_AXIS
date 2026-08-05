$ErrorActionPreference = "Continue"
$PYTHON = ".venv\Scripts\python.exe"
$LOG = "training_log_leukemia_resume.txt"
$ERRLOG = "training_log_leukemia_resume.err.txt"

Write-Host "=================================================="
Write-Host "Checking current state"
Write-Host "=================================================="

if (Test-Path model_weights\leukemia_best.pt) {
    $w = Get-Item model_weights\leukemia_best.pt
    Write-Host ("model_weights\leukemia_best.pt already exists - " + $w.Length + " bytes, saved " + $w.LastWriteTime)
    Write-Host "Leukemia training is already done. Nothing to do."
    exit 0
}

$existingProc = Get-Process python -ErrorAction SilentlyContinue
if ($existingProc) {
    Write-Host "A python.exe process is already running - waiting to see if it's the leukemia training finishing up."
    while ((Get-Process python -ErrorAction SilentlyContinue) -and -not (Test-Path model_weights\leukemia_best.pt)) {
        Start-Sleep -Seconds 60
        Write-Host ((Get-Date -Format "HH:mm:ss") + " - still running")
    }
    if (Test-Path model_weights\leukemia_best.pt) {
        Write-Host "Training finished successfully while waiting."
        exit 0
    }
    Write-Host "That process ended without producing weights. Restarting training now."
}

Write-Host ""
Write-Host "=================================================="
Write-Host "Starting leukemia training, detached (survives this window closing)"
Write-Host "=================================================="
$trainArgs = '-u scripts\train.py --module leukemia --data-dir "data\leukemia\Blood cell Cancer [ALL]" --batch-size 16'
$process = Start-Process -FilePath $PYTHON -ArgumentList $trainArgs -RedirectStandardOutput $LOG -RedirectStandardError $ERRLOG -PassThru
Write-Host ("Started detached process, PID " + $process.Id + ". Waiting for it to finish (checking every 60s)...")
while (-not $process.HasExited) {
    Start-Sleep -Seconds 60
    $lastLine = ""
    if (Test-Path $LOG) { $lastLine = Get-Content $LOG -Tail 1 }
    Write-Host ((Get-Date -Format "HH:mm:ss") + " - still training - last log line: " + $lastLine)
}
$exitCode = $process.ExitCode

Write-Host ""
Write-Host "=================================================="
Write-Host "Training process finished with exit code: $exitCode"
Write-Host "=================================================="
Write-Host "last 30 lines of the log:"
if (Test-Path $LOG) { Get-Content $LOG -Tail 30 }
Write-Host ""
Write-Host "last 30 lines of stderr:"
if (Test-Path $ERRLOG) { Get-Content $ERRLOG -Tail 30 }

Write-Host ""
if (Test-Path model_weights\leukemia_best.pt) {
    Write-Host "model_weights\leukemia_best.pt now exists. SUCCESS."
} else {
    Write-Host "Still no weights file. Something went wrong - check the stderr log above."
}
