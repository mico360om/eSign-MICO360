using EsignMico360.Shared;

namespace EsignMico360.Sync.Entities;

/// <summary>Server-side auth master data (PBKDF2-hashed password).</summary>
public class AppUser : SyncEntity
{
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "User";
}
