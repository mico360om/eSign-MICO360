using EsignMico360.Shared;
using EsignMico360.Sync;
using EsignMico360.Sync.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace EsignMico360.Sync.Tests;

// xUnit creates a fresh instance per test method, so each test gets an isolated
// in-memory database (the shared open connection keeps it alive for the test).
public class SyncTests : IDisposable
{
    private readonly SqliteConnection _conn;
    private readonly DbContextOptions<SyncDbContext> _opts;
    private SyncDbContext NewCtx() => new(_opts);

    public SyncTests()
    {
        _conn = new SqliteConnection("DataSource=:memory:");
        _conn.Open();
        _opts = new DbContextOptionsBuilder<SyncDbContext>().UseSqlite(_conn).Options;
        using var ctx = NewCtx();
        ctx.Database.EnsureCreated();
    }

    public void Dispose() => _conn.Dispose();

    private static Company Co(string name) => new() { Name = name };

    [Fact]
    public async Task Pull_returns_only_rows_after_watermark()
    {
        await using var db = NewCtx();
        db.Companies.Add(Co("A")); await db.SaveChangesAsync();
        db.Companies.Add(Co("B")); await db.SaveChangesAsync();
        var svc = new ServerSyncService(db);

        var all = await svc.PullAsync<Company>(0);
        Assert.Equal(2, all.Changes.Count);
        Assert.True(all.NewWatermark > 0);

        db.Companies.Add(Co("C")); await db.SaveChangesAsync();
        var delta = await svc.PullAsync<Company>(all.NewWatermark);
        Assert.Single(delta.Changes);
        Assert.Equal("C", delta.Changes[0].Name);
    }

    [Fact]
    public async Task Push_is_idempotent_no_duplication_on_retry()
    {
        var id = Guid.NewGuid();
        // Same new company pushed twice (as if the first ack was lost and retried).
        for (int i = 0; i < 2; i++)
        {
            await using var db = NewCtx();
            var svc = new ServerSyncService(db);
            await svc.PushAsync(new PushRequest<Company>
            {
                DeviceId = "PC-1",
                Changes = { new ClientChange<Company> { BaseVersion = 0, Entity = new Company { Id = id, Name = "Acme" } } },
            });
        }
        await using var check = NewCtx();
        Assert.Equal(1, await check.Companies.CountAsync(c => c.Id == id)); // exactly one — no duplication
    }

    [Fact]
    public async Task Conflict_client_newer_wins()
    {
        var id = Guid.NewGuid();
        long baseV;
        await using (var db = NewCtx())
        {
            db.Companies.Add(new Company { Id = id, Name = "Orig" }); await db.SaveChangesAsync();
            baseV = (await db.Companies.FindAsync(id))!.Version;
            var e = await db.Companies.FindAsync(id); e!.Name = "ServerEdit"; await db.SaveChangesAsync(); // server moves on
        }
        await using (var db = NewCtx())
        {
            var svc = new ServerSyncService(db);
            var resp = await svc.PushAsync(new PushRequest<Company>
            {
                DeviceId = "PC-2",
                Changes = { new ClientChange<Company> { BaseVersion = baseV,
                    Entity = new Company { Id = id, Name = "ClientEdit", UpdatedAtUtc = DateTime.UtcNow.AddMinutes(5) } } },
            });
            Assert.Single(resp.Conflicts);
            Assert.Equal(ConflictResolution.ClientWon, resp.Conflicts[0].Resolution);
        }
        await using var check = NewCtx();
        Assert.Equal("ClientEdit", (await check.Companies.FindAsync(id))!.Name);
    }

    [Fact]
    public async Task Conflict_server_newer_wins_and_is_preserved()
    {
        var id = Guid.NewGuid();
        long baseV;
        await using (var db = NewCtx())
        {
            db.Companies.Add(new Company { Id = id, Name = "Orig" }); await db.SaveChangesAsync();
            baseV = (await db.Companies.FindAsync(id))!.Version;
            var e = await db.Companies.FindAsync(id); e!.Name = "ServerEdit"; await db.SaveChangesAsync();
        }
        await using (var db = NewCtx())
        {
            var svc = new ServerSyncService(db);
            var resp = await svc.PushAsync(new PushRequest<Company>
            {
                DeviceId = "PC-3",
                Changes = { new ClientChange<Company> { BaseVersion = baseV,
                    Entity = new Company { Id = id, Name = "StaleClientEdit", UpdatedAtUtc = DateTime.UtcNow.AddMinutes(-10) } } },
            });
            Assert.Equal(ConflictResolution.ServerWon, resp.Conflicts[0].Resolution);
            Assert.Equal("ServerEdit", resp.Conflicts[0].ServerEntity!.Name);
        }
        await using var check = NewCtx();
        Assert.Equal("ServerEdit", (await check.Companies.FindAsync(id))!.Name); // server value preserved
    }

    [Fact]
    public async Task Tombstone_delete_propagates_via_pull()
    {
        var id = Guid.NewGuid();
        await using var db = NewCtx();
        db.Companies.Add(new Company { Id = id, Name = "ToDelete" }); await db.SaveChangesAsync();
        var svc = new ServerSyncService(db);
        var wm = (await svc.PullAsync<Company>(0)).NewWatermark;

        var e = await db.Companies.FindAsync(id); e!.IsDeleted = true; await db.SaveChangesAsync();
        var delta = await svc.PullAsync<Company>(wm);
        Assert.Single(delta.Changes);
        Assert.True(delta.Changes[0].IsDeleted);
    }

    [Fact]
    public async Task Two_clients_converge_without_loss_or_duplication()
    {
        var a = Guid.NewGuid(); var b = Guid.NewGuid();
        await using (var db = NewCtx())
            await new ServerSyncService(db).PushAsync(new PushRequest<Company> { DeviceId = "PC-A",
                Changes = { new ClientChange<Company> { BaseVersion = 0, Entity = new Company { Id = a, Name = "FromA" } } } });
        await using (var db = NewCtx())
            await new ServerSyncService(db).PushAsync(new PushRequest<Company> { DeviceId = "PC-B",
                Changes = { new ClientChange<Company> { BaseVersion = 0, Entity = new Company { Id = b, Name = "FromB" } } } });

        await using var check = NewCtx();
        var all = await new ServerSyncService(check).PullAsync<Company>(0);
        Assert.Equal(2, all.Changes.Count);                          // no loss
        Assert.Contains(all.Changes, c => c.Id == a && c.Name == "FromA");
        Assert.Contains(all.Changes, c => c.Id == b && c.Name == "FromB");
        Assert.Equal(2, await check.Companies.CountAsync());          // no duplication
    }

    [Fact]
    public async Task RetryPolicy_retries_transient_failures_then_succeeds()
    {
        int calls = 0;
        var result = await RetryPolicy.ExecuteAsync(async () =>
        {
            calls++;
            await Task.Yield();
            if (calls < 3) throw new TimeoutException("transient");
            return "ok";
        }, baseDelayMs: 1);
        Assert.Equal("ok", result);
        Assert.Equal(3, calls);
    }
}
