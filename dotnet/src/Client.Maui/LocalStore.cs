using EsignMico360.Sync;
using Microsoft.EntityFrameworkCore;

namespace EsignMico360.Client.Maui;

/// <summary>Shared access to this PC's local offline copy of the master data,
/// so every page uses the same tested SyncClient engine and the same server URL.</summary>
public static class LocalStore
{
    public static string DeviceId => Environment.MachineName;   // per-PC identity

    public static SyncDbContext NewDb()
    {
        var path = Path.Combine(FileSystem.AppDataDirectory, "esign-local.db");
        var opts = new DbContextOptionsBuilder<SyncDbContext>().UseSqlite($"Data Source={path}").Options;
        var db = new SyncDbContext(opts) { StampVersions = false };   // server owns Versions
        db.Database.EnsureCreated();
        return db;
    }
}
