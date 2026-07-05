using System;
using System.Text.Json;
using GatepassApi.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GatepassApi.Migrations;

[DbContext(typeof(GatepassDbContext))]
[Migration("20260706000000_InitialCreate")]
partial class InitialCreate
{
    protected override void BuildTargetModel(ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasAnnotation("ProductVersion", "8.0.11")
            .HasAnnotation("Relational:MaxIdentifierLength", 63);

        modelBuilder.Entity("GatepassApi.Models.AppStateRecord", b =>
        {
            b.Property<string>("StateKey")
                .HasColumnType("text")
                .HasColumnName("state_key");

            b.Property<DateTime>("CreatedAt")
                .ValueGeneratedOnAdd()
                .HasColumnType("timestamp with time zone")
                .HasColumnName("created_at")
                .HasDefaultValueSql("now()");

            b.Property<JsonDocument>("Payload")
                .IsRequired()
                .HasColumnType("jsonb")
                .HasColumnName("payload");

            b.Property<DateTime>("UpdatedAt")
                .ValueGeneratedOnAdd()
                .HasColumnType("timestamp with time zone")
                .HasColumnName("updated_at")
                .HasDefaultValueSql("now()");

            b.HasKey("StateKey");

            b.HasIndex("UpdatedAt")
                .HasDatabaseName("idx_app_state_updated_at");

            b.ToTable("app_state", (string)null);
        });
    }
}
