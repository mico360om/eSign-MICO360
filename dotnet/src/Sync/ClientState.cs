namespace EsignMico360.Sync;

/// <summary>Client-only: the sync watermark per entity type (last server Version pulled).</summary>
public class SyncState
{
    public string EntityName { get; set; } = "";
    public long Watermark { get; set; }
}

/// <summary>
/// Client-only outbox: a locally-changed row awaiting push. Keyed by the entity's
/// Id (so re-editing the same row before a sync coalesces into one queued change),
/// with the BaseVersion the edit was made against for server conflict detection.
/// </summary>
public class PendingChange
{
    public Guid EntityId { get; set; }
    public long BaseVersion { get; set; }
    public DateTime QueuedAtUtc { get; set; } = DateTime.UtcNow;
}
