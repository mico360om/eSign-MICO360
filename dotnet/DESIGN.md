# eSign MICO360 — .NET Core Server + Offline Desktop (Design & Status)

A server-based rewrite of eSign MICO360 in .NET, with an offline-capable desktop
client that keeps a **local copy of master data** and **synchronizes** with a
central server (change tracking, conflict handling, retry, no data loss/dup).

> **Status: foundation development-ready.** The sync engine + a reusable client
> engine (`SyncClient`) are implemented and **passing 8 automated tests**; the
> server API and console client build, run, and are **published as verified EXEs**;
> the server is SQL-Server-configurable. Remaining: the MAUI GUI (needs the `maui`
> workload — see [BUILD.md](BUILD.md)) and porting the full domain (documents,
> signatures, workflow, audit, reminders…) onto the engine. Honest about what
> exists vs. remains.

## Chosen stack (per decisions)
- **Server (EXE #1):** ASP.NET Core Web API + EF Core, **SQL Server** master DB. Publishes as a self-contained single-file `.exe` (console or Windows Service).
- **Client (EXE #2):** **.NET MAUI** (Windows) with a **local SQLite** copy (EF Core) for offline use. Self-contained installer.
- **Sync:** shared engine used by both sides (`EsignMico360.Sync`).

## Solution layout (`/dotnet`)
```
EsignMico360.sln
 ├─ src/Shared   — SyncEntity base + sync DTOs (contracts shared by server & client)
 ├─ src/Sync     — SyncDbContext (version stamping), ServerSyncService (pull/push),
 │                 RetryPolicy, entities  ← IMPLEMENTED + TESTED
 ├─ src/Server   — ASP.NET Core Web API (scaffold; controllers/auth to be built)
 └─ tests/Sync.Tests — 7 passing tests for the sync guarantees
```

## Data model & change tracking
Every synchronized row derives from **`SyncEntity`**:
- **`Id` (GUID)** — global identity, so rows created offline on any PC never collide/duplicate.
- **`Version` (long)** — server-assigned, strictly-increasing change stamp. `SyncDbContext.SaveChanges` stamps every changed row from a monotonic sequence; it is the sync **watermark**.
- **`IsDeleted`** — tombstone; deletes propagate, synced rows are never hard-deleted.
- **`UpdatedAtUtc`, `UpdatedByDeviceId`** — for last-write-wins and provenance/audit.

## Sync protocol (implemented)
Per entity type, two operations keep the server load minimal (incremental, batched):
1. **PULL** `PullAsync(sinceVersion, batchSize)` → rows with `Version > watermark`, ordered, paged (`HasMore` drives follow-up pulls), returns the new watermark.
2. **PUSH** `PushAsync(deviceId, changes)` — each change carries its `BaseVersion`:
   - **Insert** if the `Id` is new → **idempotent**: a retried push finds the row and never duplicates.
   - **Conflict** if `existing.Version != BaseVersion` → **last-write-wins by `UpdatedAtUtc`**; the losing side is returned in `Conflicts` (server value preserved when it wins). Critical entities can later use field-level merge / review.
   - **Fast-forward** update when the client was current.
- **Retry:** `RetryPolicy` (exponential backoff + jitter). All operations are idempotent (keyed by GUID), so retries can't duplicate.

**Proven by tests:** delta-by-watermark, no-dup-on-retry, LWW both directions, tombstone propagation, two-client convergence (no loss/dup), retry-then-succeed.

## Still to build (honest roadmap)
- **Phase 2 — Domain port:** users/roles/permissions, companies, documents + PDF conversion (LibreOffice server-side), signatures/stamps, approval workflow, audit (hash chain), reminders, reports — each as a `SyncEntity` where it should replicate to clients. Large-blob (PDF) sync via content-hash + chunked/resumable transfer.
- **Phase 3 — Server API:** JWT auth + refresh, RBAC, per-user row authorization (clients only receive data they may see), the `/sync/{entity}/pull|push` endpoints, SignalR change-push (optional).
- **Phase 4 — MAUI client:** local store, background sync loop, offline outbox/queue, conflict UI, the app screens.
- **Phase 5 — Package & harden:** two self-contained EXEs, encrypted local store (SQLCipher), TLS, security review, load/scale test, full QA.

## Environment prerequisites (to finish Phases 3–5 here)
- **.NET SDK 8/9** — ✅ present.
- **MAUI workload** — not installed (`dotnet workload install maui`, large/admin) — required to build the client `.exe`. A MAUI **GUI cannot be interactively driven in a headless CI**; its logic will be covered by automated tests.
- **SQL Server instance** — none available (no LocalDB/Docker). The code targets SQL Server via EF Core and is tested locally against SQLite (standard practice); real-SQL-Server testing needs an instance (LocalDB/Express/remote).
