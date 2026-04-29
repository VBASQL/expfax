# Task 03 — Entra ID App Registration

## Goal
Create a script to register the Entra ID application for ExpFax Portal authentication.

## Context
- Entra ID app registrations cannot be fully done in Bicep (Microsoft Graph API needed)
- We create a PowerShell script that uses Azure CLI
- The app registration supports both interactive OAuth and ROPC flows
- Redirect URI will be the App Service URL

## Steps

### 1. Create `infra/scripts/register-entra-app.ps1`

```powershell
# ExpFax Portal — Entra ID App Registration
# Run this ONCE after infrastructure is deployed
# Requires: Azure CLI logged in with admin consent permissions

param(
    [Parameter(Mandatory=$true)]
    [string]$AppDisplayName = "ExpFax Portal",

    [Parameter(Mandatory=$true)]
    [string]$RedirectUri,  # e.g., https://expfax-app.azurewebsites.net

    [Parameter(Mandatory=$false)]
    [string]$TenantId
)

$ErrorActionPreference = "Stop"

Write-Host "Creating Entra ID App Registration: $AppDisplayName" -ForegroundColor Cyan

# Create the app registration
$appJson = az ad app create `
    --display-name $AppDisplayName `
    --sign-in-audience "AzureADMyOrg" `
    --web-redirect-uris "$RedirectUri/api/auth/callback" `
    --enable-id-token-issuance true `
    --query "{appId: appId, objectId: id}" `
    --output json

$app = $appJson | ConvertFrom-Json
$clientId = $app.appId
$objectId = $app.objectId

Write-Host "App ID (Client ID): $clientId" -ForegroundColor Green
Write-Host "Object ID: $objectId" -ForegroundColor Green

# Create a client secret (valid 2 years)
$secretJson = az ad app credential reset `
    --id $objectId `
    --display-name "ExpFax Portal Secret" `
    --years 2 `
    --query "{password: password}" `
    --output json

$secret = ($secretJson | ConvertFrom-Json).password
Write-Host "Client Secret: $secret" -ForegroundColor Yellow
Write-Host "⚠️  SAVE THIS SECRET — it cannot be retrieved later!" -ForegroundColor Red

# Create a service principal for the app
az ad sp create --id $clientId --output none
Write-Host "Service Principal created." -ForegroundColor Green

# Enable ROPC flow (public client)
az ad app update --id $objectId --is-fallback-public-client true --output none
Write-Host "ROPC (public client) flow enabled." -ForegroundColor Green

# Output summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Entra ID Registration Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ENTRA_CLIENT_ID=$clientId"
Write-Host "ENTRA_CLIENT_SECRET=$secret"
Write-Host "ENTRA_TENANT_ID=$(az account show --query tenantId -o tsv)"
Write-Host ""
Write-Host "Add these to Key Vault (task 04) or .env.local for development."
```

### 2. Create `infra/scripts/README.md`

```markdown
# Infrastructure Scripts

## register-entra-app.ps1

Run after `azd provision` to register the Entra ID app:

```powershell
.\infra\scripts\register-entra-app.ps1 `
    -AppDisplayName "ExpFax Portal" `
    -RedirectUri "https://YOUR-APP.azurewebsites.net"
```

Store the output values in Azure Key Vault (see task 04).
```

## Files Created
- `infra/scripts/register-entra-app.ps1`
- `infra/scripts/README.md`

## Notes
- This script is run manually ONCE after infra deploy
- The client secret output must be saved to Key Vault
- ROPC flow is enabled for username/password login on the custom login page
