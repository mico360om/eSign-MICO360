using EsignMico360.Shared;
using EsignMico360.Sync.Entities;
using Microsoft.EntityFrameworkCore;

namespace EsignMico360.Sync;

public class SyncResult
{
    public int Pushed { get; set; }
    public int Applied { get; set; }
    public int Conflicts { get; set; }
    public int Pulled { get; set; }
    public long Watermark { get; set; }
    public override string ToString() => $"push sent={Pushed} applied={Applied} conflicts={Conflicts}; pull received={Pulled} watermark={Watermark}";
}

/// <summary>
/// The reusable client sync engine — shared by the console client and the MAUI
/// desktop app. Owns the local offline copy (its <see cref="SyncDbContext"/> with
/// StampVersions=false), the outbox, the watermark, and the push-then-pull flow
/// with retry. All mutations are offline-first; <see cref="SyncAsync"/> reconciles.
/// </summary>
public class SyncClient
{
    private readonly SyncDbContext _db;
    private readonly ISyncApi _api;
    private readonly string _deviceId;

    public SyncClient(SyncDbContext localDb, ISyncApi api, string deviceId)
    {
        _db = localDb;
        _api = api;
        _deviceId = deviceId;
    }

    public async Task<Company> AddCompanyAsync(string name)
    {
        var c = new Company { Name = name };
        _db.Companies.Add(c);
        Queue(c.Id, baseVersion: 0);           // 0 = new row
        await _db.SaveChangesAsync();
        return c;
    }

    public async Task EditCompanyAsync(Guid id, string name)
    {
        var c = await _db.Companies.FindAsync(id) ?? throw new InvalidOperationException("Company not found locally");
        c.Name = name;
        c.UpdatedAtUtc = DateTime.UtcNow;
        Queue(c.Id, baseVersion: c.Version);   // conflict base = last known server version
        await _db.SaveChangesAsync();
    }

    public Task<List<Company>> ListCompaniesAsync() =>
        _db.Companies.Where(c => !c.IsDeleted).OrderBy(c => c.Name).ToListAsync();

    /// <summary>Push the outbox (server resolves conflicts), then pull the delta. Idempotent & retry-safe.</summary>
    public async Task<SyncResult> SyncAsync()
    {
        var result = new SyncResult();

        // 1) PUSH outbox first so the server authoritatively resolves conflicts.
        var pending = await _db.PendingChanges.ToListAsync();
        if (pending.Count > 0)
        {
            var changes = new List<ClientChange<Company>>();
            foreach (var pc in pending)
            {
                var c = await _db.Companies.FirstOrDefaultAsync(x => x.Id == pc.EntityId);
                if (c != null) changes.Add(new ClientChange<Company> { BaseVersion = pc.BaseVersion, Entity = c });
            }
            var pushed = await RetryPolicy.ExecuteAsync(() =>
                _api.PushCompaniesAsync(new PushRequest<Company> { DeviceId = _deviceId, Changes = changes }));
            _db.PendingChanges.RemoveRange(pending);   // reconciled (applied or conflict-resolved)
            await _db.SaveChangesAsync();
            result.Pushed = changes.Count;
            result.Applied = pushed.Applied;
            result.Conflicts = pushed.Conflicts.Count;
        }

        // 2) PULL the delta since our watermark, upsert by GUID (never duplicates).
        var state = await _db.SyncStates.FirstOrDefaultAsync(s => s.EntityName == "Company");
        var watermark = state?.Watermark ?? 0;
        while (true)
        {
            var page = await RetryPolicy.ExecuteAsync(() => _api.PullCompaniesAsync(watermark, 500));
            foreach (var sc in page.Changes)
            {
                var local = await _db.Companies.FirstOrDefaultAsync(x => x.Id == sc.Id);
                if (local is null) _db.Companies.Add(sc);
                else { local.Name = sc.Name; local.Description = sc.Description; local.IsActive = sc.IsActive; local.Version = sc.Version; local.UpdatedAtUtc = sc.UpdatedAtUtc; local.IsDeleted = sc.IsDeleted; }
                result.Pulled++;
            }
            watermark = page.NewWatermark;
            if (!page.HasMore) break;
        }
        if (state is null) _db.SyncStates.Add(new SyncState { EntityName = "Company", Watermark = watermark });
        else state.Watermark = watermark;
        await _db.SaveChangesAsync();
        result.Watermark = watermark;
        return result;
    }

    private void Queue(Guid id, long baseVersion)
    {
        if (_db.PendingChanges.Find(id) is null)
            _db.PendingChanges.Add(new PendingChange { EntityId = id, BaseVersion = baseVersion });
    }
}
