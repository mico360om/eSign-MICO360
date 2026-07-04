namespace EsignMico360.Client.Maui;

/// <summary>Shared client config: the default server URL and the key used to
/// persist the user's chosen URL, so MainPage and the AppShell connection
/// monitor always agree on which server to talk to.</summary>
public static class ServerConfig
{
    public const string DefaultUrl = "http://84.247.142.2:5212";
    public const string PrefKey = "server_url";

    /// <summary>The current server URL (user's saved choice, else the default).</summary>
    public static string CurrentUrl => Preferences.Default.Get(PrefKey, DefaultUrl);

    public static void Save(string url) => Preferences.Default.Set(PrefKey, url);
}
