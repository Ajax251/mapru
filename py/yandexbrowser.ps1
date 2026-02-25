# Получаем путь текущего пользователя
$localAppData = [Environment]::GetFolderPath('LocalApplicationData')
$syncExtPath = Join-Path $localAppData "Yandex\YandexBrowser\User Data\Default\Sync Extension Settings"

# Путь к разделу реестра для политики
$regPath = "HKLM:\SOFTWARE\Policies\Yandex\Browser\ExtensionInstallAllowlist"

function Show-Menu {
    Clear-Host
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "   Управление белым списком расширений" -ForegroundColor Cyan
    Write-Host "   Яндекс.Браузер" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Выберите действие:"
    Write-Host ""
    Write-Host "  [1] Добавить ВСЕ расширения в белый список"
    Write-Host "  [2] Выбрать ОДНО расширение для добавления"
    Write-Host "  [3] СБРОСИТЬ (удалить) все разрешения из белого списка"
    Write-Host "  [Q] Выход"
    Write-Host ""
}

function Reset-Allowlist {
    if (!(Test-Path $regPath)) {
        Write-Host "`nБелый список не существует. Нечего сбрасывать." -ForegroundColor Yellow
        return
    }
    
    $currentProps = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
    if (!$currentProps) {
        Write-Host "`nБелый список не существует. Нечего сбрасывать." -ForegroundColor Yellow
        return
    }
    
    $currentItems = $currentProps | Get-Member -MemberType NoteProperty | Where-Object { $_.Name -match '^\d+$' }
    
    if (!$currentItems -or $currentItems.Count -eq 0) {
        Write-Host "`nБелый список уже пуст." -ForegroundColor Yellow
        return
    }
    
    Write-Host "`nТекущие разрешения в белом списке:" -ForegroundColor Cyan
    foreach ($item in $currentItems) {
        $index = $item.Name
        $value = $currentProps.$index
        Write-Host "  $index. $value"
    }
    
    $confirm = Read-Host "`nВы уверены, что хотите УДАЛИТЬ ВСЕ разрешения? (Y/N)"
    if ($confirm -ne 'Y' -and $confirm -ne 'y') {
        Write-Host "Операция отменена." -ForegroundColor Yellow
        return
    }
    
    # Удаляем все числовые свойства по одному
    foreach ($item in $currentItems) {
        Remove-ItemProperty -Path $regPath -Name $item.Name -ErrorAction SilentlyContinue
    }
    
    # Удаляем пустой раздел
    try {
        Remove-Item -Path $regPath -Force -ErrorAction Stop
    } catch {
        # Игнорируем ошибку, если раздел не удалось удалить
    }
    
    Write-Host "`nВсе разрешения успешно удалены из белого списка!" -ForegroundColor Green
    Write-Host "Перезапустите Яндекс.Браузер для применения изменений." -ForegroundColor Cyan
}

function Add-AllExtensions {
    if (!(Test-Path $syncExtPath)) {
        Write-Warning "Папка не найдена: $syncExtPath"
        return
    }

    $ids = Get-ChildItem -Path $syncExtPath -Directory | Select-Object -ExpandProperty Name

    if ($ids.Count -eq 0) {
        Write-Host "`nВ данной папке не найдено ни одной подпапки с ID расширений." -ForegroundColor Yellow
        return
    }

    Write-Host "`nНайдены следующие ID расширений:" -ForegroundColor Cyan
    $counter = 1
    foreach ($id in $ids) {
        Write-Host "  $counter. $id"
        $counter++
    }

    $confirm = Read-Host "`nДобавить эти расширения в белый список? (Y/N)"
    if ($confirm -ne 'Y' -and $confirm -ne 'y') {
        Write-Host "Операция отменена." -ForegroundColor Yellow
        return
    }

    if (!(Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }

    # Получаем текущий максимальный индекс
    $currentMax = 0
    $existing = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
    if ($existing) {
        $existingMembers = $existing | Get-Member -MemberType NoteProperty | Where-Object { $_.Name -match '^\d+$' }
        if ($existingMembers) {
            $maxValue = $existingMembers | ForEach-Object { [int]$_.Name } | Measure-Object -Maximum
            if ($maxValue.Maximum) {
                $currentMax = $maxValue.Maximum
            }
        }
    }

    $added = 0
    foreach ($id in $ids) {
        # Проверяем, не существует ли уже такой ID
        $exists = $false
        $currentProps = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
        if ($currentProps) {
            foreach ($prop in $currentProps.PSObject.Properties) {
                if ($prop.Name -match '^\d+$' -and $prop.Value -eq $id) {
                    Write-Host "  Пропущен (уже существует): $id" -ForegroundColor DarkGray
                    $exists = $true
                    break
                }
            }
        }
        
        if (!$exists) {
            $currentMax++
            New-ItemProperty -Path $regPath -Name $currentMax -Value $id -PropertyType String -Force | Out-Null
            Write-Host "  Добавлен: $id" -ForegroundColor Green
            $added++
        }
    }

    Write-Host "`nГотово! Добавлено новых расширений: $added" -ForegroundColor Green
    Write-Host "Перезапустите Яндекс.Браузер для применения изменений." -ForegroundColor Cyan
}

function Add-SingleExtension {
    if (!(Test-Path $syncExtPath)) {
        Write-Warning "Папка не найдена: $syncExtPath"
        return
    }

    $idObjects = Get-ChildItem -Path $syncExtPath -Directory | Select-Object Name

    if ($idObjects.Count -eq 0) {
        Write-Host "`nВ данной папке не найдено ни одной подпапки с ID расширений." -ForegroundColor Yellow
        return
    }

    Write-Host "`nДоступные расширения:" -ForegroundColor Cyan
    
    $ids = @()
    $counter = 1
    foreach ($obj in $idObjects) {
        $id = $obj.Name
        $ids += $id
        Write-Host "  [$counter] $id"
        $counter++
    }

    $selection = Read-Host "`nВведите номер расширения для добавления (1-$($ids.Count))"
    
    if ($selection -notmatch '^\d+$') {
        Write-Host "Некорректный ввод. Операция отменена." -ForegroundColor Red
        return
    }
    
    $index = [int]$selection - 1
    
    if ($index -lt 0 -or $index -ge $ids.Count) {
        Write-Host "Номер вне диапазона. Операция отменена." -ForegroundColor Red
        return
    }
    
    $selectedId = $ids[$index]
    
    # Проверяем, не существует ли уже
    if (Test-Path $regPath) {
        $currentProps = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
        if ($currentProps) {
            foreach ($prop in $currentProps.PSObject.Properties) {
                if ($prop.Name -match '^\d+$' -and $prop.Value -eq $selectedId) {
                    Write-Host "`nДанное расширение уже находится в белом списке!" -ForegroundColor Yellow
                    return
                }
            }
        }
    }
    
    $confirm = Read-Host "`nДобавить '$selectedId' в белый список? (Y/N)"
    if ($confirm -ne 'Y' -and $confirm -ne 'y') {
        Write-Host "Операция отменена." -ForegroundColor Yellow
        return
    }

    if (!(Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }

    # Получаем текущий максимальный индекс
    $currentMax = 0
    $existing = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
    if ($existing) {
        $existingMembers = $existing | Get-Member -MemberType NoteProperty | Where-Object { $_.Name -match '^\d+$' }
        if ($existingMembers) {
            $maxValue = $existingMembers | ForEach-Object { [int]$_.Name } | Measure-Object -Maximum
            if ($maxValue.Maximum) {
                $currentMax = $maxValue.Maximum
            }
        }
    }

    $newIndex = $currentMax + 1
    New-ItemProperty -Path $regPath -Name $newIndex -Value $selectedId -PropertyType String -Force | Out-Null
    
    Write-Host "`nРасширение успешно добавлено в белый список!" -ForegroundColor Green
    Write-Host "Добавлено: $selectedId" -ForegroundColor Green
    Write-Host "Перезапустите Яндекс.Браузер для применения изменений." -ForegroundColor Cyan
}

function Show-CurrentAllowlist {
    if (!(Test-Path $regPath)) {
        return
    }
    
    $props = Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue
    if (!$props) {
        return
    }
    
    $items = $props | Get-Member -MemberType NoteProperty | Where-Object { $_.Name -match '^\d+$' }
    
    if (!$items -or $items.Count -eq 0) {
        return
    }
    
    Write-Host "`nТекущие разрешения в белом списке:" -ForegroundColor DarkCyan
    foreach ($item in ($items | Sort-Object { [int]$_.Name })) {
        Write-Host "  $($item.Name). $($props.($item.Name))" -ForegroundColor DarkGray
    }
}

# Основной цикл
do {
    Show-Menu
    Show-CurrentAllowlist
    
    Write-Host ""
    $choice = Read-Host "Введите номер действия"
    
    switch ($choice) {
        '1' { 
            Add-AllExtensions 
            Write-Host "`nНажмите любую клавишу для продолжения..."
            $null = [Console]::ReadKey($true)
        }
        '2' { 
            Add-SingleExtension 
            Write-Host "`nНажмите любую клавишу для продолжения..."
            $null = [Console]::ReadKey($true)
        }
        '3' { 
            Reset-Allowlist 
            Write-Host "`nНажмите любую клавишу для продолжения..."
            $null = [Console]::ReadKey($true)
        }
        'Q' { 
            Write-Host "`nВыход..." -ForegroundColor Cyan
        }
        'q' { 
            Write-Host "`nВыход..." -ForegroundColor Cyan
        }
        default {
            Write-Host "`nНеверный выбор. Попробуйте снова." -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
    
} while ($choice -ne 'Q' -and $choice -ne 'q')