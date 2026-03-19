Add-Type -AssemblyName System.IO.Compression.FileSystem

$currentPath = Get-Location
$zipFiles = Get-ChildItem -Path $currentPath -Filter *.zip

Write-Host "Starting zip processing..." -ForegroundColor Cyan
Write-Host "--------------------------------"

$processedCount = 0
$skippedCount = 0

foreach ($file in $zipFiles) {
    try {
        $zip = [System.IO.Compression.ZipFile]::OpenRead($file.FullName)
        
        $xmlEntry = $zip.Entries | Where-Object { $_.FullName -like "*.xml" } | Select-Object -First 1
        
        if ($xmlEntry) {
            $stream = $xmlEntry.Open()
            $reader = New-Object System.IO.StreamReader($stream)
            $xmlContent = $reader.ReadToEnd()
            $reader.Close()
            $stream.Close()
            
            $cadNumber = $null
            $dateFormation = $null
            
            if ($xmlContent -match "<cadastral_number[^>]*>(.*?)</cadastral_number>") {
                $cadNumber = $matches[1]
            } elseif ($xmlContent -match "<cad_number[^>]*>(.*?)</cad_number>") {
                $cadNumber = $matches[1]
            }
            
            if ($xmlContent -match "<date_formation[^>]*>(.*?)</date_formation>") {
                $dateFormation = $matches[1]
            }
            
            $zip.Dispose()
            
            if ($cadNumber -and $dateFormation) {
                $safeCadNumber = $cadNumber -replace ":", "_"
                $newName = "$safeCadNumber $dateFormation.zip"
                
                if ($file.Name -ne $newName) {
                    $newFullPath = Join-Path -Path $currentPath -ChildPath $newName
                    
                    if (-not (Test-Path $newFullPath)) {
                        Rename-Item -Path $file.FullName -NewName $newName
                        Write-Host "[OK] $($file.Name) -> $newName" -ForegroundColor Green
                        $processedCount++
                    } else {
                        Write-Host "[SKIP] File $newName already exists." -ForegroundColor Yellow
                        $skippedCount++
                    }
                } else {
                    Write-Host "[SKIP] $($file.Name) is already named correctly." -ForegroundColor DarkGray
                    $skippedCount++
                }
            } else {
                Write-Host "[ERROR] Cadastral number or date not found in $($file.Name)." -ForegroundColor Red
                $skippedCount++
            }
        } else {
            $zip.Dispose()
            Write-Host "[ERROR] No XML found inside $($file.Name)." -ForegroundColor Red
            $skippedCount++
        }
    } catch {
        if ($zip) { $zip.Dispose() }
        Write-Host "[ERROR] Failed to process $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
        $skippedCount++
    }
}

Write-Host "--------------------------------"
Write-Host "Processing finished!" -ForegroundColor Cyan
Write-Host "Successfully renamed: $processedCount" -ForegroundColor Green
Write-Host "Skipped or Errors: $skippedCount" -ForegroundColor Yellow