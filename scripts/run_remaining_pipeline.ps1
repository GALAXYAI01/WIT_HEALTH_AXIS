$ErrorActionPreference = "Continue"
$PYTHON = ".venv\Scripts\python.exe"

Write-Host "=================================================="
Write-Host "STEP 1: Verifying the leukemia model"
Write-Host "=================================================="
try {
    & $PYTHON -u scripts\verify_weights.py --module leukemia --data-dir "data\leukemia\Blood cell Cancer [ALL]" --n-per-class 20
} catch {
    Write-Host "STOPPING HERE. Could not even start the verification command: $($_.Exception.Message)"
    exit 1
}
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "=================================================="
    Write-Host "STOPPING HERE. Leukemia verification did not pass (see RED FLAG output above)."
    Write-Host "Do not proceed to histopathology until this is investigated and fixed."
    Write-Host "=================================================="
    exit 1
}
Write-Host ""
Write-Host "Leukemia verified. Proceeding to histopathology."
Write-Host ""

Write-Host "=================================================="
Write-Host "STEP 2: Downloading the histopathology dataset"
Write-Host "=================================================="
try {
    & .venv\Scripts\kaggle.exe competitions download -c histopathologic-cancer-detection -p data\histopathology
} catch {
    Write-Host ""
    Write-Host "=================================================="
    Write-Host "STOPPING HERE. Could not run the kaggle command: $($_.Exception.Message)"
    Write-Host "Check that the kaggle CLI is installed in this venv (pip install kaggle)."
    Write-Host "=================================================="
    exit 1
}
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "=================================================="
    Write-Host "STOPPING HERE. Download failed."
    Write-Host "Most likely cause: you haven't joined this competition on kaggle.com yet."
    Write-Host "Go to https://www.kaggle.com/c/histopathologic-cancer-detection , click"
    Write-Host "'Join Competition' / accept the rules while logged in, then re-run this script."
    Write-Host "=================================================="
    exit 1
}

Write-Host ""
Write-Host "=================================================="
Write-Host "STEP 3: Extracting the dataset"
Write-Host "=================================================="
Expand-Archive -Path "data\histopathology\histopathologic-cancer-detection.zip" -DestinationPath "data\histopathology" -Force
Write-Host "Extracted top-level contents:"
Get-ChildItem -Path "data\histopathology" | ForEach-Object { Write-Host ("  " + $_.Name + "  (" + $_.Length + " bytes, modified " + $_.LastWriteTime + ")") }

Write-Host ""
Write-Host "=================================================="
Write-Host "STEP 4: Training the histopathology model"
Write-Host "(this dataset has far more images than malaria or leukemia - expect this to take a while)"
Write-Host "Running this DETACHED from this window: if this terminal or session closes, training keeps going."
Write-Host "=================================================="
try {
    $trainCmd = "$PYTHON -u scripts\train.py --module histopathology --data-dir data\histopathology\train --csv-path data\histopathology\train_labels.csv --batch-size 64 > training_log_histopathology.txt 2> training_log_histopathology.err.txt"
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "cmd.exe"
    $psi.Arguments = "/c $trainCmd"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $trainProcess = New-Object System.Diagnostics.Process
    $trainProcess.StartInfo = $psi
    $trainProcess.Start() | Out-Null
    Write-Host ("Started detached training process, PID " + $trainProcess.Id + ". Waiting for it to finish (checking every 60s)...")
    while (-not $trainProcess.HasExited) {
        Start-Sleep -Seconds 60
        $lastLine = ""
        if (Test-Path "training_log_histopathology.txt") { $lastLine = Get-Content "training_log_histopathology.txt" -Tail 1 }
        Write-Host ((Get-Date -Format "HH:mm:ss") + " - still training - last log line: " + $lastLine)
    }
    $trainProcess.WaitForExit()
    $trainExitCode = $trainProcess.ExitCode
} catch {
    Write-Host "STOPPING HERE. Could not even start the training command: $($_.Exception.Message)"
    exit 1
}
if ($trainExitCode -ne 0) {
    Write-Host ""
    Write-Host "=================================================="
    Write-Host "STOPPING HERE. Training failed or crashed (exit code $trainExitCode)."
    Write-Host "Full output is saved in training_log_histopathology.txt and training_log_histopathology.err.txt"
    Write-Host "If it's a CUDA out-of-memory error, re-run just this training command manually with"
    Write-Host "--batch-size 32, then --batch-size 16 if it happens again."
    Write-Host "=================================================="
    exit 1
}

Write-Host ""
Write-Host "=================================================="
Write-Host "STEP 5: Verifying the histopathology model"
Write-Host "=================================================="
& $PYTHON -u scripts\verify_weights.py --module histopathology --data-dir "data\histopathology\train" --csv-path "data\histopathology\train_labels.csv" --n-per-class 20

Write-Host ""
Write-Host "=================================================="
Write-Host "PIPELINE FINISHED. Paste everything this printed, from Step 1 onward, back to Claude."
Write-Host "=================================================="
