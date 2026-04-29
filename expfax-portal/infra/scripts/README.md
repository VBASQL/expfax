# Infrastructure Scripts

## register-entra-app.ps1

Run after `azd provision` to register the Entra ID app:

```powershell
.\infra\scripts\register-entra-app.ps1 `
    -AppDisplayName "ExpFax Portal" `
    -RedirectUri "https://YOUR-APP.azurewebsites.net"
```

Store the output values in Azure Key Vault (see task 04).
