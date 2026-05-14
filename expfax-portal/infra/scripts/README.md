# Infrastructure Scripts

## register-entra-app.ps1

Run after `azd provision` to register the **workforce admin** Entra ID app
(used for ARM-privileged admin sign-in via the home tenant).

```powershell
.\infra\scripts\register-entra-app.ps1 `
    -AppDisplayName "ExpFax Portal" `
    -RedirectUri "https://YOUR-APP.azurewebsites.net"
```

Capture the output and feed into `azd env set`:

```powershell
azd env set ENTRA_TENANT_ID     <tenantId>
azd env set ENTRA_CLIENT_ID     <appId>
azd env set ENTRA_CLIENT_SECRET <secret>
```

The next `azd provision` will seed these into Key Vault automatically (see
`infra/modules/key-vault.bicep`).

---

## Three Entra app registrations are needed

The portal uses **three separate app registrations**, each with a distinct
purpose. All redirect URIs are `https://<host>/api/auth/callback`.

| App reg                | Tenant                | Account types                                 | Used for                                                | Env vars                                          |
|------------------------|-----------------------|------------------------------------------------|---------------------------------------------------------|---------------------------------------------------|
| `expfax-app`           | Workforce (home)      | "My org only"                                 | ARM-privileged admin sign-in                            | `ENTRA_*`                                         |
| `expfax-ciam`          | External ID (CIAM)    | "Accounts in this directory only" (single)    | Local email+password customer accounts (signup, login)  | `EXTERNAL_*`                                      |
| `expfax-msa-sso`       | External ID (CIAM)    | **Multitenant + personal MSA**                | Federated Microsoft sign-in for invitation flow (no shadow user created in any tenant) | `COMMON_CLIENT_ID`, `COMMON_CLIENT_SECRET`        |

Create `expfax-msa-sso` manually in the Azure portal:

1. **External ID tenant → Microsoft Entra ID → App registrations → New registration**
2. **Name:** `expfax-msa-sso`
3. **Supported account types:** *Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts*
4. **Redirect URI:** Web → `https://<host>/api/auth/callback` (and `http://localhost:3000/api/auth/callback` for dev)
5. Register → copy **Application (client) ID** → set `COMMON_CLIENT_ID`
6. **Certificates & secrets → New client secret** → copy **Value** → set `COMMON_CLIENT_SECRET`
7. **API permissions** — defaults are fine (`User.Read` delegated). No admin consent needed.

```powershell
azd env set COMMON_CLIENT_ID     <appId>
azd env set COMMON_CLIENT_SECRET <secret>
```

---

## Other secrets seeded by the Key Vault module

Set any of these via `azd env set` before `azd provision` to have them seeded
into Key Vault on deploy:

```
FAXBACK_API_URL, FAXBACK_USERNAME, FAXBACK_PASSWORD, FAXBACK_EMAIL_DOMAIN
EXTERNAL_TENANT_ID, EXTERNAL_TENANT_DOMAIN, EXTERNAL_CLIENT_ID, EXTERNAL_CLIENT_SECRET
SESSION_SECRET    # generate: powershell -c "[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))"
```

Any unset value is skipped — the operator can populate it manually in the Key
Vault later without re-deploying.
