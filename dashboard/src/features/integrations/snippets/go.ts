import { indent, PUBLIC_API, type IntegrationCode, type LangPack } from './types';

/** Go 1.22+: net/http with method patterns, standard library only (plus discordgo for Discord). */

/** Meta's Messenger and Instagram webhooks share a shape. */
const meta = (route: string, prefix: string, tokenEnv: string, skipEcho: boolean): IntegrationCode => ({
  handler: `http.HandleFunc("POST /${route}", func(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Entry []struct {
			Messaging []struct {
				Sender  struct{ ID string }
				Message struct {
					Text   string
					IsEcho bool \`json:"is_echo"\`
				}
			}
		}
	}
	json.NewDecoder(r.Body).Decode(&body)
	w.WriteHeader(http.StatusOK)   // answer Meta at once
	go func() {
		for _, e := range body.Entry {
			for _, ev := range e.Messaging {
				if ev.Message.Text == ""${skipEcho ? ' || ev.Message.IsEcho' : ''} {
					continue
				}
				if a, err := ask("${prefix}:"+ev.Sender.ID, ev.Message.Text); err == nil && a.Reply != "" {
					sendMeta(ev.Sender.ID, a.Reply)
				}
			}
		}
	}()
})

func sendMeta(id, text string) error {
	return sendJSON("POST", "https://graph.facebook.com/v21.0/me/messages?access_token="+os.Getenv("${tokenEnv}"),
		map[string]any{"recipient": map[string]string{"id": id}, "message": map[string]string{"text": text}}, nil)
}`,
  deliver: `sendMeta(strings.TrimPrefix(thread, "${prefix}:"), text)`,
});

const pack: LangPack = {
  note: 'Register the http.HandleFunc routes inside main(); the functions sit beside it in package main.',
  files: { server: 'main.go', helper: 'truplexy.go', webhook: 'webhook.go', verify: 'verify.go' },

  helper: `// truplexy.go — runs on your server only.
// TRUPLEXY_CHAT_KEY lives in your secret manager, never in a browser or app.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"
)

const truplexyAPI = "${PUBLIC_API}"

var httpClient = &http.Client{Timeout: 60 * time.Second}

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
		return fmt.Errorf("%s answered %d: %s", url, res.StatusCode, msg)
	}
	if len(out) == 0 {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(out[0])
}

func call(path string, body, out any) error {
	auth := map[string]string{"Authorization": "Bearer " + os.Getenv("TRUPLEXY_CHAT_KEY")}
	if out == nil {
		return sendJSON("POST", truplexyAPI+path, body, auth)
	}
	return sendJSON("POST", truplexyAPI+path, body, auth, out)
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

func ask(thread, text string) (Answer, error) {
	mu.Lock()
	id, ok := threads[thread]
	mu.Unlock()
	if !ok {
		var conv struct {
			ID string \`json:"id"\`
		}
		if err := call("/conversations", map[string]any{}, &conv); err != nil {
			return Answer{}, err
		}
		id = conv.ID
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
      handler: `// POST /chat  {"visitorId", "text"} from your widget
http.HandleFunc("POST /chat", func(w http.ResponseWriter, r *http.Request) {
	var in struct{ VisitorID, Text string }
	json.NewDecoder(r.Body).Decode(&in)
	a, err := ask("web:"+in.VisitorID, in.Text)
	if err != nil {
		http.Error(w, "try again", http.StatusBadGateway)
		return
	}
	json.NewEncoder(w).Encode(a)
})

// The widget's "Talk to a person" button
http.HandleFunc("POST /chat/handoff", func(w http.ResponseWriter, r *http.Request) {
	var in struct{ ConversationID string }
	json.NewDecoder(r.Body).Decode(&in)
	if err := handoff(in.ConversationID); err != nil {
		http.Error(w, "try again", http.StatusBadGateway)
	}
})`,
      deliver: `// Push the reply to the open widget, e.g. over your own WebSocket hub.
hub.Send(thread, map[string]string{"from": agent, "text": text})`,
    },

    whatsapp: {
      handler: `http.HandleFunc("GET /whatsapp", func(w http.ResponseWriter, r *http.Request) {   // Meta's verification handshake
	q := r.URL.Query()
	if q.Get("hub.verify_token") != os.Getenv("WA_VERIFY_TOKEN") {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	io.WriteString(w, q.Get("hub.challenge"))
})

http.HandleFunc("POST /whatsapp", func(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Entry []struct {
			Changes []struct {
				Value struct {
					Messages []struct {
						From, Type string
						Text       struct{ Body string }
					}
				}
			}
		}
	}
	json.NewDecoder(r.Body).Decode(&body)
	w.WriteHeader(http.StatusOK)   // answer Meta at once
	go func() {
		for _, e := range body.Entry {
			for _, c := range e.Changes {
				for _, m := range c.Value.Messages {
					if m.Type != "text" {
						continue
					}
					if a, err := ask("wa:"+m.From, m.Text.Body); err == nil && a.Reply != "" {
						sendWhatsApp(m.From, a.Reply)
					}
				}
			}
		}
	}()
})

func sendWhatsApp(to, body string) error {
	return sendJSON("POST", "https://graph.facebook.com/v21.0/"+os.Getenv("WA_PHONE_ID")+"/messages",
		map[string]any{"messaging_product": "whatsapp", "to": to, "text": map[string]string{"body": body}},
		map[string]string{"Authorization": "Bearer " + os.Getenv("WA_TOKEN")})
}`,
      deliver: `sendWhatsApp(strings.TrimPrefix(thread, "wa:"), text)`,
    },

    telegram: {
      handler: `http.HandleFunc("POST /telegram", func(w http.ResponseWriter, r *http.Request) {
	var update struct {
		Message struct {
			Text string
			Chat struct{ ID int64 }
		}
	}
	json.NewDecoder(r.Body).Decode(&update)
	w.WriteHeader(http.StatusOK)
	m := update.Message
	if m.Text == "" {
		return
	}
	go func() {
		chat := strconv.FormatInt(m.Chat.ID, 10)
		if a, err := ask("tg:"+chat, m.Text); err == nil && a.Reply != "" {
			sendTelegram(chat, a.Reply)
		}
	}()
})

func sendTelegram(chatID, text string) error {
	return sendJSON("POST", "https://api.telegram.org/bot"+os.Getenv("TELEGRAM_TOKEN")+"/sendMessage",
		map[string]string{"chat_id": chatID, "text": text}, nil)
}`,
      deliver: `sendTelegram(strings.TrimPrefix(thread, "tg:"), agent+": "+text)`,
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
		a, err := ask("dc:"+m.ChannelID+":"+m.Author.ID, m.Content)
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

    messenger: meta('messenger', 'fb', 'FB_PAGE_TOKEN', false),
    instagram: meta('instagram', 'ig', 'IG_PAGE_TOKEN', true),

    email: {
      handler: `http.HandleFunc("POST /inbound-email", func(w http.ResponseWriter, r *http.Request) {
	var mail struct{ From, Subject, TextBody, MessageID string }   // Postmark's fields
	json.NewDecoder(r.Body).Decode(&mail)
	w.WriteHeader(http.StatusOK)
	go func() {
		a, err := ask("mail:"+mail.From, mail.Subject+"\\n\\n"+mail.TextBody)
		if err == nil && a.Reply != "" {
			sendEmail(mail.From, "Re: "+mail.Subject, a.Reply, mail.MessageID)
		}
	}()
})`,
      deliver: `sendEmail(strings.TrimPrefix(thread, "mail:"), "Re: your request", text, "")`,
    },

    hubspot: {
      handler: `type hsMessage struct{ Text, Direction, ChannelID, ChannelAccountID string }

var lastChannel sync.Map   // thread → its channel, for your team's replies

func hubspot(method, path string, body, out any) error {
	return sendJSON(method, "https://api.hubapi.com/conversations/v3/conversations/threads/"+path, body,
		map[string]string{"Authorization": "Bearer " + os.Getenv("HUBSPOT_TOKEN")}, out)
}

http.HandleFunc("POST /hubspot", func(w http.ResponseWriter, r *http.Request) {
	var events []struct {
		ObjectID  int64
		MessageID string
	}
	json.NewDecoder(r.Body).Decode(&events)
	w.WriteHeader(http.StatusOK)
	go func() {
		for _, e := range events {
			thread := strconv.FormatInt(e.ObjectID, 10)
			var msg hsMessage
			if hubspot("GET", thread+"/messages/"+e.MessageID, nil, &msg) != nil || msg.Direction != "INCOMING" {
				continue
			}
			lastChannel.Store(thread, msg)
			if a, err := ask("hs:"+thread, msg.Text); err == nil && a.Reply != "" {
				hubspotSend(thread, a.Reply)
			}
		}
	}()
})

func hubspotSend(thread, text string) error {
	v, _ := lastChannel.Load(thread)
	ch, _ := v.(hsMessage)
	return hubspot("POST", thread+"/messages", map[string]string{
		"type": "MESSAGE", "text": text, "senderActorId": os.Getenv("HS_ACTOR"),
		"channelId": ch.ChannelID, "channelAccountId": ch.ChannelAccountID,
	}, nil)
}`,
      deliver: `hubspotSend(strings.TrimPrefix(thread, "hs:"), text)`,
    },

    zendesk: {
      handler: `http.HandleFunc("POST /zendesk", func(w http.ResponseWriter, r *http.Request) {
	var in struct {
		TicketID    string \`json:"ticket_id"\`
		Description string
	}   // fields from your trigger's JSON body
	json.NewDecoder(r.Body).Decode(&in)
	w.WriteHeader(http.StatusOK)
	go func() {
		a, err := ask("zd:"+in.TicketID, in.Description)
		if err == nil && a.Reply != "" && a.Status == "answered" {
			zendeskComment(in.TicketID, a.Reply)
		}
	}()
})

func zendeskComment(ticketID, text string) error {
	auth := base64.StdEncoding.EncodeToString([]byte(os.Getenv("ZENDESK_EMAIL") + "/token:" + os.Getenv("ZENDESK_TOKEN")))
	return sendJSON("PUT", "https://"+os.Getenv("ZENDESK_SUBDOMAIN")+".zendesk.com/api/v2/tickets/"+ticketID,
		map[string]any{"ticket": map[string]any{"comment": map[string]any{"body": text, "public": true}}},
		map[string]string{"Authorization": "Basic " + auth})
}`,
      deliver: `zendeskComment(strings.TrimPrefix(thread, "zd:"), text)`,
    },

    api: {
      handler: `func main() {
	var conv struct{ ID string }
	if err := call("/conversations", map[string]any{}, &conv); err != nil {
		log.Fatal(err)
	}
	var r struct {
		Status, Reply string
		Sources       []map[string]any
	}
	if err := call("/conversations/"+conv.ID+"/messages", map[string]string{"message": "Where is my order?"}, &r); err != nil {
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
