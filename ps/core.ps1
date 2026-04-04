# Проверка прав Администратора
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "==================================================================" -ForegroundColor Red
    Write-Host " ВНИМАНИЕ! Скрипт запущен без прав Администратора!" -ForegroundColor Yellow
    Write-Host " Пожалуйста, закройте окно, нажмите правой кнопкой мыши на Пуск,"
    Write-Host " выберите 'Windows PowerShell (Администратор)' и повторите команду."
    Write-Host "==================================================================" -ForegroundColor Red
    exit
}

# Настройки по умолчанию
$global:InstallMethod = "Winget" # Может быть "Winget" или "Classic"

# База программ (содержит данные и для Winget, и для классической установки)
$global:programs = @(
    [PSCustomObject]@{ ID=1; Name="7-Zip"; WingetID="7zip.7zip"; ClassicURL="https://www.7-zip.org/a/7z2407-x64.exe"; InstallArgs="/S"; Selected=$false }
    [PSCustomObject]@{ ID=2; Name="WinRAR"; WingetID="RARLab.WinRAR"; ClassicURL="https://www.win-rar.com/fileadmin/winrar-versions/winrar/winrar-x64-701ru.exe"; InstallArgs="/S"; Selected=$false }
    [PSCustomObject]@{ ID=3; Name="Notepad++"; WingetID="Notepad++.Notepad++"; ClassicURL="https://github.com/notepad-plus-plus/notepad-plus-plus/releases/download/v8.6.8/npp.8.6.8.Installer.x64.exe"; InstallArgs="/S"; Selected=$false }
    [PSCustomObject]@{ ID=4; Name="Total Commander"; WingetID="Ghisler.TotalCommander"; ClassicURL="https://mapruapp.ru/files/app/tcmd1155x64.exe"; InstallArgs="/AHMGDU"; Selected=$false }
    [PSCustomObject]@{ ID=5; Name="IrfanView"; WingetID="IrfanSkiljan.IrfanView"; ClassicURL="https://mapruapp.ru/files/app/iview472_x64_setup.exe"; InstallArgs="/silent /allusers=1"; Selected=$false }
    [PSCustomObject]@{ ID=6; Name="Adobe Reader DC"; WingetID="Adobe.Acrobat.Reader.DC"; ClassicURL="https://ardownload2.adobe.com/pub/adobe/acrobat/win/AcrobatDC/2400220857/AcroRdrDCx642400220857_MUI.exe"; InstallArgs="/sAll"; Selected=$false }
    [PSCustomObject]@{ ID=7; Name="PDF24 Creator"; WingetID="geeksoftwareGmbH.PDF24Creator"; ClassicURL="https://download.pdf24.org/pdf24-creator-latest-x64.exe"; InstallArgs="/VERYSILENT"; Selected=$false }
    [PSCustomObject]@{ ID=8; Name="PDFtk Free"; WingetID=$null; ClassicURL="https://www.pdflabs.com/tools/pdftk-the-pdf-toolkit/pdftk_free-2.02-win-setup.exe"; InstallArgs="/verysilent /suppressmsgboxes"; Selected=$false }
    [PSCustomObject]@{ ID=9; Name="Open-Shell (Пуск)"; WingetID="Open-Shell.Open-Shell-Menu"; ClassicURL="https://github.com/Open-Shell/Open-Shell-Menu/releases/download/v4.4.196/OpenShellSetup_4_4_196.exe"; InstallArgs="/q"; Selected=$false }
    [PSCustomObject]@{ ID=10; Name="PotPlayer"; WingetID="Daum.PotPlayer"; ClassicURL="https://t1.daumcdn.net/potplayer/PotPlayer/Version/Latest/PotPlayerSetup64.exe"; InstallArgs="/S"; Selected=$false }
    [PSCustomObject]@{ ID=11; Name="AnyDesk"; WingetID="AnyDesk.AnyDesk"; ClassicURL="https://download.anydesk.com/AnyDesk.exe"; InstallArgs="--install `"C:\Program Files (x86)\AnyDesk`" --start-with-win --silent"; Selected=$false }
    [PSCustomObject]@{ ID=12; Name="Яндекс Браузер"; WingetID="Yandex.Browser"; ClassicURL="https://browser.yandex.ru/download?os=win&bitness=64&statpromo=true"; InstallArgs="/S"; Selected=$false }
    [PSCustomObject]@{ ID=13; Name="LibreOffice"; WingetID="TheDocumentFoundation.LibreOffice"; ClassicURL="https://download.documentfoundation.org/libreoffice/stable/24.2.5/win/x86_64/LibreOffice_24.2.5_Win_x86-64.msi"; InstallArgs="/qn"; IsMSI=$true; Selected=$false }
    [PSCustomObject]@{ ID=14; Name=".NET Framework 3.5"; WingetID=$null; ClassicURL="CustomScript"; Selected=$false }
)

# Функция установки Winget
function Install-Winget {
    Clear-Host
    Write-Host "=== Установка / Обновление Winget ===" -ForegroundColor Cyan
    try {
        $releasesUrl = "https://api.github.com/repos/microsoft/winget-cli/releases/latest"
        Write-Host "Получение информации о последней версии с GitHub..."
        $latest = Invoke-RestMethod -Uri $releasesUrl
        $asset = $latest.assets | Where-Object { $_.name -like '*.msixbundle' } | Select-Object -First 1
        
        if (!$asset) { throw "Не удалось найти .msixbundle файл в релизе." }
        
        $dest = Join-Path $env:TEMP $asset.name
        Write-Host "Скачивание Winget ($($asset.name))..."
        Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $dest -UseBasicParsing
        
        Write-Host "Установка пакета..."
        Add-AppxPackage -Path $dest
        Write-Host "Winget успешно установлен/обновлен!" -ForegroundColor Green
    } catch {
        Write-Host "Ошибка при установке Winget: $_" -ForegroundColor Red
    }
    Write-Host "Нажмите любую клавишу для возврата в меню..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Отрисовка меню
function Show-Menu {
    Clear-Host
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "      УСТАНОВЩИК ПРОГРАММ" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Cyan
    
    # Статус Winget
    $wgStatus = if (Get-Command winget -ErrorAction SilentlyContinue) { "[УСТАНОВЛЕН]" } else { "[ОТСУТСТВУЕТ]" }
    $wgColor = if ($wgStatus -eq "[УСТАНОВЛЕН]") { "Green" } else { "Red" }
    
    Write-Host "Текущий метод установки: " -NoNewline
    if ($global:InstallMethod -eq "Winget") { Write-Host "Winget " -ForegroundColor Yellow -NoNewline }
    else { Write-Host "Классический (Прямые ссылки) " -ForegroundColor Yellow -NoNewline }
    Write-Host "(Нажмите 'M' для смены)" -ForegroundColor DarkGray
    
    Write-Host "Статус Winget в системе: " -NoNewline
    Write-Host $wgStatus -ForegroundColor $wgColor
    Write-Host "--------------------------------------------------" -ForegroundColor Cyan

    # Вывод списка
    foreach ($p in $global:programs) {
        $box = if ($p.Selected) { "[X]" } else { "[ ]" }
        $color = if ($p.Selected) { "Green" } else { "Gray" }
        
        # Предупреждение, если выбран Winget, но программы там нет
        $note = ""
        if ($global:InstallMethod -eq "Winget" -and $null -eq $p.WingetID) {
            $note = " (Пойдет по классике)"
        }

        # Форматирование (чтобы цифры шли ровно)
        $idStr = $p.ID.ToString().PadRight(2)
        Write-Host "$box ${idStr}. $($p.Name)$note" -ForegroundColor $color
    }
    
    Write-Host "--------------------------------------------------" -ForegroundColor Cyan
    Write-Host " Номера  - Выбрать программы (например: 1,3,5)"
    Write-Host " A       - Выбрать всё     | C - Сбросить выбор"
    Write-Host " M       - Сменить метод   | W - Установить Winget"
    Write-Host " I       - УСТАНОВИТЬ      | Q - Выход"
    Write-Host "==================================================" -ForegroundColor Cyan
}

# Основной цикл интерфейса
$running = $true
while ($running) {
    Show-Menu
    $inputStr = Read-Host "Ваш выбор"
    
    switch -Regex ($inputStr.Trim().ToUpper()) {
        "^Q$" { $running = $false; exit }
        "^A$" { foreach ($p in $global:programs) { $p.Selected = $true } }
        "^C$" { foreach ($p in $global:programs) { $p.Selected = $false } }
        "^M$" { $global:InstallMethod = if ($global:InstallMethod -eq "Winget") { "Classic" } else { "Winget" } }
        "^W$" { Install-Winget }
        "^I$" { $running = $false; break }
        "^[0-9, ]+$" {
            $numbers = $inputStr -split ',' | ForEach-Object { $_.Trim() }
            foreach ($num in $numbers) {
                $target = $global:programs | Where-Object { $_.ID -eq [int]$num }
                if ($target) { $target.Selected = -not $target.Selected }
            }
        }
    }
}

# ==========================================
# ПРОЦЕСС УСТАНОВКИ
# ==========================================
$selectedPrograms = $global:programs | Where-Object { $_.Selected }

if ($selectedPrograms.Count -eq 0) {
    Write-Host "Ничего не выбрано. Выход." -ForegroundColor Yellow
    exit
}

Clear-Host
Write-Host "Начинаем установку..." -ForegroundColor Cyan

foreach ($prog in $selectedPrograms) {
    Write-Host "`n---> Установка: $($prog.Name) <---" -ForegroundColor Yellow
    
    # Исключение: .NET 3.5 устанавливается только спец. скриптом
    if ($prog.ID -eq 14) {
        Write-Host "Используется системный установщик для .NET Framework 3.5..."
        $sxsPath = Join-Path $env:TEMP "sxs_net35"
        New-Item -ItemType Directory -Path $sxsPath -Force | Out-Null
        $baseUrl = "https://mapruapp.ru/files/app/sxs/"
        $files = @("microsoft-windows-internetexplorer-optional-package~31bf3856ad364e35~amd64~~.cab", "Microsoft-Windows-InternetExplorer-Optional-Package~31bf3856ad364e35~amd64~ru-RU~.cab", "microsoft-windows-netfx3-ondemand-package~31bf3856ad364e35~amd64~~.cab")
        foreach ($f in $files) {
            Invoke-WebRequest -Uri "$baseUrl$f" -OutFile (Join-Path $sxsPath $f)
        }
        Enable-WindowsOptionalFeature -Online -FeatureName NetFx3 -All -Source $sxsPath -LimitAccess
        Remove-Item -Path $sxsPath -Recurse -Force
        continue
    }

    # Логика выбора метода
    $methodToUse = $global:InstallMethod
    if ($global:InstallMethod -eq "Winget" -and $null -eq $prog.WingetID) {
        Write-Host "Программа недоступна в Winget, переключаемся на классический метод..." -ForegroundColor DarkGray
        $methodToUse = "Classic"
    }

    if ($methodToUse -eq "Winget") {
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            winget install -e --id $prog.WingetID --accept-package-agreements --accept-source-agreements
        } else {
            Write-Host "Winget не найден! Пропуск программы. Используйте меню для установки Winget." -ForegroundColor Red
        }
    }
    else {
        # Классический метод скачивания
        try {
            $ext = if ($prog.IsMSI) { ".msi" } else { ".exe" }
            $file = Join-Path $env:TEMP ("install_" + $prog.ID + $ext)
            
            Write-Host "Скачивание файла..."
            Invoke-WebRequest -Uri $prog.ClassicURL -OutFile $file
            
            Write-Host "Запуск тихой установки..."
            if ($prog.IsMSI) {
                $args = "/i `"$file`" $($prog.InstallArgs)"
                Start-Process msiexec.exe -ArgumentList $args -Wait -NoNewWindow
            } else {
                Start-Process -FilePath $file -ArgumentList $prog.InstallArgs -Wait -NoNewWindow
            }
            
            # Для PDFtk нужно добавить PATH (ваша логика)
            if ($prog.ID -eq 8) {
                $binPath = "C:\Program Files (x86)\PDFtk\bin"
                $currentPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
                if ($currentPath -notlike "*$binPath*") {
                    [Environment]::SetEnvironmentVariable('Path', "$currentPath;$binPath", 'Machine')
                }
            }

            Remove-Item $file -Force -ErrorAction SilentlyContinue
            Write-Host "Успешно!" -ForegroundColor Green
        } catch {
            Write-Host "Ошибка при загрузке или установке классическим методом: $_" -ForegroundColor Red
        }
    }
}

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "             УСТАНОВКА ЗАВЕРШЕНА!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Нажмите любую клавишу для выхода..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")