using System.Text.Json;

namespace GatepassApi.Models;

public sealed class AppStateRecord
{
    public string StateKey { get; set; } = "default";

    public JsonDocument Payload { get; set; } = JsonDocument.Parse("{}");

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
