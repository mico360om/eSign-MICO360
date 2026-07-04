using System.Reflection;
using EsignMico360.Shared;
using Microsoft.EntityFrameworkCore;

namespace EsignMico360.Sync;

/// <summary>
/// Server-side sync engine. Two operations per entity type:
///   PULL  — return rows changed since the client's watermark (incremental, batched → low load).
///   PUSH  — apply the client's changes, upserting by GUID Id (idempotent → no duplication),
///           detecting conflicts via BaseVersion and resolving last-write-wins by UpdatedAtUtc.
/// </summary>
public class ServerSyncService
{
    private readonly SyncDbContext _db;
    public ServerSyncService(SyncDbContext db) => _db = db;

    public async Task<PullResponse<T>> PullAsync<T>(long sinceVersion, int batchSize = 500) where T : SyncEntity
    {
        // Fetch one extra row to know whether more remain (batched → minimal server load).
        var rows = await _db.Set<T>().AsNoTracking()
            .Where(e => e.Version > sinceVersion)
            .OrderBy(e => e.Version)
            .Take(batchSize + 1)
            .ToListAsync();

        var hasMore = rows.Count > batchSize;
        if (hasMore) rows.RemoveAt(rows.Count - 1);
        var maxV = rows.Count > 0 ? rows[^1].Version : sinceVersion;
        return new PullResponse<T> { Changes = rows, NewWatermark = maxV, HasMore = hasMore };
    }

    public async Task<PushResponse<T>> PushAsync<T>(PushRequest<T> req) where T : SyncEntity, new()
    {
        var resp = new PushResponse<T>();
        var clientWon = new List<(ConflictInfo<T> info, T tracked)>();

        foreach (var ch in req.Changes)
        {
            var incoming = ch.Entity;
            var existing = await _db.Set<T>().FirstOrDefaultAsync(e => e.Id == incoming.Id);

            if (existing == null)
            {
                // First time the server has seen this Id → insert. A repeated push of the
                // same Id will find it existing next time, so retries never duplicate.
                incoming.UpdatedByDeviceId = req.DeviceId;
                _db.Set<T>().Add(incoming);
                resp.Applied++;
            }
            else if (existing.Version != ch.BaseVersion)
            {
                // The server row moved on since the client's base → conflict.
                if (incoming.UpdatedAtUtc > existing.UpdatedAtUtc)
                {
                    CopyMutable(incoming, existing);
                    existing.UpdatedByDeviceId = req.DeviceId;
                    var info = new ConflictInfo<T> { Id = incoming.Id, Resolution = ConflictResolution.ClientWon };
                    clientWon.Add((info, existing));
                    resp.Conflicts.Add(info);
                    resp.Applied++;
                }
                else
                {
                    resp.Conflicts.Add(new ConflictInfo<T>
                    {
                        Id = incoming.Id,
                        Resolution = ConflictResolution.ServerWon,
                        ServerVersion = existing.Version,
                        ServerEntity = Clone(existing),
                    });
                }
            }
            else
            {
                // Fast-forward update — client was up to date.
                CopyMutable(incoming, existing);
                existing.UpdatedByDeviceId = req.DeviceId;
                resp.Applied++;
            }
        }

        await _db.SaveChangesAsync();               // assigns fresh Versions to applied rows
        foreach (var (info, tracked) in clientWon) info.ServerVersion = tracked.Version;
        resp.ServerWatermark = await CurrentWatermarkAsync<T>();
        return resp;
    }

    public async Task<long> CurrentWatermarkAsync<T>() where T : SyncEntity =>
        await _db.Set<T>().AsNoTracking().MaxAsync(e => (long?)e.Version) ?? 0;

    // Copy business fields (everything the entity itself declares) + the tombstone/timestamp.
    // Id and Version are never copied from the client — the server owns them.
    private static void CopyMutable<T>(T from, T to) where T : SyncEntity
    {
        to.UpdatedAtUtc = from.UpdatedAtUtc;
        to.IsDeleted = from.IsDeleted;
        foreach (var p in typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance))
            if (p.CanRead && p.CanWrite && p.DeclaringType != typeof(SyncEntity))
                p.SetValue(to, p.GetValue(from));
    }

    private static T Clone<T>(T e) where T : SyncEntity, new()
    {
        var c = new T { Id = e.Id, Version = e.Version, UpdatedAtUtc = e.UpdatedAtUtc, IsDeleted = e.IsDeleted, UpdatedByDeviceId = e.UpdatedByDeviceId };
        foreach (var p in typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance))
            if (p.CanRead && p.CanWrite && p.DeclaringType != typeof(SyncEntity))
                p.SetValue(c, p.GetValue(e));
        return c;
    }
}
