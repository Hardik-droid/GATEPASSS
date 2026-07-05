using GatepassApi.Models;
using Microsoft.EntityFrameworkCore;

namespace GatepassApi.Data;

public sealed class GatepassDbContext(DbContextOptions<GatepassDbContext> options) : DbContext(options)
{
    public DbSet<AppStateRecord> AppStates => Set<AppStateRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppStateRecord>(entity =>
        {
            entity.ToTable("app_state");
            entity.HasKey(item => item.StateKey);

            entity.Property(item => item.StateKey)
                .HasColumnName("state_key")
                .HasColumnType("text");

            entity.Property(item => item.Payload)
                .HasColumnName("payload")
                .HasColumnType("jsonb")
                .IsRequired();

            entity.Property(item => item.CreatedAt)
                .HasColumnName("created_at")
                .HasColumnType("timestamp with time zone")
                .HasDefaultValueSql("now()");

            entity.Property(item => item.UpdatedAt)
                .HasColumnName("updated_at")
                .HasColumnType("timestamp with time zone")
                .HasDefaultValueSql("now()");

            entity.HasIndex(item => item.UpdatedAt)
                .HasDatabaseName("idx_app_state_updated_at");
        });
    }
}
