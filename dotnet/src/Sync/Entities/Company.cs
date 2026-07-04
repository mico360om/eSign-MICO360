using EsignMico360.Shared;

namespace EsignMico360.Sync.Entities;

/// <summary>Sample master-data entity used to prove the sync engine end-to-end.</summary>
public class Company : SyncEntity
{
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}
