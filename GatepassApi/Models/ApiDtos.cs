using System.Text.Json;

namespace GatepassApi.Models;

public sealed record StateEnvelope(JsonElement? State);

public sealed record SaveStateRequest(JsonElement State);

public sealed record GoogleLoginRequest(string IdToken);

public sealed record GoogleUserResponse(
    string Id,
    string Name,
    string Email,
    string AvatarUrl);

public sealed record GoogleLoginResponse(
    bool Success,
    GoogleUserResponse User,
    string Token);
