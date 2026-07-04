using System.Security.Claims;
using System.Text;
using EsignMico360.Shared;
using EsignMico360.Sync;
using EsignMico360.Sync.Entities;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// Run as a Windows Service when started by the Service Control Manager;
// a no-op when launched as a normal console app.
builder.Host.UseWindowsService();

// ── Configuration (env/appsettings overridable) ──
var provider = builder.Configuration["Database:Provider"] ?? "sqlite";              // "sqlite" | "postgres" | "sqlserver"
var conn = builder.Configuration.GetConnectionString("Default");
var jwtKey = builder.Configuration["Jwt:Key"] ?? "eSignMico360-dev-signing-key-change-in-production!!";
const string jwtIssuer = "eSignMico360";

builder.Services.AddDbContext<SyncDbContext>(opt =>
{
    if (provider.Equals("postgres", StringComparison.OrdinalIgnoreCase) || provider.Equals("postgresql", StringComparison.OrdinalIgnoreCase))
    {
        // Accept UTC DateTimes uniformly across providers (the model uses DateTime.UtcNow).
        AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
        opt.UseNpgsql(conn ?? "Host=localhost;Port=5432;Database=esignmico360;Username=postgres;Password=postgres");
    }
    else if (provider.Equals("sqlserver", StringComparison.OrdinalIgnoreCase))
        opt.UseSqlServer(conn ?? "Server=localhost;Database=EsignMico360;Trusted_Connection=True;TrustServerCertificate=True");
    else
        opt.UseSqlite(conn ?? "Data Source=server.db");
});
builder.Services.AddScoped<ServerSyncService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtIssuer,
        ValidateAudience = false,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
        ValidateLifetime = true,
    });
builder.Services.AddAuthorization();

var app = builder.Build();

// ── Create schema + seed an admin user and one company (master data on the server) ──
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<SyncDbContext>();
    db.Database.EnsureCreated();
    if (!db.Users.Any())
    {
        // Initial admin can be set from config (Seed:AdminUsername / Seed:AdminPassword)
        // so deployments don't ship with the well-known default credential.
        var seedUser = builder.Configuration["Seed:AdminUsername"] ?? "admin";
        var seedPass = builder.Configuration["Seed:AdminPassword"] ?? "Admin@123";
        db.Users.Add(new AppUser { Username = seedUser, PasswordHash = PasswordHasher.Hash(seedPass), Role = "Admin" });
        db.SaveChanges();
    }
    if (!db.Companies.Any())
    {
        db.Companies.Add(new Company { Name = "Head Office", Description = "Seeded master record" });
        db.SaveChanges();
    }
}

app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", utc = DateTime.UtcNow }));

app.MapPost("/api/auth/login", async (LoginDto dto, SyncDbContext db) =>
{
    var user = await db.Users.FirstOrDefaultAsync(u => u.Username == dto.Username && !u.IsDeleted);
    if (user is null || !PasswordHasher.Verify(dto.Password, user.PasswordHash))
        return Results.Unauthorized();
    return Results.Ok(new { token = IssueToken(user, jwtKey, jwtIssuer), user = new { user.Id, user.Username, user.Role } });
});

// Sync endpoints require a valid token (clients only reach data when authenticated).
app.MapPost("/api/sync/companies/pull", async (PullDto dto, ServerSyncService svc) =>
    Results.Ok(await svc.PullAsync<Company>(dto.SinceVersion, dto.BatchSize <= 0 ? 500 : dto.BatchSize)))
   .RequireAuthorization();

app.MapPost("/api/sync/companies/push", async (PushRequest<Company> req, ServerSyncService svc) =>
    Results.Ok(await svc.PushAsync(req)))
   .RequireAuthorization();

app.Run();

static string IssueToken(AppUser user, string key, string issuer)
{
    var descriptor = new SecurityTokenDescriptor
    {
        Issuer = issuer,
        Subject = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(ClaimTypes.Role, user.Role),
        }),
        Expires = DateTime.UtcNow.AddHours(8),
        SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256),
    };
    return new JsonWebTokenHandler().CreateToken(descriptor);
}

record LoginDto(string Username, string Password);
record PullDto(long SinceVersion, int BatchSize);
