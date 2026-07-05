using GatepassApi.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddPolicy("GatepassCors", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "http://localhost:3000",
                "https://gatepasss.vercel.app")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var connectionString = ResolveConnectionString(builder.Configuration);
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Database connection is not configured. Set ConnectionStrings__DefaultConnection, DATABASE_URL, DATABASE_PUBLIC_URL, or the PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD Railway variables.");
}

builder.Services.AddDbContext<GatepassDbContext>(options =>
    options.UseNpgsql(connectionString));

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

app.UseCors("GatepassCors");
app.MapControllers();

app.MapGet("/", () => Results.Ok(new
{
    service = "GatePass API",
    status = "Running"
}));

app.MapGet("/health", async (GatepassDbContext db) =>
{
    await db.Database.ExecuteSqlRawAsync("SELECT 1");
    return Results.Ok(new
    {
        status = "Healthy",
        database = "Connected",
        timestamp = DateTimeOffset.UtcNow
    });
});

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<GatepassDbContext>();
    db.Database.Migrate();
}

app.Run();

static string? ResolveConnectionString(IConfiguration configuration)
{
    var configured = configuration.GetConnectionString("DefaultConnection");
    if (!string.IsNullOrWhiteSpace(configured))
    {
        return configured;
    }

    var databaseUrl = FirstConfigured(configuration["DATABASE_URL"], configuration["DATABASE_PUBLIC_URL"]);
    if (!string.IsNullOrWhiteSpace(databaseUrl))
    {
        return ToNpgsqlConnectionString(databaseUrl);
    }

    var host = configuration["PGHOST"];
    var port = configuration["PGPORT"];
    var database = configuration["PGDATABASE"];
    var username = configuration["PGUSER"];
    var password = configuration["PGPASSWORD"];

    if (string.IsNullOrWhiteSpace(host) ||
        string.IsNullOrWhiteSpace(port) ||
        string.IsNullOrWhiteSpace(database) ||
        string.IsNullOrWhiteSpace(username) ||
        string.IsNullOrWhiteSpace(password))
    {
        return null;
    }

    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = host,
        Port = int.TryParse(port, out var parsedPort) ? parsedPort : 5432,
        Database = database,
        Username = username,
        Password = password,
        SslMode = SslMode.Require
    };

    return builder.ConnectionString;
}

static string ToNpgsqlConnectionString(string value)
{
    if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
        (uri.Scheme != "postgres" && uri.Scheme != "postgresql"))
    {
        return value;
    }

    var userInfo = uri.UserInfo.Split(':', 2);
    var builder = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port > 0 ? uri.Port : 5432,
        Database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/')),
        Username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : null,
        Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
        SslMode = SslMode.Require
    };

    return builder.ConnectionString;
}

static string? FirstConfigured(params string?[] values)
{
    return values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
