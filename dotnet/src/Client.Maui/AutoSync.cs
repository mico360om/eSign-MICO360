using EsignMico360.Sync;
using Microsoft.Maui.Storage;

namespace EsignMico360.Client.Maui;

/// <summary>
/// Background auto-sync built into the desktop app: on launch, on a timer, and
/// after local changes it logs in with saved credentials and runs a full
/// SyncClient sync — so the app stays in sync without the user pressing a button.
/// Credentials are captured once on the Dashboard (password kept in SecureStorage).
/// </summary>
public static class AutoSync
{
    public const string UserKey = "sync_username";
    private const string PassKey = "sync_password";

    private static IDispatcherTimer? _timer;
    private static bool _busy;

    public static string Status { get; private set; } = "Auto-sync: not signed in";
    public static event Action? StatusChanged;

    public static bool IsConfigured => !string.IsNullOrEmpty(Preferences.Default.Get(UserKey, ""));

    /// <summary>Start the periodic sync loop (once, at app launch).</summary>
    public static void Start(IDispatcher dispatcher, TimeSpan? interval = null)
    {
        if (_timer != null) return;
        _timer = dispatcher.CreateTimer();
        _timer.Interval = interval ?? TimeSpan.FromSeconds(60);
        _timer.Tick += async (_, _) => await RunAsync();
        _timer.Start();
        _ = RunAsync();   // sync immediately on launch
    }

    /// <summary>Save credentials and sync now (called from the Dashboard on connect).</summary>
    public static async Task ConfigureAsync(string username, string password)
    {
        Preferences.Default.Set(UserKey, username);
        try { await SecureStorage.Default.SetAsync(PassKey, password); }
        catch { Preferences.Default.Set(PassKey, password); }   // fallback if SecureStorage is unavailable
        await RunAsync();
    }

    private static async Task<string?> GetPasswordAsync()
    {
        try { var p = await SecureStorage.Default.GetAsync(PassKey); if (!string.IsNullOrEmpty(p)) return p; } catch { }
        var f = Preferences.Default.Get(PassKey, "");
        return string.IsNullOrEmpty(f) ? null : f;
    }

    /// <summary>Run one sync pass now (also used by "Sync now" and after adding a company).</summary>
    public static async Task RunAsync()
    {
        if (_busy) return;
        var user = Preferences.Default.Get(UserKey, "");
        var pass = await GetPasswordAsync();
        if (string.IsNullOrEmpty(user) || string.IsNullOrEmpty(pass))
        {
            Set("Auto-sync: sign in on the Dashboard to enable");
            return;
        }
        _busy = true;
        try
        {
            Set("Syncing…");
            using var api = new HttpSyncApi(ServerConfig.CurrentUrl);
            if (!await api.LoginAsync(user, pass)) { Set("Auto-sync: login failed — check credentials"); return; }
            using var db = LocalStore.NewDb();
            var r = await new SyncClient(db, api, LocalStore.DeviceId).SyncAsync();
            Set($"Auto-synced ✓  pushed {r.Applied}, pulled {r.Pulled}   ({DateTime.Now:HH:mm:ss})");
        }
        catch (Exception ex) { Set($"Auto-sync error: {ex.Message}"); }
        finally { _busy = false; }
    }

    public static void SignOut()
    {
        Preferences.Default.Remove(UserKey);
        Preferences.Default.Remove(PassKey);
        try { SecureStorage.Default.Remove(PassKey); } catch { }
        Set("Auto-sync: not signed in");
    }

    private static void Set(string s) { Status = s; StatusChanged?.Invoke(); }
}
