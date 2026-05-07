$pass = "GvCdaEHOrtPTr1@!"
$user = "supervisor"
$creds = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($user + ":" + $pass))
$headers = @{ "Authorization" = "Basic " + $creds }

Write-Host "=== LOGIN ===" -ForegroundColor Cyan
$loginResp = Invoke-RestMethod -Uri "https://faxback.expfax.com/rest/nsx/Login" -Method GET -Headers $headers
$loginId = $loginResp.NSX.LoginId
Write-Host "LoginId: $loginId"

# Get first 3 handles from Received
Write-Host ""
Write-Host "=== ReadQueue Received (Count=3) ===" -ForegroundColor Cyan
$qResp = Invoke-RestMethod -Uri ("https://faxback.expfax.com/rest/mqs/Messages/ReadQueue?Queue=Received&AllUsers=1&NonBrowser=1&Count=3&LoginId=" + $loginId) -Method GET
Write-Host "MessageHandles: $($qResp.MessageHandles)"

$handles = ($qResp.MessageHandles -split ",") | Where-Object { $_ -match "^[RS]-" }
$first3 = ($handles | Select-Object -First 3) -join ","
Write-Host "First 3 handles: $first3"

if ($first3) {
    Write-Host ""
    Write-Host "=== ReadMessageBlock with real handles ===" -ForegroundColor Cyan
    $xmlBody = '<?xml version="1.0" encoding="utf-8"?><NSX><MessageHandles>' + $first3 + '</MessageHandles></NSX>'
    try {
        $mbResp = Invoke-RestMethod -Uri ("https://faxback.expfax.com/rest/mqs/Messages/ReadMessageBlock?NonBrowser=1&LoginId=" + $loginId) `
            -Method POST -Body $xmlBody -ContentType "text/xml"
        Write-Host "Response type: $($mbResp.GetType().Name)"
        $mbRespStr = $mbResp | ConvertTo-Xml -As String
        Write-Host $mbRespStr.Substring(0, [Math]::Min(3000, $mbRespStr.Length))
    } catch {
        Write-Host ("ERROR: " + $_) -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "=== ReadMessage (single handle) ===" -ForegroundColor Cyan
    $h1 = $handles[0]
    try {
        $rmResp = Invoke-RestMethod -Uri ("https://faxback.expfax.com/rest/mqs/Messages/ReadMessage?MessageHandle=" + $h1 + "&NonBrowser=1&LoginId=" + $loginId) -Method GET
        $rmResp | ConvertTo-Json -Depth 5 | Write-Host
    } catch {
        Write-Host ("ERROR: " + $_) -ForegroundColor Red
    }
}
