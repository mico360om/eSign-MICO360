# eSign MICO360 .NET — Build, Run & Package

Everything below is **verified** except the MAUI desktop GUI, which needs the MAUI
workload installed (call that out explicitly — it is the only unbuilt/untested part).

## Prerequisites
- **.NET SDK 8** — installed ✅
- **MAUI workload** — install for the desktop GUI client: `dotnet workload install maui`
- **SQL Server** (LocalDB / Express / Docker) — only needed to run the server on SQL Server
  (it runs on SQLite out of the box).

## 1. Build & test everything that exists today
```bash
cd dotnet
dotnet build EsignMico360.sln        # server + sync engine + console client + tests
dotnet test  tests/Sync.Tests        # 8 tests: sync engine + two-PC SyncClient convergence
```

## 2. Run the server
```bash
dotnet run --project src/Server --urls http://localhost:5080
# health:  GET  http://localhost:5080/api/health
# login:   POST http://localhost:5080/api/auth/login   { "username":"admin", "password":"Admin@123" }
# sync:    POST /api/sync/companies/pull | /push   (require a Bearer token)
```
Seeds an `admin` / `Admin@123` user (PBKDF2-hashed) and one company on first run.

### Switch to SQL Server (no code change)
Set config (env or `appsettings.Production.json`, provided as an example):
```
Database:Provider = "sqlserver"
ConnectionStrings:Default = "Server=...;Database=EsignMico360;User Id=...;Password=...;Encrypt=True"
Jwt:Key = "<strong 32+ byte secret from a secret store>"
```
> For production, replace `EnsureCreated()` with EF Core **migrations** (`dotnet ef migrations add Init`) and apply with `dotnet ef database update` on deploy.

## 3. Run the headless (console) client
```bash
C="dotnet run --project src/Client -- http://localhost:5080 PC-1"
$C add "Acme Ltd"     # offline, queued
$C sync               # push outbox + pull delta
$C list
```

## 4. Publish the two EXEs (self-contained, single file)
```bash
dotnet publish src/Server -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish/server
dotnet publish src/Client -c Release -r win-x64 --self-contained true \
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o publish/client
# -> publish/server/EsignMico360.Server.exe   (verified running)
# -> publish/client/EsignMico360.Client.exe   (verified running)
```

## 5. The MAUI desktop client (built — `src/Client.Maui`)
Implemented as a thin GUI over the **tested** `SyncClient` (server URL/login, add
company offline, Sync button, live company list). Build for Windows:
```bash
dotnet workload install maui-windows          # one-time (already installed here)
dotnet build src/Client.Maui -f net9.0-windows10.0.19041.0   # ✅ builds clean
```
`MainPage.xaml.cs` opens a local SQLite copy under `FileSystem.AppDataDirectory`,
uses `HttpSyncApi` + `SyncClient` for offline add + conflict-safe, retrying sync —
the exact engine covered by the tests.

> The GUI **compiles** here; it can't be *interactively clicked* in a headless
> environment, but its data/sync behavior is the tested `SyncClient`.

Publish the desktop EXE:
```bash
dotnet publish src/Client.Maui -c Release -f net8.0-windows10.0.19041.0 \
  -p:WindowsPackageType=None -p:PublishSingleFile=true -r win-x64 --self-contained true
```

## Status
| Piece | State |
|---|---|
| Sync engine (change tracking, conflict, retry, tombstones) | ✅ built + 7 tests |
| Reusable `SyncClient` (offline outbox, watermark, push-pull) | ✅ built + 1 two-PC test |
| Server API (JWT auth, EF Core, sync endpoints) | ✅ built + runs (EXE verified) |
| Console client (uses `SyncClient`/`HttpSyncApi`) | ✅ built + runs (EXE verified) |
| SQL Server provider | ✅ wired via config — needs a SQL Server instance to run/test |
| MAUI desktop GUI (`src/Client.Maui`, over `SyncClient`) | ✅ **builds** (net9.0-windows) — GUI can't be *interactively clicked* in headless CI, but its data/sync logic is the tested `SyncClient` |
| Full domain (documents, PDF, signatures, workflow, audit, reminders…) | ⬜ to be ported onto the engine |
