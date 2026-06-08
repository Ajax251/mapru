# Interactive File & PDF Thumbnail Finder (User Space / Non-Admin compatible)
# All comments are in English to prevent PowerShell parser encoding errors.

# Make the console treat output as UTF-8 (helps with Cyrillic when pasting)
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# Enable TLS 1.2 for secure downloads
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

# Helper function: write Registry keys in HKCU (Current User), no admin needed
function Register-PdfPreviewForCurrentUser {
    param([string]$DllPath)

    Write-Host "Регистрация эскизов для текущего пользователя (без прав администратора)..." -ForegroundColor Cyan
    try {
        $Clsid = "{3D3B1846-CC43-42AE-BFF9-D914083C2BA3}"

        # 1. Register CLSID
        $ClsidPath = "HKCU:\Software\Classes\CLSID\$Clsid"
        if (-not (Test-Path -LiteralPath $ClsidPath)) { New-Item -Path $ClsidPath -Force | Out-Null }
        Set-Item -LiteralPath $ClsidPath -Value "SumatraPDF Preview (*.pdf)" -Force
        Set-ItemProperty -LiteralPath $ClsidPath -Name "AppId" -Value "{6d2b5079-2f0b-48dd-ab7f-97cec514d30b}" -Force
        Set-ItemProperty -LiteralPath $ClsidPath -Name "DisplayName" -Value "SumatraPDF Preview (*.pdf)" -Force

        # 2. Register InprocServer32
        $InprocPath = "$ClsidPath\InProcServer32"
        if (-not (Test-Path -LiteralPath $InprocPath)) { New-Item -Path $InprocPath -Force | Out-Null }
        Set-Item -LiteralPath $InprocPath -Value $DllPath -Force
        Set-ItemProperty -LiteralPath $InprocPath -Name "ThreadingModel" -Value "Apartment" -Force

        # 3. Add to PreviewHandlers list
        $HandlersPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\PreviewHandlers"
        if (-not (Test-Path -LiteralPath $HandlersPath)) { New-Item -Path $HandlersPath -Force | Out-Null }
        Set-ItemProperty -LiteralPath $HandlersPath -Name $Clsid -Value "SumatraPDF Preview (*.pdf)" -Force

        # 4. Associate .pdf with preview handler
        $PdfShellex = "HKCU:\Software\Classes\.pdf\shellex\{8895b1c6-b41f-4c1c-a562-0d564250836f}"
        if (-not (Test-Path -LiteralPath $PdfShellex)) { New-Item -Path $PdfShellex -Force | Out-Null }
        Set-Item -LiteralPath $PdfShellex -Value $Clsid -Force

        # 5. Associate .pdf with thumbnail provider (same CLSID)
        $PdfThumb = "HKCU:\Software\Classes\.pdf\shellex\{BB2E617C-0920-11d1-9A0B-00C04FC2D6C1}"
        if (-not (Test-Path -LiteralPath $PdfThumb)) { New-Item -Path $PdfThumb -Force | Out-Null }
        Set-Item -LiteralPath $PdfThumb -Value $Clsid -Force

        $PdfThumb2 = "HKCU:\Software\Classes\.pdf\shellex\{E357FCCD-A995-4576-B01F-234630154E96}"
        if (-not (Test-Path -LiteralPath $PdfThumb2)) { New-Item -Path $PdfThumb2 -Force | Out-Null }
        Set-Item -LiteralPath $PdfThumb2 -Value $Clsid -Force

        Write-Host "Регистрация в реестре успешно выполнена!" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "Ошибка записи в реестр: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# --- 1. Check if PDF thumbnail association exists in HKLM or HKCU ---
$ThumbPaths = @(
    "HKLM:\SOFTWARE\Classes\.pdf\ShellEx\{E357FCCD-A995-4576-B01F-234630154E96}",
    "HKCU:\Software\Classes\.pdf\ShellEx\{E357FCCD-A995-4576-B01F-234630154E96}",
    "HKLM:\SOFTWARE\Classes\SumatraPDF.pdf\ShellEx\{E357FCCD-A995-4576-B01F-234630154E96}",
    "HKCU:\Software\Classes\SumatraPDF.pdf\ShellEx\{E357FCCD-A995-4576-B01F-234630154E96}",
    "HKCU:\Software\Classes\.pdf\shellex\{BB2E617C-0920-11d1-9A0B-00C04FC2D6C1}"
)

$HasPDFThumbnail = $false
foreach ($p in $ThumbPaths) {
    if (Test-Path -LiteralPath $p) { $HasPDFThumbnail = $true; break }
}

$NeedExplorerRestart = $false

# Search for installed SumatraPDF on the system
$SumatraPaths = @(
    "C:\Program Files\SumatraPDF",
    "C:\Program Files (x86)\SumatraPDF",
    "$env:LocalAppData\SumatraPDF",
    "$env:ProgramFiles\SumatraPDF"
)

function Find-SumatraDll {
    param([string[]]$Folders)
    foreach ($folder in $Folders) {
        $test = Join-Path $folder "PdfPreview.dll"
        if (Test-Path -LiteralPath $test) { return $test }
    }
    return $null
}

$DllPath = Find-SumatraDll -Folders $SumatraPaths

if (-not $HasPDFThumbnail) {
    Write-Host "Внимание: В системе не настроены эскизы для PDF." -ForegroundColor Yellow

    if ($DllPath) {
        Write-Host "Обнаружена установленная SumatraPDF ($DllPath), но эскизы не активированы." -ForegroundColor Cyan
        $Response = Read-Host "Зарегистрировать эскизы для текущего пользователя? (Y/N, по умолчанию Y)"
        if ($Response -ne 'N' -and $Response -ne 'n') {
            if (Register-PdfPreviewForCurrentUser -DllPath $DllPath) {
                $NeedExplorerRestart = $true
                $HasPDFThumbnail = $true
            }
        }
    }
}

# If thumbnails still not configured and Sumatra not installed, offer to install (User Space)
if (-not $HasPDFThumbnail) {
    $Response = Read-Host "Установить SumatraPDF в профиль пользователя для PDF-эскизов? (Y/N)"
    if ($Response -eq 'Y' -or $Response -eq 'y') {
        $Installed = $false

        # Try winget first (user scope)
        Write-Host "Попытка установки через winget..." -ForegroundColor Cyan
        try {
            if (Get-Command winget -ErrorAction SilentlyContinue) {
                $wingetArgs = @(
                    "install","SumatraPDF.SumatraPDF",
                    "--silent","--accept-source-agreements","--accept-package-agreements"
                )
                $Process = Start-Process winget -ArgumentList $wingetArgs -NoNewWindow -PassThru -Wait
                if ($Process.ExitCode -eq 0) { $Installed = $true }
            }
        } catch {}

        # Fallback: download official installer into User Space (%LocalAppData%)
        if (-not $Installed) {
            Write-Host "Запуск резервной установки..." -ForegroundColor Cyan
            try {
                $Url = "https://www.sumatrapdfreader.org/dl/rel/3.6.1/SumatraPDF-3.6.1-64-install.exe"
                $TempExe = Join-Path $env:TEMP "SumatraPDF-3.6.1-64-install.exe"

                Write-Host "Скачивание SumatraPDF с официального сайта..." -ForegroundColor Cyan
                Invoke-WebRequest -Uri $Url -OutFile $TempExe -UseBasicParsing

                if (Test-Path -LiteralPath $TempExe) {
                    Write-Host "Установка SumatraPDF в профиль пользователя..." -ForegroundColor Cyan
                    # Running without admin installs to LocalAppData automatically
                    $Process = Start-Process -FilePath $TempExe -ArgumentList "-install -s -with-preview -with-filter" -NoNewWindow -PassThru -Wait
                    if ($Process.ExitCode -eq 0 -or $Process.ExitCode -eq 3010) { $Installed = $true }
                    Remove-Item $TempExe -Force -ErrorAction SilentlyContinue
                }
            } catch {
                Write-Host "Не удалось выполнить установку: $($_.Exception.Message)" -ForegroundColor Red
            }
        }

        if ($Installed) {
            $DllPath = Find-SumatraDll -Folders $SumatraPaths
            if ($DllPath) { Register-PdfPreviewForCurrentUser -DllPath $DllPath | Out-Null }
            Write-Host "Установка успешно завершена!" -ForegroundColor Green
            $NeedExplorerRestart = $true
        } else {
            Write-Host "Не удалось установить SumatraPDF автоматически." -ForegroundColor Red
        }
    }
} else {
    Write-Host "Эскизы PDF настроены в вашей системе." -ForegroundColor Green
}

# --- 2. Folder Selection ---
Write-Host "`nОткрытие диалога выбора папки..." -ForegroundColor Cyan
$Shell  = New-Object -ComObject Shell.Application
$Folder = $Shell.BrowseForFolder(0, "Выберите папку для просмотра эскизов:", 0, 17)

if (-not $Folder) {
    Write-Host "Выбор каталога отменен." -ForegroundColor Red
    return
}

$SelectedFolder = $Folder.Self.Path
Write-Host "Выбран каталог: $SelectedFolder" -ForegroundColor Green

# --- 3. Recursion ---
$RecurseInput = Read-Host "Искать также во вложенных папках? (Y/N, по умолчанию Y)"
$Recurse = $true
if ($RecurseInput -eq 'N' -or $RecurseInput -eq 'n') {
    $Recurse = $false
    Write-Host "Поиск ограничен только выбранной папкой." -ForegroundColor Yellow
} else {
    Write-Host "Поиск включает все подкаталоги." -ForegroundColor Green
}

# --- 4. File Size Filter ---
$MinSizeKB = Read-Host "Минимальный размер файла в КБ (по умолчанию 100)"
if ([string]::IsNullOrWhiteSpace($MinSizeKB)) { $MinSizeKB = "100" }
$MinSizeBytes = [int64]$MinSizeKB * 1024

# --- 5. File Extensions Choice ---
Write-Host "`nВыберите типы файлов для поиска:" -ForegroundColor Cyan
Write-Host "1 - Только PDF (*.pdf)"
Write-Host "2 - Картинки + PDF (по умолчанию)"
Write-Host "3 - Только картинки (JPG, PNG, GIF, BMP)"
Write-Host "4 - Свой тип файлов (например: docx, xlsx)"
$Choice = Read-Host "Введите номер варианта (1-4)"

# Helper: normalize an extension token to "*.ext" form
function Normalize-Ext {
    param([string]$Token)
    $e = $Token.Trim().ToLower()
    if ([string]::IsNullOrWhiteSpace($e)) { return $null }
    $e = $e.TrimStart('*')
    if (-not $e.StartsWith('.')) { $e = ".$e" }
    return "*$e"
}

if ($Choice -eq "1") {
    $ExtensionsToFind = @("*.pdf")
} elseif ($Choice -eq "3") {
    $ExtensionsToFind = @("*.jpg","*.jpeg","*.png","*.gif","*.bmp")
} elseif ($Choice -eq "4") {
    $CustomInput = Read-Host "Введите расширения через пробел или запятую (например: docx, xlsx)"
    if ([string]::IsNullOrWhiteSpace($CustomInput)) {
        $ExtensionsToFind = @("*.pdf","*.jpg","*.jpeg","*.png","*.gif","*.bmp")
    } else {
        $ExtensionsToFind = $CustomInput -split '[\s,;]+' | ForEach-Object { Normalize-Ext $_ } | Where-Object { $_ }
    }
} else {
    $ExtensionsToFind = @("*.pdf","*.jpg","*.jpeg","*.png","*.gif","*.bmp")
}

# Build Windows Search filter string, e.g. (*.pdf OR *.jpg)
$FileFilter = "(" + (($ExtensionsToFind) -join " OR ") + ")"

# --- 6. Output Type Choice ---
Write-Host "`nВыберите способ вывода результатов:" -ForegroundColor Cyan
Write-Host "1 - Открыть в Проводнике Windows (по умолчанию)"
Write-Host "2 - Открыть как HTML-галерею в браузере"
$OutputChoice = Read-Host "Введите номер варианта (1-2)"

# --- 7. Restart Explorer (user-level only) ---
if ($NeedExplorerRestart) {
    Write-Host "`nПерезапуск Проводника для применения изменений..." -ForegroundColor Yellow
    Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# --- 8. Execution ---
if ($OutputChoice -eq "2") {
    Write-Host "Сканирование папки..." -ForegroundColor Cyan
    $Files = Get-ChildItem -LiteralPath $SelectedFolder -File -Recurse:$Recurse -ErrorAction SilentlyContinue | Where-Object {
        $f = $_
        if ($f.Length -lt $MinSizeBytes) { return $false }
        foreach ($ext in $ExtensionsToFind) {
            if ($f.Name -like $ext) { return $true }
        }
        return $false
    }

    if (-not $Files -or $Files.Count -eq 0) {
        Write-Host "Файлы, соответствующие критериям, не найдены." -ForegroundColor Red
        return
    }

    Write-Host "Генерация HTML-страницы..." -ForegroundColor Cyan
    $CardsHtml = ""
    foreach ($file in $Files) {
        $Uri = New-Object System.Uri($file.FullName)
        $EscapedPath = $Uri.AbsoluteUri

        if ($file.Extension.ToLower() -eq ".pdf") {
            $ThumbHtml = "<iframe src=""$EscapedPath#toolbar=0&navpanes=0&scrollbar=0"" class=""thumb-pdf"" loading=""lazy""></iframe>"
        } else {
            $ThumbHtml = "<img src=""$EscapedPath"" class=""thumb-img"" loading=""lazy"">"
        }

        $SizeKb   = [Math]::Round($file.Length / 1KB, 1)
        $FileName = $file.Name

        $CardsHtml += @"
<div class="card" onclick="window.open('$EscapedPath')">
  <div class="thumb-container">$ThumbHtml</div>
  <div class="info">
    <div class="title" title="$FileName">$FileName</div>
    <div class="size">$SizeKb КБ</div>
  </div>
</div>
"@
    }

    $FileCount = $Files.Count
    $HtmlContent = @"
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Галерея файлов - $SelectedFolder</title>
<style>
body { background:#121212; color:#e0e0e0; font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; margin:0; padding:20px; }
h1 { font-size:22px; margin:0 0 5px 0; color:#fff; }
.subtitle { color:#888; margin-bottom:25px; font-size:14px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:20px; }
.card { background:#1e1e1e; border:1px solid #2d2d2d; border-radius:8px; overflow:hidden; display:flex; flex-direction:column; cursor:pointer; transition:transform .2s,border-color .2s; }
.card:hover { transform:translateY(-4px); border-color:#00bcd4; }
.thumb-container { width:100%; height:150px; background:#0d0d0d; display:flex; align-items:center; justify-content:center; overflow:hidden; position:relative; }
.thumb-img { width:100%; height:100%; object-fit:cover; }
.thumb-pdf { width:100%; height:100%; border:none; pointer-events:none; }
.info { padding:10px; }
.title { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:4px; color:#fff; }
.size { font-size:11px; color:#888; }
</style>
</head>
<body>
<h1>Галерея эскизов</h1>
<div class="subtitle">Папка: $SelectedFolder | Найдено элементов: $FileCount</div>
<div class="grid">
$CardsHtml
</div>
</body>
</html>
"@

    $TempFile = Join-Path $env:TEMP ("gallery_" + (Get-Date).Ticks + ".html")
    [System.IO.File]::WriteAllText($TempFile, $HtmlContent, [System.Text.Encoding]::UTF8)

    Write-Host "Запуск браузера с галереей..." -ForegroundColor Green
    Start-Process $TempFile
} else {
    $Query          = "System.Size:>=$MinSizeBytes $FileFilter"
    $EncodedQuery   = [uri]::EscapeDataString($Query)
    $EncodedLocation= [uri]::EscapeDataString($SelectedFolder)

    $Scope = "location"
    if (-not $Recurse) { $Scope = "folder" }

    $SearchURI = "search-ms:query=$EncodedQuery&crumb=$Scope`:$EncodedLocation"

    Write-Host "Открытие Проводника с результатами..." -ForegroundColor Green
    Start-Process $SearchURI
}