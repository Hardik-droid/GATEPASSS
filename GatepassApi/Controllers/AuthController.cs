using GatepassApi.Models;
using Google.Apis.Auth;
using Microsoft.AspNetCore.Mvc;

namespace GatepassApi.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(IConfiguration configuration) : ControllerBase
{
    [HttpPost("google-login")]
    public async Task<ActionResult<GoogleLoginResponse>> GoogleLogin([FromBody] GoogleLoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.IdToken))
        {
            return BadRequest(new { error = "idToken is required" });
        }

        var clientId = configuration["GoogleAuth:ClientId"];
        if (string.IsNullOrWhiteSpace(clientId))
        {
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "GoogleAuth:ClientId is not configured" });
        }

        GoogleJsonWebSignature.Payload payload;
        try
        {
            payload = await GoogleJsonWebSignature.ValidateAsync(
                request.IdToken,
                new GoogleJsonWebSignature.ValidationSettings
                {
                    Audience = [clientId]
                });
        }
        catch (InvalidJwtException)
        {
            return Unauthorized(new { error = "Invalid Google ID token" });
        }

        if (payload.EmailVerified != true)
        {
            return Unauthorized(new { error = "Google email is not verified" });
        }

        var user = new GoogleUserResponse(
            payload.Subject,
            string.IsNullOrWhiteSpace(payload.Name) ? payload.Email : payload.Name,
            payload.Email,
            payload.Picture ?? string.Empty);

        return Ok(new GoogleLoginResponse(
            true,
            user,
            $"gp_session_{payload.Subject}"));
    }
}
