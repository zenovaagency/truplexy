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

    public static async Task<JsonElement> Call(string path, object? body = null)
    {
        using var res = await Http.PostAsJsonAsync(Api + path, body ?? new { });
        if (!res.IsSuccessStatusCode)
            throw new HttpRequestException($"Truplexy {(int)res.StatusCode}: {await res.Content.ReadAsStringAsync()}");
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }

    public static async Task<Answer> Ask(string thread, string text)
    {
        if (!Threads.TryGetValue(thread, out var id))
            Threads[thread] = id = (await Call("/conversations")).GetProperty("id").GetString()!;
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
    discord: {
      file: 'Bot.cs',
      handler: `// dotnet add package Discord.Net — keeps a gateway connection open.
using Discord;
using Discord.WebSocket;

var discord = new DiscordSocketClient(new DiscordSocketConfig
{
    GatewayIntents = GatewayIntents.Guilds | GatewayIntents.GuildMessages | GatewayIntents.DirectMessages | GatewayIntents.MessageContent,
});

discord.MessageReceived += m =>
{
    if (m.Author.IsBot || string.IsNullOrEmpty(m.Content)) return Task.CompletedTask;
    _ = Task.Run(async () =>   // don't block the gateway
    {
        using var typing = m.Channel.EnterTypingState();
        var a = await Truplexy.Ask($"dc:{m.Channel.Id}:{m.Author.Id}", m.Content);
        if (a.Reply is { } reply) await m.Channel.SendMessageAsync(reply, messageReference: new MessageReference(m.Id));
    });
    return Task.CompletedTask;
};

await discord.LoginAsync(TokenType.Bot, Environment.GetEnvironmentVariable("DISCORD_TOKEN"));
await discord.StartAsync();`,
      deliver: `var channelId = ulong.Parse(thread!.Split(':')[1]);
if (await discord.GetChannelAsync(channelId) is IMessageChannel channel)
    await channel.SendMessageAsync($"**{agent}:** {text}");`,
    },

    teams: {
      file: 'SupportBot.cs',
      handler: `// dotnet add package Microsoft.Bot.Builder.Integration.AspNet.Core
using Microsoft.Bot.Builder;
using Microsoft.Bot.Builder.Integration.AspNet.Core;
using Microsoft.Bot.Connector.Authentication;
using Microsoft.Bot.Schema;

public class SupportBot : ActivityHandler
{
    // A reply in an escalation's thread → send it to the customer.
    protected override async Task OnMessageActivityAsync(ITurnContext<IMessageActivity> ctx, CancellationToken ct)
    {
        var a = ctx.Activity;
        var conversationId = await ConversationForTeamsThread(a.Conversation.Id);
        await Truplexy.Call($"/conversations/{conversationId}/replies", new { content = a.Text, author = a.From.Name, external_id = a.Id });
    }
}

// Program.cs
builder.Services.AddSingleton<BotFrameworkAuthentication, ConfigurationBotFrameworkAuthentication>();
builder.Services.AddSingleton<IBotFrameworkHttpAdapter, CloudAdapter>();
builder.Services.AddTransient<IBot, SupportBot>();
app.MapPost("/api/messages", (HttpRequest req, HttpResponse res, IBotFrameworkHttpAdapter adapter, IBot bot) => adapter.ProcessAsync(req, res, bot));`,
      escalation: `var subject = ticket.GetProperty("subject").GetString();
await PostTeamsCard(supportChannel, "Escalated", subject, conversationId);`,
    },

    api: {
      handler: `var conv = await Truplexy.Call("/conversations");
var id = conv.GetProperty("id").GetString();
var r = await Truplexy.Call($"/conversations/{id}/messages", new { message = "Where is my order?" });
Console.WriteLine($"{r.GetProperty("status")}: {r.GetProperty("reply")}");`,
      deliver: `// Deliver the reply to the customer's thread on your platform.
await Deliver(thread, text, agent);`,
    },
  },
};

export default pack;
