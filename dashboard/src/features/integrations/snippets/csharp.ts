import { indent, PUBLIC_API, type LangPack } from './types';

/** C# / .NET 8: ASP.NET Core minimal APIs and HttpClient. */
const pack: LangPack = {
  files: { server: 'Program.cs', helper: 'Truplexy.cs', webhook: 'Webhook.cs', verify: 'Verify.cs' },

  helper: `// Truplexy.cs — runs on your server only.
// TRUPLEXY_CHAT_KEY lives in your secret manager, never in a browser or app.
using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;

public static class Truplexy
{
    const string Api = "${PUBLIC_API}";

    static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromSeconds(60),
        DefaultRequestHeaders = { Authorization = new("Bearer", Environment.GetEnvironmentVariable("TRUPLEXY_CHAT_KEY")) },
    };

    // One Truplexy conversation per customer thread. Use your database in production.
    static readonly ConcurrentDictionary<string, string> Threads = new();

    /// <summary>Reply is null for "escalated" and "context": send nothing.</summary>
    public record Answer(string? Reply, string Status, string ConversationId);

    public sealed class ApiError(int status, JsonElement details, string? requestId) : Exception(details.TryGetProperty("message", out var m) ? m.GetString() : "Truplexy request failed")
    {
        public int Status { get; } = status;
        public JsonElement Details { get; } = details;
        public string Code { get; } = details.TryGetProperty("code", out var c) ? c.GetString()! : "UPSTREAM_ERROR";
        public string? RequestId { get; } = details.TryGetProperty("request_id", out var r) ? r.GetString() : requestId;
    }
    public static async Task<JsonElement> Call(string path, object? body = null, string method = "POST")
    {
        using var req = new HttpRequestMessage(new HttpMethod(method), Api + path);
        if (body is not null) req.Content = JsonContent.Create(body);
        using var res = await Http.SendAsync(req);
        JsonElement data;
        try { data = await res.Content.ReadFromJsonAsync<JsonElement>(); }
        catch (JsonException) { data = JsonSerializer.SerializeToElement(new { }); }
        if (!res.IsSuccessStatusCode) {
            var details = data.TryGetProperty("error", out var error) ? error : JsonSerializer.SerializeToElement(new { });
            throw new ApiError((int)res.StatusCode, details, res.Headers.TryGetValues("X-Request-ID", out var ids) ? ids.FirstOrDefault() : null);
        }
        return data;
    }

    public static async Task<JsonElement> UpsertCustomer(object customer)
    {
        try { return await Call("/customer", customer, "PUT"); }
        catch (ApiError e) when (e.Status == 409 && e.Code == "CUSTOMER_EXISTS") { return await Call("/customer", customer, "PUT"); }
    }
    public static async Task<JsonElement> CreateConversation(object? customer = null, string? channelId = null)
    {
        var opening = new Dictionary<string, string>();
        if (customer is not null) opening["customer_id"] = (await UpsertCustomer(customer)).GetProperty("id").GetString()!;
        if (channelId is not null) opening["channel_id"] = channelId;
        return await Call("/conversations", opening);
    }
    public static async Task<Answer> Ask(string thread, string text, object? customer = null, string? channelId = null)
    {
        if (!Threads.TryGetValue(thread, out var id))
            Threads[thread] = id = (await CreateConversation(customer, channelId)).GetProperty("id").GetString()!;
        var message = text.Length > 4000 ? text[..4000] : text;
        var r = await Call($"/conversations/{id}/messages", new { message });
        return new Answer(r.GetProperty("reply").GetString(), r.GetProperty("status").GetString()!, id);
    }

    public static string? ThreadFor(string conversationId) =>
        Threads.FirstOrDefault(t => t.Value == conversationId).Key;

    public static Task<JsonElement> Handoff(string conversationId) => Call($"/conversations/{conversationId}/handoff");
}`,

  verify: `using System.Security.Cryptography;
using System.Text;

public static class Webhook
{
    public static bool Verify(byte[] rawBody, string header, string secret)
    {
        var parts = header.Split(',')
            .Select(p => p.Split('=', 2))
            .Where(p => p.Length == 2)
            .GroupBy(p => p[0])
            .ToDictionary(g => g.Key, g => g.First()[1]);
        if (!parts.TryGetValue("t", out var t) || !long.TryParse(t, out var ts) || !parts.TryGetValue("v1", out var v1)) return false;
        if (Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - ts) >= 300) return false;
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var expected = Convert.ToHexString(hmac.ComputeHash([.. Encoding.UTF8.GetBytes(t + "."), .. rawBody])).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(v1));
    }
}`,

  receiver: ({ deliver, escalation }) => `// Your team acted in Truplexy → act on it here.
app.MapPost("/truplexy-webhook", async (HttpRequest req) =>
{
    using var buffer = new MemoryStream();
    await req.Body.CopyToAsync(buffer);
    var raw = buffer.ToArray();
    var secret = Environment.GetEnvironmentVariable("TRUPLEXY_WEBHOOK_SECRET")!;
    if (!Webhook.Verify(raw, req.Headers["X-Truplexy-Signature"].ToString(), secret)) return Results.Unauthorized();
    var evt = JsonDocument.Parse(raw).RootElement.Clone();
    _ = Task.Run(() => OnEvent(evt));   // answer within 2.5 seconds
    return Results.Ok();
});

async Task OnEvent(JsonElement evt)
{
    var type = evt.GetProperty("type").GetString();
    var data = evt.GetProperty("data");
    var conversationId = data.GetProperty("conversation_id").GetString()!;${
      deliver
        ? `
    if (type == "message.created")   // your team replied
    {
        var message = data.GetProperty("message");
        var text = message.GetProperty("content").GetString()!;
        var agent = message.TryGetProperty("agent", out var a) && a.GetString() is { } name ? name : "Support";
        var thread = Truplexy.ThreadFor(conversationId);
        ${indent(deliver, '        ')}
    }`
        : ''
    }${
      escalation
        ? `
    if (type == "ticket.updated" && data.GetProperty("ticket").TryGetProperty("escalated", out var esc) && esc.GetBoolean())
    {
        var ticket = data.GetProperty("ticket");
        ${indent(escalation, '        ')}
    }`
        : ''
    }
}`,

  integrations: {
    api: {
      handler: `var conv = await Truplexy.CreateConversation(new { contacts = new[] { new { type = "app", value = "user-42" } } });
var id = conv.GetProperty("id").GetString();
var r = await Truplexy.Call($"/conversations/{id}/messages", new { message = "Where is my order?" });
Console.WriteLine($"{r.GetProperty("status")}: {r.GetProperty("reply")}");`,
      deliver: `// Deliver the reply to the customer's thread on your platform.
await Deliver(thread, text, agent);`,
    },
  },
};

export default pack;
