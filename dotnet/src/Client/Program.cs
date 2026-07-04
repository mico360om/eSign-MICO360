using EsignMico360.Sync;
using Microsoft.EntityFrameworkCore;

// Headless sync client — a thin shell over the reusable SyncClient engine (the
// MAUI desktop app uses the same engine). Proves the offline-sync mechanics.
// usage: <serverUrl> <deviceId> <add "Name" | edit <idPrefix> "Name" | list | sync>
if (args.Length < 3)
{
    Console.WriteLine("usage: <serverUrl> <deviceId> <add \"Name\" | edit <idPrefix> \"Name\" | list | sync>");
    return 1;
}

var serverUrl = args[0].TrimEnd('/');
var deviceId = args[1];
var command = args[2].ToLowerInvariant();

// This PC's local offline copy of the master data.
var opts = new DbContextOptionsBuilder<SyncDbContext>().UseSqlite($"Data Source=client-{deviceId}.db").Options;
await using var db = new SyncDbContext(opts) { StampVersions = false };  // server owns Versions
await db.Database.EnsureCreatedAsync();

using var api = new HttpSyncApi(serverUrl);
var client = new SyncClient(db, api, deviceId);

switch (command)
{
    case "add":
    {
        var c = await client.AddCompanyAsync(args.Length > 3 ? args[3] : "Unnamed");
        Console.WriteLine($"ADDED {c.Id} '{c.Name}' (queued offline)");
        break;
    }
    case "edit":
    {
        var prefix = args[3];
        var target = (await client.ListCompaniesAsync()).FirstOrDefault(x => x.Id.ToString().StartsWith(prefix));
        if (target is null) { Console.WriteLine("not found"); return 1; }
        await client.EditCompanyAsync(target.Id, args.Length > 4 ? args[4] : target.Name);
        Console.WriteLine($"EDITED {target.Id} (queued offline)");
        break;
    }
    case "list":
    {
        var items = await client.ListCompaniesAsync();
        foreach (var c in items)
            Console.WriteLine($"{c.Id.ToString()[..8]}  v{c.Version,-3} {c.Name}");
        Console.WriteLine($"TOTAL {items.Count}");
        break;
    }
    case "sync":
    {
        if (!await api.LoginAsync("admin", "Admin@123")) { Console.WriteLine("login failed"); return 1; }
        var r = await client.SyncAsync();
        Console.WriteLine($"PUSH sent={r.Pushed} applied={r.Applied} conflicts={r.Conflicts}");
        Console.WriteLine($"PULL received={r.Pulled} watermark={r.Watermark}");
        break;
    }
    default:
        Console.WriteLine($"unknown command '{command}'");
        return 1;
}
return 0;
