using EsignMico360.Sync;
using Microsoft.EntityFrameworkCore;

namespace EsignMico360.Client.Maui;

// Thin GUI over the tested SyncClient engine. All data ops go through SyncClient,
// so offline queueing, watermarks, conflict handling and retry are the same code
// proven by the unit + end-to-end tests.
public partial class MainPage : ContentPage
{
    private readonly string _deviceId = Environment.MachineName;   // per-PC identity

    public MainPage() => InitializeComponent();

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await RefreshListAsync();
    }

    // This PC's local offline copy of the master data.
    private SyncDbContext NewDb()
    {
        var path = Path.Combine(FileSystem.AppDataDirectory, "esign-local.db");
        var opts = new DbContextOptionsBuilder<SyncDbContext>().UseSqlite($"Data Source={path}").Options;
        var db = new SyncDbContext(opts) { StampVersions = false };   // server owns Versions
        db.Database.EnsureCreated();
        return db;
    }

    private string ServerUrl() =>
        string.IsNullOrWhiteSpace(ServerUrlEntry.Text) ? "http://localhost:5080" : ServerUrlEntry.Text.Trim();

    private async Task RefreshListAsync()
    {
        try
        {
            using var db = NewDb();
            using var api = new HttpSyncApi(ServerUrl());
            CompaniesView.ItemsSource = await new SyncClient(db, api, _deviceId).ListCompaniesAsync();
        }
        catch (Exception ex) { Status($"Load error: {ex.Message}"); }
    }

    private async void OnAddClicked(object? sender, EventArgs e)
    {
        var name = NewNameEntry.Text?.Trim();
        if (string.IsNullOrWhiteSpace(name)) return;
        try
        {
            using (var db = NewDb())
            using (var api = new HttpSyncApi(ServerUrl()))
                await new SyncClient(db, api, _deviceId).AddCompanyAsync(name);
            NewNameEntry.Text = string.Empty;
            Status($"Added '{name}' locally (queued for sync).");
            await RefreshListAsync();
        }
        catch (Exception ex) { Status($"Add error: {ex.Message}"); }
    }

    private async void OnSyncClicked(object? sender, EventArgs e)
    {
        try
        {
            Status("Syncing…");
            using var api = new HttpSyncApi(ServerUrl());
            if (!await api.LoginAsync(UsernameEntry.Text?.Trim() ?? "", PasswordEntry.Text ?? ""))
            {
                Status("Login failed — check the server URL and credentials.");
                return;
            }
            using var db = NewDb();
            var result = await new SyncClient(db, api, _deviceId).SyncAsync();
            Status($"Synced ✓  pushed {result.Applied}, conflicts {result.Conflicts}, pulled {result.Pulled}.");
            await RefreshListAsync();
        }
        catch (Exception ex) { Status($"Sync error: {ex.Message}"); }
    }

    private void Status(string message) => StatusLabel.Text = message;
}
