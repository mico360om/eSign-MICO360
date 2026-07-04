using EsignMico360.Sync;

namespace EsignMico360.Client.Maui;

public partial class AppShell : Shell
{
    private IDispatcherTimer? _timer;

    public AppShell()
    {
        InitializeComponent();
        StartConnectionMonitor();
    }

    // Poll the server's /api/health every few seconds and reflect reachability
    // in the flyout footer (green = connected, red = disconnected).
    private void StartConnectionMonitor()
    {
        _timer = Dispatcher.CreateTimer();
        _timer.Interval = TimeSpan.FromSeconds(5);
        _timer.Tick += async (_, _) => await CheckAsync();
        _timer.Start();
        _ = CheckAsync();   // first check immediately, don't wait 5s
    }

    private async Task CheckAsync()
    {
        bool ok;
        try
        {
            using var api = new HttpSyncApi(ServerConfig.CurrentUrl);
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(4));
            ok = await api.PingAsync(cts.Token);
        }
        catch { ok = false; }

        // Tick runs on the UI thread, so we can touch the labels directly.
        StatusDot.TextColor = ok ? Color.FromArgb("#2ECC71") : Color.FromArgb("#E74C3C");
        StatusText.Text = ok ? "Connected" : "Disconnected";
    }
}
