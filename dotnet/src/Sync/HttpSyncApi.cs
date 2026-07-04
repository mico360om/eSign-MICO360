using System.Net.Http.Headers;
using System.Net.Http.Json;
using EsignMico360.Shared;
using EsignMico360.Sync.Entities;

namespace EsignMico360.Sync;

/// <summary>HTTP transport to the server (used by the console + MAUI clients).</summary>
public sealed class HttpSyncApi : ISyncApi, IDisposable
{
    private readonly HttpClient _http;

    public HttpSyncApi(string baseUrl)
        => _http = new HttpClient { BaseAddress = new Uri(baseUrl), Timeout = TimeSpan.FromSeconds(30) };

    /// <summary>Lightweight reachability check — true if the server answers /api/health.</summary>
    public async Task<bool> PingAsync(CancellationToken ct = default)
    {
        try
        {
            using var resp = await _http.GetAsync("/api/health", ct);
            return resp.IsSuccessStatusCode;
        }
        catch { return false; }
    }

    public async Task<bool> LoginAsync(string username, string password)
    {
        var resp = await _http.PostAsJsonAsync("/api/auth/login", new { Username = username, Password = password });
        if (!resp.IsSuccessStatusCode) return false;
        var login = await resp.Content.ReadFromJsonAsync<LoginResult>();
        if (string.IsNullOrEmpty(login?.token)) return false;
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.token);
        return true;
    }

    public Task<PullResponse<Company>> PullCompaniesAsync(long sinceVersion, int batchSize) =>
        PostAsync<PullResponse<Company>>("/api/sync/companies/pull", new { SinceVersion = sinceVersion, BatchSize = batchSize });

    public Task<PushResponse<Company>> PushCompaniesAsync(PushRequest<Company> request) =>
        PostAsync<PushResponse<Company>>("/api/sync/companies/push", request);

    private async Task<T> PostAsync<T>(string path, object body)
    {
        var resp = await _http.PostAsJsonAsync(path, body);
        resp.EnsureSuccessStatusCode();
        return (await resp.Content.ReadFromJsonAsync<T>())!;
    }

    public void Dispose() => _http.Dispose();

    private sealed record LoginResult(string token);
}
