Add-Type -AssemblyName System.IO.Compression.FileSystem

# --- Блок выбора каталога пользователем ---
Write-Host "Открытие диалога выбора папки..." -ForegroundColor Cyan
$Shell = New-Object -ComObject Shell.Application
# Запрашиваем папку у пользователя (17 — открывать "Этот компьютер" как корневой элемент)
$Folder = $Shell.BrowseForFolder(0, "Выберите папку для обработки ZIP и XML файлов:", 0, 17)

if (-not $Folder) {
    Write-Host "Выбор каталога отменен. Завершение работы." -ForegroundColor Red
    Exit
}

# Присваиваем выбранный путь переменной $currentPath, чтобы сохранить совместимость со старым кодом
$currentPath = $Folder.Self.Path
Write-Host "Выбран каталог для обработки: $currentPath" -ForegroundColor Green
# ----------------------------------------

$zipFiles = Get-ChildItem -Path $currentPath -Filter *.zip
$xmlFiles = Get-ChildItem -Path $currentPath -Filter *.xml

Write-Host "`nStarting processing..." -ForegroundColor Cyan
Write-Host "--------------------------------"

$processedCount = 0
$skippedCount = 0

# --- Функция извлечения кадастрового номера и даты из XML-контента ---
function Get-CadInfoFromXml {
    param([string]$xmlContent)

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

    return @{ CadNumber = $cadNumber; DateFormation = $dateFormation }
}

# --- Функция переименования файла ---
function Rename-FileByInfo {
    param(
        [System.IO.FileInfo]$File,
        [string]$CadNumber,
        [string]$DateFormation
    )

    $safeCadNumber = $CadNumber -replace ":", "_"
    $extension = $File.Extension
    $newName = "$safeCadNumber $DateFormation$extension"

    if ($File.Name -eq $newName) {
        Write-Host "[SKIP] $($File.Name) is already named correctly." -ForegroundColor DarkGray
        return "skipped"
    }

    $newFullPath = Join-Path -Path $currentPath -ChildPath $newName

    if (Test-Path $newFullPath) {
        Write-Host "[SKIP] File $newName already exists." -ForegroundColor Yellow
        return "skipped"
    }

    Rename-Item -LiteralPath $File.FullName -NewName $newName
    Write-Host "[OK] $($File.Name) -> $newName" -ForegroundColor Green
    return "processed"
}

# --- Обработка ZIP файлов ---
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
            $zip.Dispose()

            $info = Get-CadInfoFromXml -xmlContent $xmlContent

            if ($info.CadNumber -and $info.DateFormation) {
                $result = Rename-FileByInfo -File $file -CadNumber $info.CadNumber -DateFormation $info.DateFormation
                if ($result -eq "processed") { $processedCount++ } else { $skippedCount++ }
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

# --- Обработка XML файлов, лежащих в папке ---
foreach ($file in $xmlFiles) {
    try {
        $xmlContent = [System.IO.File]::ReadAllText($file.FullName)

        $info = Get-CadInfoFromXml -xmlContent $xmlContent

        if ($info.CadNumber -and $info.DateFormation) {
            $result = Rename-FileByInfo -File $file -CadNumber $info.CadNumber -DateFormation $info.DateFormation
            if ($result -eq "processed") { $processedCount++ } else { $skippedCount++ }
        } else {
            Write-Host "[ERROR] Cadastral number or date not found in $($file.Name)." -ForegroundColor Red
            $skippedCount++
        }
    } catch {
        Write-Host "[ERROR] Failed to process $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
        $skippedCount++
    }
}

Write-Host "--------------------------------"
Write-Host "Processing finished!" -ForegroundColor Cyan
Write-Host "Successfully renamed: $processedCount" -ForegroundColor Green
Write-Host "Skipped or Errors: $skippedCount" -ForegroundColor Yellow