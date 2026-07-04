using EsignMico360.Shared;
using EsignMico360.Sync.Entities;

namespace EsignMico360.Sync;

/// <summary>
/// Transport the client uses to reach the server. The real implementation talks
/// HTTP (<see cref="HttpSyncApi"/>); tests use an in-process implementation so the
/// client sync logic is fully testable without a network.
/// </summary>
public interface ISyncApi
{
    Task<bool> LoginAsync(string username, string password);
    Task<PullResponse<Company>> PullCompaniesAsync(long sinceVersion, int batchSize);
    Task<PushResponse<Company>> PushCompaniesAsync(PushRequest<Company> request);
}
