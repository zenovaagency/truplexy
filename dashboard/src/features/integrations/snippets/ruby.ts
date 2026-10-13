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

  class ApiError < StandardError
    attr_reader :status, :code, :request_id, :details
    def initialize(res, error)
      super(error.fetch("message", "Truplexy request failed"))
      @status, @code, @details = res.code.to_i, error.fetch("code", "UPSTREAM_ERROR"), error
      @request_id = error["request_id"] || res["X-Request-ID"]
    end
  end

  def self.call(path, body = nil, method = "POST")
    uri = URI(API + path)
    req = Net::HTTP.const_get(method.capitalize).new(uri)
    req["Authorization"] = "Bearer #{ENV.fetch("TRUPLEXY_CHAT_KEY")}"
    req["Content-Type"] = "application/json"
    req.body = body.to_json unless body.nil?
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", read_timeout: 60) { |http| http.request(req) }
    data = JSON.parse(res.body) rescue {}
    raise ApiError.new(res, data.fetch("error", {})) unless res.is_a?(Net::HTTPSuccess)
    data
  end

  def self.upsert_customer(customer)
    call("/customer", customer, "PUT")
  rescue ApiError => e
    raise unless e.status == 409 && e.code == "CUSTOMER_EXISTS"
    call("/customer", customer, "PUT")
  end

  def self.create_conversation(customer = nil, channel_id = nil)
    opening = {}
    unless customer.nil?
      opening[:customer_id] = upsert_customer(customer).fetch("id")
      raise "Missing customer ID" if opening[:customer_id].to_s.empty?
    end
    opening[:channel_id] = channel_id unless channel_id.nil?
    call("/conversations", opening)
  end

  def self.ask(thread, text, customer = nil, channel_id = nil)
    id = THREADS[thread] ||= create_conversation(customer, channel_id)["id"]
    r = call("/conversations/#{id}/messages", { message: text[0, 4000] })
    # "escalated" and "context" have no reply: send nothing.
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
    api: {
      file: 'example.rb',
      handler: `require_relative "truplexy"

conv = Truplexy.create_conversation({ contacts: [{ type: "app", value: "user-42" }] })
r = Truplexy.call("/conversations/#{conv["id"]}/messages", { message: "Where is my order?" })
puts "#{r["status"]}: #{r["reply"]}"`,
      deliver: `# Deliver the reply to the customer's thread on your platform.
deliver(thread, text, agent)`,
    },
  },
};

export default pack;
