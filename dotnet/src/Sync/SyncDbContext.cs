using EsignMico360.Shared;
using EsignMico360.Sync.Entities;
using Microsoft.EntityFrameworkCore;

namespace EsignMico360.Sync;

/// <summary>A single-row counter that hands out strictly-increasing change stamps.</summary>
public class SyncSequence
{
    public int Id { get; set; } = 1;
    public long NextValue { get; set; } = 1;
}

/// <summary>
/// DbContext shared by the server and (local copy) the client. On every save it
/// stamps changed <see cref="SyncEntity"/> rows with a fresh, monotonic Version
/// and UpdatedAtUtc — that Version is what drives delta sync.
/// </summary>
public class SyncDbContext : DbContext
{
    public SyncDbContext(DbContextOptions<SyncDbContext> options) : base(options) { }

    /// <summary>
    /// Server assigns authoritative Versions (true). The client keeps the
    /// server-assigned Version on its local copy, so it sets this false.
    /// </summary>
    public bool StampVersions { get; set; } = true;

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<SyncSequence> SyncSequences => Set<SyncSequence>();
    // Client-only tables (empty/unused on the server): watermark + outbox.
    public DbSet<SyncState> SyncStates => Set<SyncState>();
    public DbSet<PendingChange> PendingChanges => Set<PendingChange>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<SyncSequence>().HasData(new SyncSequence { Id = 1, NextValue = 1 });
        b.Entity<Company>().HasIndex(c => c.Version);   // fast "changed since watermark" queries
        b.Entity<AppUser>().HasIndex(u => u.Username).IsUnique();
        b.Entity<AppUser>().HasIndex(u => u.Version);
        b.Entity<SyncState>().HasKey(s => s.EntityName);
        b.Entity<PendingChange>().HasKey(p => p.EntityId);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampChanges();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken ct = default)
    {
        StampChanges();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, ct);
    }

    /// <summary>Assign a monotonic Version + UpdatedAtUtc to every added/modified sync row.</summary>
    private void StampChanges()
    {
        if (!StampVersions) return;   // client keeps server-authoritative Versions
        var entries = ChangeTracker.Entries<SyncEntity>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified)
            .ToList();
        if (entries.Count == 0) return;

        var seq = SyncSequences.Single();  // tracked → its increment saves in the same transaction
        foreach (var e in entries)
        {
            e.Entity.UpdatedAtUtc = DateTime.UtcNow;
            e.Entity.Version = seq.NextValue++;
        }
    }
}
