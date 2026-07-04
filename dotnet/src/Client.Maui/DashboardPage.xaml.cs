using EsignMico360.Sync;

namespace EsignMico360.Client.Maui;

// Server connection + sync. All data ops go through the tested SyncClient engine.
public partial class DashboardPage : ContentPage
{
    public DashboardPage() => InitializeComponent();

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        ServerUrlEntry.Text = ServerConfig.CurrentUrl;   // restore saved/default server
        await RefreshSummaryAsync();
    }

    private string ServerUrl()
    {
        var url = string.IsNullOrWhiteSpace(ServerUrlEntry.Text) ? ServerConfig.DefaultUrl : ServerUrlEntry.Text.Trim();
        ServerConfig.Save(url);   // share the chosen server with the other pages + the connection monitor
        return url;
    }

    private async Task RefreshSummaryAsync()
    {
        try
        {
            using var db = LocalStore.NewDb();
            using var api = new HttpSyncApi(ServerUrl());
            var list = await new SyncClient(db, api, LocalStore.DeviceId).ListCompaniesAsync();
            SummaryLabel.Text = $"{list.Count} companies in the local copy.";
        }
        catch (Exception ex) { SummaryLabel.Text = $"Load error: {ex.Message}"; }
    }

    private async void OnSyncClicked(object? sender, EventArgs e)
    {
        try
        {
            StatusLabel.Text = "Syncing…";
            using var api = new HttpSyncApi(ServerUrl());
            if (!await api.LoginAsync(UsernameEntry.Text?.Trim() ?? "", PasswordEntry.Text ?? ""))
            {
                StatusLabel.Text = "Login failed — check the server URL and credentials.";
                return;
            }
            using var db = LocalStore.NewDb();
            var r = await new SyncClient(db, api, LocalStore.DeviceId).SyncAsync();
            StatusLabel.Text = $"Synced ✓  pushed {r.Applied}, conflicts {r.Conflicts}, pulled {r.Pulled}.";
            await RefreshSummaryAsync();
        }
        catch (Exception ex) { StatusLabel.Text = $"Sync error: {ex.Message}"; }
    }
}
