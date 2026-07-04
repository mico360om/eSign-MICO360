# Windows deployment — .NET server + desktop client

Ready-to-run **.exe** builds and a one-command service installer.

| Piece | Build folder | Runs on |
|---|---|---|
| **Server** | `dotnet/publish/server-win-x64/` → `EsignMico360.Server.exe` | the Windows Server (84.247.142.2) |
| **Client (GUI)** | `dotnet/publish/client-win-x64/` → `EsignMico360.Client.Maui.exe` | each user's Windows PC |

Both are **self-contained** — the .NET runtime (and, for the client, the Windows
App SDK) is bundled, so target machines need **no .NET install**.

> **What the server serves:** `GET /api/health`, `POST /api/auth/login`,
> `POST /api/sync/companies/{pull,push}` — a company-sync prototype on **SQLite**,
> plain **HTTP** (no TLS). Not the full e-sign product. Deploying as-is was a
> deliberate choice.

---

## A. Server — install as a Windows Service

1. **Copy** the whole `server-win-x64` folder to the server, e.g. `C:\eSignServer`.
2. **Copy** `install-server-service.ps1` (this folder) *into* `C:\eSignServer`.
3. Open **PowerShell as Administrator**, then:
   ```powershell
   cd C:\eSignServer
   Set-ExecutionPolicy -Scope Process Bypass -Force
   .\install-server-service.ps1 -AdminPassword 'ChooseAStrongPassword'
   ```
   Optional: `-Port 80` (default is **5212**, to avoid clashing with IIS).

The script generates a JWT key, writes `appsettings.Production.json` (SQLite +
your admin password + port), registers the auto-start service
`eSignMico360Server`, opens the firewall, starts it, and prints the health check.

**Verify (from anywhere):**
```
http://84.247.142.2:5212/api/health      ->  {"status":"ok",...}
```
```powershell
Invoke-RestMethod -Method Post http://84.247.142.2:5212/api/auth/login `
  -ContentType 'application/json' `
  -Body '{"Username":"admin","Password":"ChooseAStrongPassword"}'
```

**Manage the service**
```powershell
Get-Service eSignMico360Server
Restart-Service eSignMico360Server
Get-EventLog Application -Newest 20 -Source ".NET Runtime"   # if it won't start
```
- App: `C:\eSignServer` · Config: `C:\eSignServer\appsettings.Production.json` · DB: `C:\ProgramData\EsignMico360\server.db`
- **Back up** `C:\ProgramData\EsignMico360\server.db` (e.g. a scheduled nightly copy).

---

## B. Client — the desktop app

1. **Copy** the whole `client-win-x64` folder to the user's PC (any location).
2. Run **`EsignMico360.Client.Maui.exe`**.
3. In the app: set **Server URL** = `http://84.247.142.2:5212`, then log in as
   `admin` / your password. Add companies offline and press **Sync**.

> If the app doesn't launch on a clean machine, install the
> [Microsoft Visual C++ Redistributable (x64)] — everything else is bundled.

---

## Upgrading the server later
Re-publish, copy the new `server-win-x64` files over `C:\eSignServer` (keep your
`appsettings.Production.json`), then `Restart-Service eSignMico360Server`.

## Adding HTTPS later (recommended before real users)
Put a domain in front and terminate TLS — either IIS/ARR or a reverse proxy
(e.g. Caddy for Windows) forwarding 443 → `http://localhost:5212`, with a
Let's Encrypt certificate.

## Known limitations (deploying "as-is")
- **Company sync + login only** — no documents/signing/audit/reminders/reports.
- **SQLite**, not PostgreSQL (the .NET server has no Postgres driver).
- **No TLS** — bare-IP HTTP; add a domain + certificate before real use.
- `-AdminPassword` sets the admin password **only on a fresh database** (first
  boot). To change it later, stop the service, delete
  `C:\ProgramData\EsignMico360\server.db`, and re-run the installer.

## Rebuild the .exe files (from the repo `dotnet/` folder)
```powershell
# Server
dotnet publish src/Server -c Release -r win-x64 --self-contained true -o publish/server-win-x64
# Client (MAUI desktop)
dotnet publish src/Client.Maui -c Release -f net9.0-windows10.0.19041.0 `
  -p:RuntimeIdentifier=win-x64 -p:WindowsAppSDKSelfContained=true `
  -p:SelfContained=true -p:PublishReadyToRun=false -o publish/client-win-x64
```

[Microsoft Visual C++ Redistributable (x64)]: https://aka.ms/vs/17/release/vc_redist.x64.exe
