import { indent, PUBLIC_API, type LangPack } from './types';

/** Go 1.22+: net/http with method patterns, standard library only (plus discordgo for Discord). */

const pack: LangPack = {
  note: 'Register the http.HandleFunc routes inside main(); the functions sit beside it in package main.',
  files: { server: 'main.go', helper: 'truplexy.go', webhook: 'webhook.go', verify: 'verify.go' },

  helper: `// truplexy.go — runs on your server only.
// TRUPLEXY_CHAT_KEY lives in your secret manager, never in a browser or app.
package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

const truplexyAPI = "${PUBLIC_API}"

var httpClient = &http.Client{Timeout: 60 * time.Second}

type APIError struct {
    Status int
    Code, Message, RequestID string
    Details map[string]any
}
func (e *APIError) Error() string { return e.Code + ": " + e.Message }

// sendJSON calls an API with a JSON body, decoding the answer into out when given.
func sendJSON(method, url string, body any, headers map[string]string, out ...any) error {
	var payload io.Reader = http.NoBody
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		payload = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, url, payload)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		msg, _ := io.ReadAll(res.Body)
        var data struct { Error map[string]any }
        json.Unmarshal(msg, &data)
        code, _ := data.Error["code"].(string)
        message, _ := data.Error["message"].(string)
        requestID, _ := data.Error["request_id"].(string)
        if requestID == "" { requestID = res.Header.Get("X-Request-ID") }
        return &APIError{res.StatusCode, code, message, requestID, data.Error}
	}
	if len(out) == 0 {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(out[0])
}

func call(path string, body, out any) error { return callMethod("POST", path, body, out) }
func callMethod(method, path string, body, out any) error {
	auth := map[string]string{"Authorization": "Bearer " + os.Getenv("TRUPLEXY_CHAT_KEY")}
	if out == nil {
		return sendJSON(method, truplexyAPI+path, body, auth)
	}
	return sendJSON(method, truplexyAPI+path, body, auth, out)
}

func upsertCustomer(customer map[string]any) (string, error) {
    var result struct { ID string }
    err := callMethod("PUT", "/customer", customer, &result)
    if e, ok := err.(*APIError); ok && e.Status == 409 && e.Code == "CUSTOMER_EXISTS" {
        err = callMethod("PUT", "/customer", customer, &result)
    }
    if err == nil && result.ID == "" { err = &APIError{Status: 502, Code: "UPSTREAM_ERROR", Message: "Missing customer ID"} }
    return result.ID, err
}
type ConversationOptions struct { Customer map[string]any; ChannelID string }
func identify(kind, value string) ConversationOptions {
    return ConversationOptions{Customer: map[string]any{"contacts": []map[string]string{{"type": kind, "value": value}}}}
}
func createConversation(options ConversationOptions) (string, error) {
    opening := map[string]string{}
    if options.ChannelID != "" { opening["channel_id"] = options.ChannelID }
    if options.Customer != nil {
        id, err := upsertCustomer(options.Customer)
        if err != nil { return "", err }
        opening["customer_id"] = id
    }
    var result struct { ID string }
    err := call("/conversations", opening, &result)
    return result.ID, err
}

// One Truplexy conversation per customer thread. Use your database in production.
var (
	mu      sync.Mutex
	threads = map[string]string{}
)

func threadFor(conversationID string) string {
	mu.Lock()
	defer mu.Unlock()
	for t, c := range threads {
		if c == conversationID {
			return t
		}
	}
	return ""
}

type Answer struct {
	Reply          string \`json:"reply"\` // empty for "escalated" and "context": send nothing
	Status         string \`json:"status"\`
	ConversationID string \`json:"conversationId"\`
}

func ask(thread, text string, options ...ConversationOptions) (Answer, error) {
	mu.Lock()
	id, ok := threads[thread]
	mu.Unlock()
	if !ok {
        option := ConversationOptions{}
        if len(options) > 0 { option = options[0] }
        var err error
        id, err = createConversation(option)
        if err != nil { return Answer{}, err }
		mu.Lock()
		threads[thread] = id
		mu.Unlock()
	}
	if r := []rune(text); len(r) > 4000 {
		text = string(r[:4000])
	}
	var a Answer
	err := call("/conversations/"+id+"/messages", map[string]string{"message": text}, &a)
	a.ConversationID = id
	return a, err
}

func handoff(conversationID string) error {
	return call("/conversations/"+conversationID+"/handoff", map[string]any{}, nil)
}`,

  verify: `package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"time"
)

func verify(rawBody []byte, header, secret string) bool {
	var t, v1 string
	for _, part := range strings.Split(header, ",") {
		k, v, _ := strings.Cut(part, "=")
		switch k {
		case "t":
			t = v
		case "v1":
			v1 = v
		}
	}
	ts, err := strconv.ParseInt(t, 10, 64)
	if err != nil || max(time.Now().Unix()-ts, ts-time.Now().Unix()) >= 300 {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(t + "."))
	mac.Write(rawBody)
	return hmac.Equal([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(v1))
}`,

  receiver: ({ deliver }) => `// Your team replied in Truplexy → deliver it on the platform.
http.HandleFunc("POST /truplexy-webhook", func(w http.ResponseWriter, r *http.Request) {
	raw, _ := io.ReadAll(r.Body)
	if !verify(raw, r.Header.Get("X-Truplexy-Signature"), os.Getenv("TRUPLEXY_WEBHOOK_SECRET")) {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	w.WriteHeader(http.StatusOK)   // answer within 2.5 seconds
	var event struct {
		Type string \`json:"type"\`
		Data struct {
			ConversationID string \`json:"conversation_id"\`
			Message        struct{ Content, Agent string }
		}
	}
	if json.Unmarshal(raw, &event) != nil || event.Type != "message.created" {
		return
	}
	agent := event.Data.Message.Agent
	if agent == "" {
		agent = "Support"
	}
	go deliver(threadFor(event.Data.ConversationID), event.Data.Message.Content, agent)
})

func deliver(thread, text, agent string) {
	${indent(deliver ?? '// Send text to the customer\'s thread on your platform.', '\t')}
}`,

  integrations: {
    web: {
      file: 'widget.go',
      standalone: true,
      handler: `// widget.go — the route the Truplexy widget talks to. In main():
//
//	http.HandleFunc("POST /api/truplexy", widgetHandler)
//
// Standard library only. TRUPLEXY_CHAT_KEY stays on this server.
package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const widgetAPI = "${PUBLIC_API}"

var (
	widgetClient = &http.Client{Timeout: 60 * time.Second}
	sessionRe    = regexp.MustCompile(\`^(conv_[0-9a-f]{32})\\.(\\d+)$\`)
	b64          = base64.RawURLEncoding
)

// Sessions: a signed conversation ID the visitor's browser keeps. No database needed.
func sessionMAC(payload []byte) []byte {
	secret := os.Getenv("TRUPLEXY_SESSION_SECRET")
	if secret == "" {
		secret = os.Getenv("TRUPLEXY_CHAT_KEY")
	}
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(payload)
	return h.Sum(nil)
}

func signSession(conv string) string {
	payload := []byte(fmt.Sprintf("%s.%d", conv, time.Now().Unix()))
	return b64.EncodeToString(payload) + "." + b64.EncodeToString(sessionMAC(payload))
}

// verifySession returns the conversation ID of a valid, unexpired session, or "".
func verifySession(token string) string {
	p, s, _ := strings.Cut(token, ".")
	payload, err1 := b64.DecodeString(p)
	sig, err2 := b64.DecodeString(s)
	if err1 != nil || err2 != nil || !hmac.Equal(sig, sessionMAC(payload)) {
		return ""
	}
	m := sessionRe.FindStringSubmatch(string(payload))
	if m == nil {
		return ""
	}
	issued, _ := strconv.ParseInt(m[2], 10, 64)
	if age := time.Since(time.Unix(issued, 0)); age < -5*time.Minute || age > 30*24*time.Hour {
		return ""
	}
	return m[1]
}

type upstreamError struct{ code, requestID string; status int }

func (e *upstreamError) Error() string { return e.code }

func widgetCall(method, path string, body any) (map[string]any, error) {
    out, err := widgetRequest(method, path, body)
    if e, ok := err.(*upstreamError); ok && method == "PUT" && path == "/customer" && e.status == 409 && e.code == "CUSTOMER_EXISTS" {
        return widgetRequest(method, path, body)
    }
    return out, err
}
func widgetRequest(method, path string, body any) (map[string]any, error) {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req, _ := http.NewRequest(method, widgetAPI+path, &buf)
	req.Header.Set("Authorization", "Bearer "+os.Getenv("TRUPLEXY_CHAT_KEY"))
	req.Header.Set("Content-Type", "application/json")
	res, err := widgetClient.Do(req)
	if err != nil {
		return nil, &upstreamError{code: "UPSTREAM_ERROR"}
	}
	defer res.Body.Close()
	var out map[string]any
	json.NewDecoder(res.Body).Decode(&out)
	if res.StatusCode >= 300 {
		e := &upstreamError{code: "UPSTREAM_ERROR", requestID: res.Header.Get("X-Request-ID"), status: res.StatusCode}
		if apiErr, ok := out["error"].(map[string]any); ok {
			if c, ok := apiErr["code"].(string); ok {
				e.code = c
			}
		}
		if res.StatusCode == http.StatusUnauthorized {
			e.code = "NOT_CONFIGURED"
		}
		return nil, e
	}
	return out, nil
}

// publicConversation is what the visitor may see: no background "[Context only" messages.
func publicConversation(conv map[string]any) map[string]any {
	messages := []map[string]any{}
	list, _ := conv["messages"].([]any)
	for _, raw := range list {
		m, _ := raw.(map[string]any)
		if content, _ := m["content"].(string); m["role"] == "user" && strings.HasPrefix(content, "[Context only") {
			continue
		}
		keep := map[string]any{}
		for _, k := range []string{"id", "role", "content", "author", "agent", "created_at"} {
			if v, ok := m[k]; ok {
				keep[k] = v
			}
		}
		messages = append(messages, keep)
	}
	return map[string]any{"status": conv["status"], "escalated": conv["escalated"], "messages": messages}
}

var emailRe = regexp.MustCompile(\`^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$\`)

// parseCustomer reads the widget's details form. A missing form is fine; an unusable one is not.
func parseCustomer(raw any) (name, email string, ok bool) {
	if raw == nil {
		return "", "", true
	}
	m, isMap := raw.(map[string]any)
	if !isMap {
		return "", "", false
	}
	name, _ = m["name"].(string)
	email, _ = m["email"].(string)
	name, email = strings.TrimSpace(name), strings.TrimSpace(email)
	if name == "" || utf8.RuneCountInString(name) > 120 || len(email) > 254 || !emailRe.MatchString(email) {
		return "", "", false
	}
	return name, email, true
}

// Customize with your authenticated server session; nil falls back to the form.
func resolveCustomer(r *http.Request) (map[string]any, error) { return nil, nil }

func startWidgetConversation(r *http.Request, raw any) (string, map[string]any, error) {
    identity, err := resolveCustomer(r)
    if err != nil { return "", nil, err }
    name, email := "", ""
    if identity == nil {
        var ok bool
        name, email, ok = parseCustomer(raw)
        if !ok { return "", nil, &upstreamError{code: "INVALID_REQUEST"} }
        if name != "" { identity = map[string]any{"name": name, "contacts": []map[string]string{{"type": "email", "value": email}}} }
    } else { name, _ = identity["name"].(string) }
    opening := map[string]string{}
    if channel := os.Getenv("TRUPLEXY_CHANNEL_ID"); channel != "" { opening["channel_id"] = channel }
    if identity != nil {
        customer, err := widgetCall("PUT", "/customer", identity)
        if err != nil { return "", nil, err }
        id, _ := customer["id"].(string)
        if id == "" { return "", nil, &upstreamError{code: "UPSTREAM_ERROR"} }
        opening["customer_id"] = id
    }
    c, err := widgetCall("POST", "/conversations", opening)
    if err != nil { return "", nil, err }
    conv, _ := c["id"].(string)
    return conv, openTicket(conv, name, email), nil
}

// openTicket tells the assistant who is chatting and opens a ticket for the team. The chat works without either.
func openTicket(conv, name, email string) map[string]any {
	subject := "Website chat"
	if name != "" {
		widgetCall("POST", "/conversations/"+conv+"/messages", map[string]string{"message": "[Context only] Customer: " + name + " <" + email + ">"})
		subject = "Chat with " + name
	}
	t, err := widgetCall("POST", "/conversations/"+conv+"/ticket", map[string]string{"subject": subject})
	if err != nil {
		return nil
	}
	return map[string]any{"id": t["id"], "subject": t["subject"], "status": t["status"]}
}

type widgetError struct {
	status  int
	message string
}

// Messages the visitor sees. Never pass on the API's own message.
var widgetErrors = map[string]widgetError{
    "CUSTOMER_CONFLICT": {409, "Your contact details could not be linked. Please contact support."},
    "CUSTOMER_EXISTS": {409, "Your contact details could not be saved. Please try again."},
    "NOT_CONFIGURED": {500, "Chat is not set up correctly."},
    "TENANT_SUSPENDED": {503, "Chat is turned off right now."},
	"INVALID_REQUEST":    {400, "Check your message, name and email."},
	"CHANNEL_DISABLED":   {503, "Chat is turned off right now."},
	"PLAN_LIMIT_REACHED": {503, "The assistant can't reply right now. Please try again later."},
	"LLM_RATE_LIMITED":   {429, "The assistant is busy. Please try again in a moment."},
	"LLM_TIMEOUT":        {504, "The reply took too long. Please try again."},
}

func widgetHandler(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action, Session, Text string
		Customer              any
	}
	json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in)
	conv := verifySession(in.Session)
	w.Header().Set("Content-Type", "application/json")
	reply := func(v any) { json.NewEncoder(w).Encode(v) }
	fail := func(err error) {
        e, ok := err.(*upstreamError)
        if !ok { e = &upstreamError{code: "UPSTREAM_ERROR"} }
        known, ok := widgetErrors[e.code]
		if !ok {
			e.code, known = "UPSTREAM_ERROR", widgetError{502, "Chat is unavailable right now."}
		}
		w.WriteHeader(known.status)
		reply(map[string]any{"error": map[string]string{"code": e.code, "message": known.message, "request_id": e.requestID}})
	}

	switch in.Action {
	case "message":
		text := strings.TrimSpace(in.Text)
		if text == "" || utf8.RuneCountInString(text) > 4000 || strings.HasPrefix(text, "[Context only") {
			fail(&upstreamError{code: "INVALID_REQUEST"})
			return
		}
        var ticket map[string]any
        if conv == "" {
            var err error
            conv, ticket, err = startWidgetConversation(r, in.Customer)
            if err != nil { fail(err); return }
        }
        res, err := widgetCall("POST", "/conversations/"+conv+"/messages", map[string]string{"message": text})
        if e, ok := err.(*upstreamError); ok && e.code == "CONVERSATION_NOT_FOUND" && verifySession(in.Session) != "" {
            conv, ticket, err = startWidgetConversation(r, in.Customer)
            if err == nil { res, err = widgetCall("POST", "/conversations/"+conv+"/messages", map[string]string{"message": text}) }
        }
        if err != nil { fail(err); return }
		out := map[string]any{"session": signSession(conv), "message": res["message"], "reply": res["reply"], "status": res["status"], "sources": res["sources"]}
		if ticket != nil {
			out["ticket"] = ticket
		}
		reply(out)

	case "history", "handoff":
		if conv == "" {
			if in.Action == "history" {
				reply(map[string]any{"session": nil})
			} else {
				fail(&upstreamError{code: "INVALID_REQUEST"})
			}
			return
		}
		method, path := "GET", "/conversations/"+conv
		if in.Action == "handoff" {
			method, path = "POST", path+"/handoff"
		}
		c, err := widgetCall(method, path, nil)
		if e, ok := err.(*upstreamError); ok && e.code == "CONVERSATION_NOT_FOUND" && in.Action == "history" {
			reply(map[string]any{"session": nil})
			return
		}
		if err != nil {
			fail(err)
			return
		}
		reply(map[string]any{"session": signSession(conv), "conversation": publicConversation(c)})

	case "profile":
		// The business and bot name and picture; the widget shows them in its header.
		p, err := widgetCall("GET", "/profile", nil)
		if err != nil {
			fail(err)
			return
		}
		business, _ := p["business"].(map[string]any)
		bot, _ := p["bot"].(map[string]any)
		reply(map[string]any{
			"business": map[string]any{"name": business["name"], "logo_url": business["logo_url"]},
			"bot":      map[string]any{"id": bot["id"], "name": bot["name"], "avatar_url": bot["avatar_url"]},
		})

	case "live":
		out := map[string]any{}
		if conv != "" {
			// Only the conversation's own topic: bot_topic carries every customer's messages.
            t, err := widgetCall("POST", "/realtime/token", map[string]string{"conversation_id": conv})
            if err != nil {
                if e, ok := err.(*upstreamError); !ok || e.code != "REALTIME_NOT_CONFIGURED" { fail(err); return }
            } else {
                for _, k := range []string{"url", "publishable_key", "conversation_topic"} {
					if v, ok := t[k]; ok {
						out[k] = v
					}
				}
			}
		}
		reply(out)

	default:
		fail(&upstreamError{code: "INVALID_REQUEST"})
	}
}`,
    },

    telegram: {
      handler: `http.HandleFunc("POST /telegram", func(w http.ResponseWriter, r *http.Request) {
	var update struct {
		Message struct {
			Text string
			Chat struct{ ID int64 }
            From struct{ ID int64 }
            SenderChat any \`json:"sender_chat"\`
		}
	}
	json.NewDecoder(r.Body).Decode(&update)
	w.WriteHeader(http.StatusOK)
	m := update.Message
	if m.Text == "" || m.From.ID == 0 || m.SenderChat != nil {
		return
	}
	go func() {
		chat := strconv.FormatInt(m.Chat.ID, 10)
		if a, err := ask("tg:"+chat+":"+strconv.FormatInt(m.From.ID, 10), m.Text, identify("telegram", strconv.FormatInt(m.From.ID, 10))); err == nil && a.Reply != "" {
			sendTelegram(chat, a.Reply)
		}
	}()
})

func sendTelegram(chatID, text string) error {
	return sendJSON("POST", "https://api.telegram.org/bot"+os.Getenv("TELEGRAM_TOKEN")+"/sendMessage",
		map[string]string{"chat_id": chatID, "text": text}, nil)
}`,
      deliver: `sendTelegram(strings.Split(thread, ":")[1], agent+": "+text)`,
    },

    discord: {
      handler: `// go get github.com/bwmarrin/discordgo — keeps a gateway connection open.
var discord *discordgo.Session

func startDiscord() error {
	dg, err := discordgo.New("Bot " + os.Getenv("DISCORD_TOKEN"))
	if err != nil {
		return err
	}
	dg.Identify.Intents = discordgo.IntentsGuildMessages | discordgo.IntentsDirectMessages | discordgo.IntentMessageContent
	dg.AddHandler(func(s *discordgo.Session, m *discordgo.MessageCreate) {
		if m.Author.Bot || m.Content == "" {
			return
		}
		s.ChannelTyping(m.ChannelID)
		a, err := ask("dc:"+m.ChannelID+":"+m.Author.ID, m.Content, identify("discord", m.Author.ID))
		if err == nil && a.Reply != "" {
			s.ChannelMessageSendReply(m.ChannelID, a.Reply, m.Reference())
		}
	})
	discord = dg
	return dg.Open()
}`,
      deliver: `channelID := strings.Split(thread, ":")[1]
discord.ChannelMessageSend(channelID, "**"+agent+":** "+text)`,
    },

    email: {
      handler: `http.HandleFunc("POST /inbound-email", func(w http.ResponseWriter, r *http.Request) {
	var mail struct{ From, Subject, TextBody, MessageID string }   // Postmark's fields
	json.NewDecoder(r.Body).Decode(&mail)
	w.WriteHeader(http.StatusOK)
	go func() {
		a, err := ask("mail:"+mail.From, mail.Subject+"\\n\\n"+mail.TextBody, identify("email", mail.From))
		if err == nil && a.Reply != "" {
			sendEmail(mail.From, "Re: "+mail.Subject, a.Reply, mail.MessageID)
		}
	}()
})`,
      deliver: `sendEmail(strings.TrimPrefix(thread, "mail:"), "Re: your request", text, "")`,
    },

    api: {
      handler: `func main() {
    conversationID, err := createConversation(identify("app", "user-42"))
    if err != nil { log.Fatal(err) }
	var r struct {
		Status, Reply string
		Sources       []map[string]any
	}
	if err := call("/conversations/"+conversationID+"/messages", map[string]string{"message": "Where is my order?"}, &r); err != nil {
		log.Fatal(err)
	}
	fmt.Println(r.Status, r.Reply, len(r.Sources))
}`,
      deliver: `// Deliver the reply to the customer's thread on your platform.
sendToCustomer(thread, agent, text)`,
    },
  },
};

export default pack;
