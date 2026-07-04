namespace EsignMico360.Shared;

/// <summary>Delta returned to a client: rows changed since its watermark, plus the new watermark.</summary>
public class PullResponse<T>
{
    public List<T> Changes { get; set; } = new();
    public long NewWatermark { get; set; }
    public bool HasMore { get; set; }   // true when the batch was capped — client pulls again
}

/// <summary>A single client change. BaseVersion = the server Version the client last knew (0 = new row).</summary>
public class ClientChange<T> where T : SyncEntity
{
    public T Entity { get; set; } = default!;
    public long BaseVersion { get; set; }
}

public class PushRequest<T> where T : SyncEntity
{
    public string DeviceId { get; set; } = "";
    public List<ClientChange<T>> Changes { get; set; } = new();
}

public enum ConflictResolution { None, ClientWon, ServerWon }

public class ConflictInfo<T>
{
    public Guid Id { get; set; }
    public ConflictResolution Resolution { get; set; }
    public long ServerVersion { get; set; }
    public T? ServerEntity { get; set; }   // the authoritative row when the server wins
}

public class PushResponse<T>
{
    public int Applied { get; set; }
    public long ServerWatermark { get; set; }
    public List<ConflictInfo<T>> Conflicts { get; set; } = new();
}
