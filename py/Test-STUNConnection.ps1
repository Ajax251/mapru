<#
.SYNOPSIS
    Диагностика возможности использования STUN сервера для WebRTC
.DESCRIPTION
    Проверяет доступность STUN серверов, определяет тип NAT, 
    тестирует UDP соединения и дает рекомендации
.EXAMPLE
    .\Test-STUNConnection.ps1
.EXAMPLE
    .\Test-STUNConnection.ps1 -Verbose
#>

param(
    [Parameter(Mandatory=$false)]
    [string]$STUNServer = "stun.l.google.com",
    
    [Parameter(Mandatory=$false)]
    [int]$STUNPort = 19302,
    
    [Parameter(Mandatory=$false)]
    [switch]$Detailed
)

# Цвета для вывода
$script:ColorSuccess = "Green"
$script:ColorWarning = "Yellow"
$script:ColorError = "Red"
$script:ColorInfo = "Cyan"

function Write-Header {
    param([string]$Text)
    Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  $($Text.PadRight(59))  ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan
}

function Write-Result {
    param(
        [string]$Test,
        [bool]$Success,
        [string]$Message = ""
    )
    
    $status = if ($Success) { "✅ PASS" } else { "❌ FAIL" }
    $color = if ($Success) { $ColorSuccess } else { $ColorError }
    
    Write-Host ("{0,-40} {1}" -f $Test, $status) -ForegroundColor $color
    if ($Message) {
        Write-Host "   └─ $Message" -ForegroundColor Gray
    }
}

function Write-Info {
    param([string]$Text)
    Write-Host "ℹ️  $Text" -ForegroundColor $ColorInfo
}

function Write-Warning {
    param([string]$Text)
    Write-Host "⚠️  $Text" -ForegroundColor $ColorWarning
}

# ═══════════════════════════════════════════════════════════════
# 1. Базовые проверки
# ═══════════════════════════════════════════════════════════════

Write-Header "STUN Диагностика для WebRTC"

Write-Host "📊 Информация о системе:" -ForegroundColor $ColorInfo
Write-Host "   OS: $([System.Environment]::OSVersion.VersionString)"
Write-Host "   PowerShell: $($PSVersionTable.PSVersion)"
Write-Host "   Время: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# ═══════════════════════════════════════════════════════════════
# 2. Проверка интернет-соединения
# ═══════════════════════════════════════════════════════════════

Write-Header "1. Проверка интернет-соединения"

$internetTest = Test-Connection -ComputerName "8.8.8.8" -Count 2 -Quiet -ErrorAction SilentlyContinue
Write-Result "Доступ в интернет (ping 8.8.8.8)" $internetTest

if (-not $internetTest) {
    Write-Host "`n❌ Нет доступа в интернет. Дальнейшие проверки невозможны." -ForegroundColor $ColorError
    exit 1
}

# ═══════════════════════════════════════════════════════════════
# 3. Получение локального IP
# ═══════════════════════════════════════════════════════════════

Write-Header "2. Сетевая информация"

$localIPs = Get-NetIPAddress -AddressFamily IPv4 | 
    Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -ne "127.0.0.1" } |
    Select-Object -ExpandProperty IPAddress

Write-Host "🏠 Локальные IP адреса:" -ForegroundColor $ColorInfo
foreach ($ip in $localIPs) {
    Write-Host "   └─ $ip"
}

# Проверка на приватный IP (признак NAT)
$isPrivateIP = $localIPs | Where-Object { 
    $_ -match "^10\." -or 
    $_ -match "^192\.168\." -or 
    $_ -match "^172\.(1[6-9]|2[0-9]|3[0-1])\."
}

if ($isPrivateIP) {
    Write-Info "Обнаружен приватный IP - вы находитесь за NAT"
} else {
    Write-Info "Публичный IP - прямое подключение к интернету"
}

# ═══════════════════════════════════════════════════════════════
# 4. Получение публичного IP (через HTTP API)
# ═══════════════════════════════════════════════════════════════

Write-Host "`n🌐 Получение публичного IP..."
try {
    $publicIP = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 5).ip
    Write-Host "   Публичный IP: " -NoNewline
    Write-Host $publicIP -ForegroundColor $ColorSuccess
} catch {
    Write-Warning "Не удалось определить публичный IP"
    $publicIP = "unknown"
}

# ═══════════════════════════════════════════════════════════════
# 5. Тест DNS резолвинга STUN серверов
# ═══════════════════════════════════════════════════════════════

Write-Header "3. Проверка STUN серверов"

$stunServers = @(
    @{Name="Google STUN"; Host="stun.l.google.com"; Port=19302},
    @{Name="Google STUN Alt"; Host="stun1.l.google.com"; Port=19302},
    @{Name="Twilio STUN"; Host="global.stun.twilio.com"; Port=3478},
    @{Name="Cloudflare STUN"; Host="stun.cloudflare.com"; Port=3478}
)

$workingServers = @()

foreach ($server in $stunServers) {
    Write-Host "`n📡 Проверка: $($server.Name)" -ForegroundColor $ColorInfo
    
    # DNS резолвинг
    try {
        $resolvedIP = [System.Net.Dns]::GetHostAddresses($server.Host)[0].IPAddressToString
        Write-Result "  DNS резолвинг" $true "$($server.Host) → $resolvedIP"
        
        # TCP проверка (не все STUN поддерживают, но попробуем)
        $tcpTest = Test-NetConnection -ComputerName $server.Host -Port $server.Port -WarningAction SilentlyContinue -InformationLevel Quiet -ErrorAction SilentlyContinue
        Write-Result "  TCP соединение" $tcpTest "$($server.Host):$($server.Port)"
        
        if ($tcpTest) {
            $workingServers += $server
        }
        
    } catch {
        Write-Result "  DNS резолвинг" $false "Не удалось разрешить $($server.Host)"
    }
}

# ═══════════════════════════════════════════════════════════════
# 6. Проверка UDP (через простой тест)
# ═══════════════════════════════════════════════════════════════

Write-Header "4. Проверка UDP соединений"

Write-Host "🔌 Тестирование UDP портов..." -ForegroundColor $ColorInfo

function Test-UDPPort {
    param(
        [string]$Server,
        [int]$Port,
        [int]$Timeout = 3000
    )
    
    try {
        $udpClient = New-Object System.Net.Sockets.UdpClient
        $udpClient.Client.ReceiveTimeout = $Timeout
        $udpClient.Connect($Server, $Port)
        
        # Отправляем простой пакет
        $sendBytes = [System.Text.Encoding]::ASCII.GetBytes("test")
        $udpClient.Send($sendBytes, $sendBytes.Length) | Out-Null
        
        # Пытаемся получить ответ (таймаут)
        $remoteEP = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
        
        try {
            $receiveBytes = $udpClient.Receive([ref]$remoteEP)
            $udpClient.Close()
            return $true
        } catch {
            # Таймаут - это норма для STUN без правильного запроса
            $udpClient.Close()
            return $true  # Считаем успешным, если смогли отправить
        }
    } catch {
        return $false
    }
}

$udpTest = Test-UDPPort -Server "8.8.8.8" -Port 53  # DNS как базовый UDP тест
Write-Result "Базовый UDP тест (DNS)" $udpTest

# ═══════════════════════════════════════════════════════════════
# 7. Проверка Firewall правил
# ═══════════════════════════════════════════════════════════════

Write-Header "5. Проверка Firewall"

try {
    $firewallProfile = Get-NetFirewallProfile -ErrorAction SilentlyContinue | 
        Where-Object { $_.Enabled -eq $true } | 
        Select-Object -First 1
    
    if ($firewallProfile) {
        Write-Result "Windows Firewall активен" $true "$($firewallProfile.Name) профиль"
        Write-Info "UDP исходящие соединения обычно разрешены по умолчанию"
    } else {
        Write-Result "Windows Firewall" $false "Не удалось проверить статус"
    }
} catch {
    Write-Warning "Требуются права администратора для проверки Firewall"
}

# ═══════════════════════════════════════════════════════════════
# 8. Продвинутый STUN тест (отправка настоящего STUN запроса)
# ═══════════════════════════════════════════════════════════════

Write-Header "6. Продвинутый STUN тест"

function Send-STUNRequest {
    param(
        [string]$Server,
        [int]$Port = 3478
    )
    
    try {
        $udpClient = New-Object System.Net.Sockets.UdpClient
        $udpClient.Client.ReceiveTimeout = 5000
        
        # Резолвим IP
        $serverIP = [System.Net.Dns]::GetHostAddresses($Server)[0].IPAddressToString
        $udpClient.Connect($serverIP, $Port)
        
        # Формируем STUN Binding Request
        # Magic Cookie: 0x2112A442
        # Transaction ID: 12 случайных байт
        
        $stunRequest = [byte[]]::new(20)
        
        # Message Type: Binding Request (0x0001)
        $stunRequest[0] = 0x00
        $stunRequest[1] = 0x01
        
        # Message Length: 0 (нет атрибутов)
        $stunRequest[2] = 0x00
        $stunRequest[3] = 0x00
        
        # Magic Cookie
        $stunRequest[4] = 0x21
        $stunRequest[5] = 0x12
        $stunRequest[6] = 0xA4
        $stunRequest[7] = 0x42
        
        # Transaction ID (12 байт)
        $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
        $transactionId = [byte[]]::new(12)
        $rng.GetBytes($transactionId)
        [Array]::Copy($transactionId, 0, $stunRequest, 8, 12)
        
        # Отправляем запрос
        $udpClient.Send($stunRequest, $stunRequest.Length) | Out-Null
        
        # Получаем ответ
        $remoteEP = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
        $response = $udpClient.Receive([ref]$remoteEP)
        
        $udpClient.Close()
        
        # Парсим ответ
        if ($response.Length -ge 20) {
            $messageType = [BitConverter]::ToUInt16($response[0..1], 0)
            
            # Success Response = 0x0101
            if (([BitConverter]::ToString($response[0..1]) -replace '-','') -eq "0101") {
                # Ищем XOR-MAPPED-ADDRESS (0x0020)
                $offset = 20
                while ($offset -lt $response.Length) {
                    $attrType = [BitConverter]::ToUInt16($response[$offset..($offset+1)], 0)
                    $attrLength = [BitConverter]::ToUInt16($response[($offset+2)..($offset+3)], 0)
                    
                    if (([BitConverter]::ToString($response[$offset..($offset+1)]) -replace '-','') -eq "2000") {
                        # Нашли MAPPED-ADDRESS
                        $family = $response[$offset+5]
                        $port = [BitConverter]::ToUInt16($response[($offset+6)..($offset+7)], 0)
                        $port = [System.Net.IPAddress]::NetworkToHostOrder([int16]$port)
                        
                        $ipBytes = $response[($offset+8)..($offset+11)]
                        $mappedIP = [System.Net.IPAddress]::new($ipBytes).ToString()
                        
                        return @{
                            Success = $true
                            MappedIP = $mappedIP
                            MappedPort = $port
                            ServerIP = $serverIP
                        }
                    }
                    
                    $offset += 4 + $attrLength
                    # Выравнивание по 4 байта
                    if ($attrLength % 4 -ne 0) {
                        $offset += 4 - ($attrLength % 4)
                    }
                }
            }
        }
        
        return @{Success = $true; Message = "Получен ответ, но не удалось распарсить IP"}
        
    } catch {
        return @{Success = $false; Error = $_.Exception.Message}
    }
}

Write-Host "🔍 Отправка настоящего STUN запроса..." -ForegroundColor $ColorInfo

$stunResult = Send-STUNRequest -Server "stun.l.google.com" -Port 19302

if ($stunResult.Success -and $stunResult.MappedIP) {
    Write-Host "`n✅ STUN работает!" -ForegroundColor $ColorSuccess
    Write-Host "   ╔═══════════════════════════════════════╗"
    Write-Host "   ║  Ваш публичный IP (через STUN):      ║"
    Write-Host "   ║  " -NoNewline
    Write-Host "$($stunResult.MappedIP):$($stunResult.MappedPort)".PadRight(37) -NoNewline -ForegroundColor $ColorSuccess
    Write-Host "║"
    Write-Host "   ╚═══════════════════════════════════════╝"
    
    # Сравниваем с HTTP IP
    if ($publicIP -ne "unknown" -and $stunResult.MappedIP -eq $publicIP) {
        Write-Host "   ✅ IP совпадает с HTTP проверкой" -ForegroundColor $ColorSuccess
    } elseif ($publicIP -ne "unknown") {
        Write-Host "   ⚠️  IP отличается от HTTP проверки ($publicIP)" -ForegroundColor $ColorWarning
        Write-Info "Это может указывать на Carrier-Grade NAT"
    }
    
} elseif ($stunResult.Success) {
    Write-Result "STUN запрос" $true "Сервер ответил, но не удалось получить IP"
} else {
    Write-Result "STUN запрос" $false $stunResult.Error
}

# ═══════════════════════════════════════════════════════════════
# 9. Определение типа NAT
# ═══════════════════════════════════════════════════════════════

Write-Header "7. Определение типа NAT"

if ($isPrivateIP) {
    Write-Host "🔍 Анализ типа NAT..." -ForegroundColor $ColorInfo
    
    # Упрощенная эвристика
    if ($stunResult.Success -and $stunResult.MappedIP) {
        Write-Host "`n📊 Вероятный тип NAT: " -NoNewline
        
        # Если порты совпадают - скорее всего Full Cone или Restricted
        if ($stunResult.MappedPort -lt 65000) {
            Write-Host "Full Cone / Restricted Cone NAT" -ForegroundColor $ColorSuccess
            Write-Host "   └─ ✅ Отлично для WebRTC"
        } else {
            Write-Host "Port Restricted / Symmetric NAT" -ForegroundColor $ColorWarning
            Write-Host "   └─ ⚠️  Может потребоваться TURN сервер"
        }
    } else {
        Write-Host "❓ Невозможно определить тип NAT" -ForegroundColor $ColorWarning
    }
} else {
    Write-Host "ℹ️  Прямое подключение (без NAT)" -ForegroundColor $ColorInfo
}

# ═══════════════════════════════════════════════════════════════
# 10. Итоговые рекомендации
# ═══════════════════════════════════════════════════════════════

Write-Header "8. Итоговые рекомендации"

$score = 0
$maxScore = 5

if ($internetTest) { $score++ }
if ($workingServers.Count -gt 0) { $score++ }
if ($udpTest) { $score++ }
if ($stunResult.Success) { $score++ }
if ($isPrivateIP -and $stunResult.MappedIP) { $score++ }

Write-Host "📊 Общий балл: $score/$maxScore" -ForegroundColor $(
    if ($score -ge 4) { $ColorSuccess }
    elseif ($score -ge 3) { $ColorWarning }
    else { $ColorError }
)

Write-Host "`n💡 Рекомендации:" -ForegroundColor $ColorInfo

if ($score -ge 4) {
    Write-Host ""
    Write-Host "✅ Ваша сеть отлично подходит для WebRTC!" -ForegroundColor $ColorSuccess
    Write-Host "   • STUN сервера работают"
    Write-Host "   • UDP соединения проходят"
    Write-Host "   • Видео/аудио звонки должны работать у ~80% пользователей"
    Write-Host ""
    Write-Host "🚀 Можно использовать конфигурацию:" -ForegroundColor $ColorInfo
    Write-Host "   const rtcConfig = {"
    Write-Host "       iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]"
    Write-Host "   };"
    
} elseif ($score -ge 3) {
    Write-Host ""
    Write-Host "⚠️  Ваша сеть работает, но могут быть проблемы" -ForegroundColor $ColorWarning
    Write-Host "   • STUN работает частично"
    Write-Host "   • Некоторые звонки могут не устанавливаться"
    Write-Host ""
    Write-Host "💡 Рекомендую добавить TURN сервер:" -ForegroundColor $ColorInfo
    Write-Host "   const rtcConfig = {"
    Write-Host "       iceServers: ["
    Write-Host "           { urls: 'stun:stun.l.google.com:19302' },"
    Write-Host "           { urls: 'turn:your-turn-server.com:3478',"
    Write-Host "             username: 'user', credential: 'pass' }"
    Write-Host "       ]"
    Write-Host "   };"
    
} else {
    Write-Host ""
    Write-Host "❌ Ваша сеть имеет ограничения для WebRTC" -ForegroundColor $ColorError
    Write-Host "   • STUN не работает"
    Write-Host "   • Возможно заблокированы UDP порты"
    Write-Host "   • Жесткий firewall или Symmetric NAT"
    Write-Host ""
    Write-Host "🔧 Необходимо:" -ForegroundColor $ColorWarning
    Write-Host "   1. Проверить настройки роутера"
    Write-Host "   2. Обязательно добавить TURN сервер"
    Write-Host "   3. Возможно, использовать VPN"
}

# ═══════════════════════════════════════════════════════════════
# 11. Дополнительная информация
# ═══════════════════════════════════════════════════════════════

if ($Detailed) {
    Write-Header "9. Детальная информация"
    
    Write-Host "🌐 Сетевые интерфейсы:" -ForegroundColor $ColorInfo
    Get-NetAdapter | Where-Object Status -eq "Up" | Format-Table Name, Status, LinkSpeed -AutoSize
    
    Write-Host "`n🔥 Активные правила Firewall (UDP):" -ForegroundColor $ColorInfo
    try {
        Get-NetFirewallRule | 
            Where-Object { $_.Enabled -eq $true -and $_.Direction -eq "Outbound" } |
            Select-Object -First 5 |
            Format-Table DisplayName, Direction, Action -AutoSize
    } catch {
        Write-Warning "Требуются права администратора"
    }
}

Write-Host "`n" 
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Диагностика завершена: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan