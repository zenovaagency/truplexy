import { indent, PUBLIC_API, type LangPack } from './types';

/** Ruby 3.1+: Sinatra for routes, Net::HTTP for HTTP. */
const pack: LangPack = {
  files: { server: 'app.rb', helper: 'truplexy.rb', webhook: 'webhook.rb', verify: 'verify.rb' },

  helper: `# truplexy.rb — runs on your server only.
# TRUPLEXY_CHAT_KEY lives in your secret manager, never in a browser or app.
require "json"
require "net/http"

module Truplexy
  API = "${PUBLIC_API}"
  # One Truplexy conversation per customer thread. Use your database in production.
  THREADS = {}

  def self.call(path, body = nil)
    res = Net::HTTP.post(URI(API + path), (body || {}).to_json,
                         "Authorization" => "Bearer #{ENV.fetch("TRUPLEXY_CHAT_KEY")}",
                         "Content-Type" => "application/json")
    raise "Truplexy #{res.code}: #{res.body}" unless res.is_a?(Net::HTTPSuccess)
    JSON.parse(res.body)
  end

  def self.ask(thread, text)
    id = THREADS[thread] ||= call("/conversations")["id"]
    r = call("/conversations/#{id}/messages", { message: text[0, 4000] })
    # "escalated" (a person has it) and "context" have no reply: send nothing.
    { reply: r["reply"], status: r["status"], conversation_id: id }
  end

  def self.thread_for(conversation_id) = THREADS.key(conversation_id)

  def self.handoff(conversation_id) = call("/conversations/#{conversation_id}/handoff")
end`,

  verify: `require "openssl"

def verify(raw_body, header, secret)
  parts = header.split(",").filter_map { |p| p.split("=", 2) if p.include?("=") }.to_h
  t, v1 = parts["t"].to_s, parts["v1"].to_s
  return false unless t.match?(/\\A\\d+\\z/) && (Time.now.to_i - t.to_i).abs < 300
  expected = OpenSSL::HMAC.hexdigest("SHA256", secret, "#{t}.#{raw_body}")
  OpenSSL.fixed_length_secure_compare(expected, v1)
rescue ArgumentError   # different lengths
  false
end`,

  receiver: ({ deliver, escalation }) => `require_relative "truplexy"
require_relative "verify"

# Your team acted in Truplexy → act on it here.
post "/truplexy-webhook" do
  raw = request.body.read
  halt 401 unless verify(raw, request.env["HTTP_X_TRUPLEXY_SIGNATURE"].to_s, ENV.fetch("TRUPLEXY_WEBHOOK_SECRET"))
  event = JSON.parse(raw)
  Thread.new { on_event(event) }   # answer within 2.5 seconds
  200
end

def on_event(event)
  data = event["data"]
  conversation_id = data["conversation_id"]${
    deliver
      ? `
  if event["type"] == "message.created"   # your team replied
    text = data.dig("message", "content")
    agent = data.dig("message", "agent") || "Support"
    thread = Truplexy.thread_for(conversation_id)
    ${indent(deliver, '    ')}
  end`
      : ''
  }${
    escalation
      ? `
  if event["type"] == "ticket.updated" && data.dig("ticket", "escalated")
    ticket = data["ticket"]
    ${indent(escalation, '    ')}
  end`
      : ''
  }
end`,

  integrations: {
    shopify: {
      handler: `require "sinatra"
require "openssl"
require "rack/utils"
require_relative "truplexy"

# App Proxy: https://{shop}/apps/support/chat → https://your-server.com/shopify/chat
post "/shopify/chat" do
  halt 401 unless valid_proxy_signature?(request.query_string, ENV.fetch("SHOPIFY_SECRET"))
  body = JSON.parse(request.body.read)
  customer = params["logged_in_customer_id"].to_s.empty? ? body["visitor_id"] : params["logged_in_customer_id"]
  content_type :json
  Truplexy.ask("shop:#{params["shop"]}:#{customer}", body["text"]).to_json
end

# Shopify signs proxy requests: sorted "key=value" pairs, joined without separators.
def valid_proxy_signature?(query, secret)
  pairs = Rack::Utils.parse_query(query)
  signature = pairs.delete("signature").to_s
  message = pairs.sort.map { |k, v| "#{k}=#{Array(v).join(",")}" }.join
  Rack::Utils.secure_compare(OpenSSL::HMAC.hexdigest("SHA256", secret, message), signature)
end`,
      deliver: `# Push to the storefront widget through your own socket or long-poll endpoint.
notify_storefront(thread, from: agent, text: text)`,
    },

    api: {
      file: 'example.rb',
      handler: `require_relative "truplexy"

conv = Truplexy.call("/conversations")
r = Truplexy.call("/conversations/#{conv["id"]}/messages", { message: "Where is my order?" })
puts "#{r["status"]}: #{r["reply"]}"`,
      deliver: `# Deliver the reply to the customer's thread on your platform.
deliver(thread, text, agent)`,
    },
  },
};

export default pack;
