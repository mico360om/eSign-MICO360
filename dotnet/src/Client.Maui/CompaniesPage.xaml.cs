using EsignMico360.Sync;

namespace EsignMico360.Client.Maui;

// Manage the local (offline) company list. Add queues a change for the next sync.
public partial class CompaniesPage : ContentPage
{
    public CompaniesPage() => InitializeComponent();

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await RefreshListAsync();
    }

    private async Task RefreshListAsync()
    {
        try
        {
            using var db = LocalStore.NewDb();
            using var api = new HttpSyncApi(ServerConfig.CurrentUrl);
            CompaniesView.ItemsSource = await new SyncClient(db, api, LocalStore.DeviceId).ListCompaniesAsync();
        }
        catch (Exception ex) { StatusLabel.Text = $"Load error: {ex.Message}"; }
    }

    private async void OnAddClicked(object? sender, EventArgs e)
    {
        var name = NewNameEntry.Text?.Trim();
        if (string.IsNullOrWhiteSpace(name)) return;
        try
        {
            using (var db = LocalStore.NewDb())
            using (var api = new HttpSyncApi(ServerConfig.CurrentUrl))
                await new SyncClient(db, api, LocalStore.DeviceId).AddCompanyAsync(name);
            NewNameEntry.Text = string.Empty;
            StatusLabel.Text = $"Added '{name}' — syncing…";
            await RefreshListAsync();
            _ = AutoSync.RunAsync();   // push the new company right away

        }
        catch (Exception ex) { StatusLabel.Text = $"Add error: {ex.Message}"; }
    }
}
