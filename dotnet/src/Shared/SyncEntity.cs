namespace EsignMico360.Shared;

/// <summary>
/// Base type for every synchronized record.
///  - <see cref="Id"/> is a global GUID, so records created offline on ANY device
///    never collide or duplicate (same Id == same row everywhere).
///  - <see cref="Version"/> is a server-assigned, strictly-increasing change stamp
///    used as the sync watermark: a client pulls every row with Version &gt; its watermark.
///  - <see cref="IsDeleted"/> is a tombstone so deletions propagate unambiguously
///    (synced rows are never hard-deleted).
/// </summary>
public abstract class SyncEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public long Version { get; set; }                 // server change stamp (monotonic)
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; }               // tombstone
    public string? UpdatedByDeviceId { get; set; }    // provenance for auditing
}
