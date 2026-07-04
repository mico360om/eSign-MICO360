using EsignMico360.Shared;
using EsignMico360.Sync;
using EsignMico360.Sync.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace EsignMico360.Sync.Tests;

/// <summary>In-process transport: routes client calls straight to the server sync service.</summary>
internal sealed class InMemorySyncApi : ISyncApi
{
    private readonly Func<SyncDbContext> _server;
    public InMemorySyncApi(Func<SyncDbContext> server) => _server = server;
    public Task<bool> LoginAsync(string u, string p) => Task.FromResult(true);
    public async Task<PullResponse<Company>> PullCompaniesAsync(long since, int batch)
    { await using var db = _server(); return await new ServerSyncService(db).PullAsync<Company>(since, batch); }
    public async Task<PushResponse<Company>> PushCompaniesAsync(PushRequest<Company> req)
    { await using var db = _server(); return await new ServerSyncService(db).PushAsync(req); }
}

// Exercises the real SyncClient engine (offline add/edit, outbox, watermark,
// push-then-pull) across two independent client databases and one server.
public class SyncClientTests : IDisposable
{
    private readonly SqliteConnection _server = Open(), _pcA = Open(), _pcB = Open();
    private static SqliteConnection Open() { var c = new SqliteConnection("DataSource=:memory:"); c.Open(); return c; }
    public void Dispose() { _server.Dispose(); _pcA.Dispose(); _pcB.Dispose(); }

    private SyncDbContext ServerCtx() => Ctx(_server, stamp: true);
    private static SyncDbContext Ctx(SqliteConnection conn, bool stamp)
    {
        var db = new SyncDbContext(new DbContextOptionsBuilder<SyncDbContext>().UseSqlite(conn).Options) { StampVersions = stamp };
        db.Database.EnsureCreated();
        return db;
    }

    [Fact]
    public async Task Two_pcs_offline_edits_converge_no_dup_no_loss()
    {
        var api = new InMemorySyncApi(ServerCtx);
        Guid alphaId;

        // PC-A creates two companies offline, then syncs.
        await using (var a = Ctx(_pcA, false))
        {
            var ca = new SyncClient(a, api, "PC-A");
            await ca.AddCompanyAsync("Alpha");
            await ca.AddCompanyAsync("Gamma");
            var r = await ca.SyncAsync();
            Assert.Equal(2, r.Applied);
        }

        // PC-B creates one offline, then syncs — must also receive A's two (no loss).
        await using (var b = Ctx(_pcB, false))
        {
            var cb = new SyncClient(b, api, "PC-B");
            await cb.AddCompanyAsync("Beta");
            await cb.SyncAsync();
            var list = await cb.ListCompaniesAsync();
            Assert.Equal(3, list.Count);
            alphaId = list.First(x => x.Name == "Alpha").Id;
        }

        // PC-A syncs again → sees Beta.
        await using (var a = Ctx(_pcA, false))
        {
            await new SyncClient(a, api, "PC-A").SyncAsync();
            Assert.Equal(3, (await new SyncClient(a, api, "PC-A").ListCompaniesAsync()).Count);
        }

        // Both PCs edit Alpha offline from the same base → conflict → converge.
        await using (var a = Ctx(_pcA, false)) { var ca = new SyncClient(a, api, "PC-A"); await ca.EditCompanyAsync(alphaId, "Alpha-A"); await ca.SyncAsync(); }
        await using (var b = Ctx(_pcB, false)) { var cb = new SyncClient(b, api, "PC-B"); await cb.EditCompanyAsync(alphaId, "Alpha-B"); await cb.SyncAsync(); }

        string aName, bName;
        await using (var a = Ctx(_pcA, false)) { var ca = new SyncClient(a, api, "PC-A"); await ca.SyncAsync(); aName = (await ca.ListCompaniesAsync()).First(x => x.Id == alphaId).Name; }
        await using (var b = Ctx(_pcB, false)) { var cb = new SyncClient(b, api, "PC-B"); await cb.SyncAsync(); bName = (await cb.ListCompaniesAsync()).First(x => x.Id == alphaId).Name; }

        Assert.Equal(aName, bName);                              // converged to one value
        await using var srv = ServerCtx();
        Assert.Equal(3, await srv.Companies.CountAsync());       // no duplication on the server
    }
}
