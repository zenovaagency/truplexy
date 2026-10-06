import { indent, PUBLIC_API, type LangPack } from './types';

/** Java 21: java.net.http and Jackson; Spring Boot for the webhook route. */
const pack: LangPack = {
  files: { server: 'Example.java', helper: 'Truplexy.java', webhook: 'TruplexyWebhook.java', verify: 'Verify.java' },

  helper: `// Truplexy.java — runs on your server only.
// TRUPLEXY_CHAT_KEY lives in your secret manager, never in a browser or app.
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class Truplexy {
    private static final String API = "${PUBLIC_API}";
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final ObjectMapper JSON = new ObjectMapper();
    // One Truplexy conversation per customer thread. Use your database in production.
    private static final Map<String, String> THREADS = new ConcurrentHashMap<>();

    /** reply is null for "escalated" and "context": send nothing. */
    public record Answer(String reply, String status, String conversationId) {}

    public static JsonNode call(String path, Object body) throws Exception {
        var req = HttpRequest.newBuilder(URI.create(API + path))
            .timeout(Duration.ofSeconds(60))
            .header("Authorization", "Bearer " + System.getenv("TRUPLEXY_CHAT_KEY"))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body == null ? Map.of() : body)))
            .build();
        var res = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 300) throw new IllegalStateException("Truplexy " + res.statusCode() + ": " + res.body());
        return JSON.readTree(res.body());
    }

    public static Answer ask(String thread, String text) throws Exception {
        String id = THREADS.get(thread);
        if (id == null) {
            id = call("/conversations", null).get("id").asText();
            THREADS.put(thread, id);
        }
        var message = text.length() > 4000 ? text.substring(0, 4000) : text;
        var r = call("/conversations/" + id + "/messages", Map.of("message", message));
        return new Answer(r.path("reply").asText(null), r.get("status").asText(), id);
    }

    public static String threadFor(String conversationId) {
        return THREADS.entrySet().stream()
            .filter(e -> e.getValue().equals(conversationId))
            .map(Map.Entry::getKey)
            .findFirst().orElse(null);
    }

    public static JsonNode handoff(String conversationId) throws Exception {
        return call("/conversations/" + conversationId + "/handoff", null);
    }
}`,

  verify: `import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class Verify {
    public static boolean verify(byte[] rawBody, String header, String secret) throws Exception {
        String t = "", v1 = "";
        for (String part : header.split(",")) {
            String[] kv = part.split("=", 2);
            if (kv.length < 2) continue;
            if (kv[0].equals("t")) t = kv[1];
            if (kv[0].equals("v1")) v1 = kv[1];
        }
        if (!t.matches("\\\\d+") || Math.abs(System.currentTimeMillis() / 1000 - Long.parseLong(t)) >= 300) return false;
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        mac.update((t + ".").getBytes(StandardCharsets.UTF_8));
        String expected = HexFormat.of().formatHex(mac.doFinal(rawBody));
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), v1.getBytes(StandardCharsets.UTF_8));
    }
}`,

  receiver: ({ deliver, escalation }) => `import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// Your team acted in Truplexy → act on it here.
@RestController
class TruplexyWebhook {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final ExecutorService work = Executors.newVirtualThreadPerTaskExecutor();

    @PostMapping("/truplexy-webhook")
    ResponseEntity<Void> receive(@RequestBody byte[] raw,
                                 @RequestHeader(value = "X-Truplexy-Signature", defaultValue = "") String signature) throws Exception {
        if (!Verify.verify(raw, signature, System.getenv("TRUPLEXY_WEBHOOK_SECRET"))) return ResponseEntity.status(401).build();
        JsonNode event = JSON.readTree(raw);
        work.submit(() -> { handle(event); return null; });   // answer within 2.5 seconds
        return ResponseEntity.ok().build();
    }

    private void handle(JsonNode event) throws Exception {
        String type = event.path("type").asText();
        JsonNode data = event.path("data");
        String conversationId = data.path("conversation_id").asText();${
          deliver
            ? `
        if (type.equals("message.created")) {   // your team replied
            String text = data.at("/message/content").asText();
            String agent = data.at("/message/agent").asText("Support");
            String thread = Truplexy.threadFor(conversationId);
            ${indent(deliver, '            ')}
        }`
            : ''
        }${
          escalation
            ? `
        if (type.equals("ticket.updated") && data.at("/ticket/escalated").asBoolean()) {
            JsonNode ticket = data.path("ticket");
            ${indent(escalation, '            ')}
        }`
            : ''
        }
    }
}`,

  integrations: {
    slack: {
      file: 'SlackApp.java',
      handler: `// Bolt for Java: com.slack.api:bolt-jetty
import com.slack.api.bolt.App;
import com.slack.api.bolt.jetty.SlackAppServer;
import com.slack.api.model.event.MessageEvent;
import java.util.Map;
import java.util.Objects;

public class SlackApp {
    static final App slack = new App();   // reads SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET

    public static void main(String[] args) throws Exception {
        // A teammate replied in the escalation's Slack thread → send it to the customer.
        slack.event(MessageEvent.class, (payload, ctx) -> {
            MessageEvent e = payload.getEvent();
            if (e.getThreadTs() == null || e.getBotId() != null || e.getSubtype() != null) return ctx.ack();
            String conversationId = conversationForSlackThread(e.getThreadTs());
            String author = ctx.client().usersInfo(r -> r.user(e.getUser())).getUser().getRealName();
            Truplexy.call("/conversations/" + conversationId + "/replies", Map.of(
                "content", e.getText(),
                "author", author,
                "external_id", Objects.requireNonNullElse(e.getClientMsgId(), e.getTs())));
            return ctx.ack();
        });
        new SlackAppServer(slack).start();   // POST /slack/events on port 3000
    }
}`,
      escalation: `// Post it to #support; replies in its thread come back through the message listener.
var post = SlackApp.slack.client().chatPostMessage(r -> r
    .token(System.getenv("SLACK_BOT_TOKEN"))
    .channel("#support")
    .text("Escalated: " + ticket.path("subject").asText()));
saveSlackThread(post.getTs(), conversationId);`,
    },

    api: {
      handler: `import java.util.Map;

public class Example {
    public static void main(String[] args) throws Exception {
        var conv = Truplexy.call("/conversations", null);
        var r = Truplexy.call("/conversations/" + conv.get("id").asText() + "/messages", Map.of("message", "Where is my order?"));
        System.out.println(r.get("status").asText() + ": " + r.path("reply").asText());
    }
}`,
      deliver: `// Deliver the reply to the customer's thread on your platform.
deliver(thread, text, agent);`,
    },
  },
};

export default pack;
