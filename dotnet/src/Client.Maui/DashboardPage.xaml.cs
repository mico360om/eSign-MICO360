using EsignMico360.Sync;
using Microsoft.Maui.Storage;

namespace EsignMico360.Client.Maui;

// Sign in once here; AutoSync then keeps this PC in sync automatically.
public partial class DashboardPage : ContentPage
{
    public DashboardPage() => InitializeComponent();

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        ServerUrlEntry.Text = ServerConfig.CurrentUrl;
        UsernameEntry.Text = Preferences.Default.Get(AutoSync.UserKey, "admin");
        AutoSync.StatusChanged += OnAutoSyncStatus;
        OnAutoSyncStatus();
        await RefreshSummaryAsync();
    }

    protected override void OnDisappearing()
    {
        base.OnDisappearing();
        AutoSync.StatusChanged -= OnAutoSyncStatus;
    }

    private void OnAutoSyncStatus() =>
        Dispatcher.Dispatch(async () => { AutoSyncLabel.Text = AutoSync.Status; await RefreshSummaryAsync(); });

    private string ServerUrl()
    {
        var url = string.IsNullOrWhiteSpace(ServerUrlEntry.Text) ? ServerConfig.DefaultUrl : ServerUrlEntry.Text.Trim();
        ServerConfig.Save(url);   // shared with every page + the connection monitor + auto-sync
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

    // Validate the credentials once, then hand them to AutoSync (which stores them
    // and starts syncing automatically).
    private async void OnConnectClicked(object? sender, EventArgs e)
    {
        var user = UsernameEntry.Text?.Trim() ?? "";
        var pass = PasswordEntry.Text ?? "";
        if (string.IsNullOrWhiteSpace(user) || string.IsNullOrEmpty(pass))
        {
            StatusLabel.Text = "Enter a username and password.";
            return;
        }
        try
        {
            StatusLabel.Text = "Connecting…";
            using var api = new HttpSyncApi(ServerUrl());
            if (!await api.LoginAsync(user, pass))
            {
                StatusLabel.Text = "Login failed — check the server URL and credentials.";
                return;
            }
            await AutoSync.ConfigureAsync(user, pass);
            PasswordEntry.Text = string.Empty;   // don't keep it on screen
            StatusLabel.Text = "Connected — auto-sync is on.";
        }
        catch (Exception ex) { StatusLabel.Text = $"Connect error: {ex.Message}"; }
    }

    private async void OnSyncNowClicked(object? sender, EventArgs e) => await AutoSync.RunAsync();
}
