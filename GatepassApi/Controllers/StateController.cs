using System.Text.Json;
using GatepassApi.Data;
using GatepassApi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GatepassApi.Controllers;

[ApiController]
[Route("api/state")]
public sealed class StateController(GatepassDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<StateEnvelope>> Get()
    {
        var record = await db.AppStates.AsNoTracking()
            .FirstOrDefaultAsync(item => item.StateKey == "default");

        return Ok(new StateEnvelope(record?.Payload.RootElement.Clone()));
    }

    [HttpPut]
    public async Task<IActionResult> Put([FromBody] SaveStateRequest request)
    {
        var now = DateTime.UtcNow;
        var payload = JsonDocument.Parse(request.State.GetRawText());
        var record = await db.AppStates.FirstOrDefaultAsync(item => item.StateKey == "default");

        if (record is null)
        {
            db.AppStates.Add(new AppStateRecord
            {
                StateKey = "default",
                Payload = payload,
                CreatedAt = now,
                UpdatedAt = now
            });
        }
        else
        {
            record.Payload = payload;
            record.UpdatedAt = now;
        }

        await db.SaveChangesAsync();
        return NoContent();
    }
}
