/** Shared by the public docs and dashboard. Contract: API_REFERENCE.md, Chat API. */
export const CHAT_API_ENDPOINTS = [
  ['GET', '/profile', 'getProfile()', 'Business and bot names and pictures.'],
  ['PUT', '/customer', 'upsertCustomer(input)', 'Find or create a customer by contacts; 200 existing, 201 new.'],
  ['POST', '/conversations', 'createConversation(input?)', 'Start a conversation with optional customer_id and channel_id.'],
  ['GET', '/conversations/{id}', 'getConversation(id)', 'Read the latest 200 messages, oldest first.'],
  ['POST', '/conversations/{id}/messages', 'sendMessage(id, text)', 'Send 1–4000 characters; inspect status and nullable reply.'],
  ['POST', '/conversations/{id}/handoff', 'handoff(id)', 'Flag for the team; the AI keeps replying.'],
  ['POST', '/conversations/{id}/escalate', 'escalate(id)', 'Open or escalate a ticket; the AI goes silent.'],
  ['POST', '/conversations/{id}/resume', 'resume(id)', 'End escalation; the ticket stays open. Safe to repeat.'],
  ['POST', '/conversations/{id}/ticket', 'createTicket(id, input?)', 'Open or return the open ticket; optional subject and priority.'],
  ['POST', '/conversations/{id}/ticket/close', 'closeTicket(id)', 'Close the ticket, end escalation, clear handoff; 404 if none ever existed.'],
  ['POST', '/conversations/{id}/replies', 'sendReply(id, input)', 'Record a staff reply; external_id deduplicates retries (201 or 200).'],
  ['POST', '/realtime/token', 'getRealtimeToken(id?)', 'Server topics; give the browser only its conversation_topic.'],
] as const;

export const CUSTOMER_RULES = [
  'Send 1–20 contacts as {type, value, label?, primary?}, with optional name and metadata. Names allow 120 characters; metadata must be a JSON object up to 4 KB.',
  'Contact types are 2–32 lowercase letters, digits, hyphens or underscores, starting with a letter. Values allow 1–254 characters; labels allow 60.',
  'Emails are lowercased. Phone numbers lose spaces, dashes, dots and parentheses and must contain 5–20 digits, optionally beginning with +. Other values keep their case.',
  'Each contact belongs to one customer within one bot. Mark at most one primary contact per type; otherwise the first becomes primary. Existing primary flags survive an upsert.',
  'An upsert finds any matching contact, adds missing contacts, updates supplied name and metadata, and marks the customer seen. Omit optional fields to preserve them.',
  'Send properties to set the bot’s custom properties by key: keys sent replace their value, null clears one, and unknown keys are refused. Sensitive properties are never returned to a chat key.',
  'Send avatar_url, an https link to the person’s picture on your platform, to give them a picture. It is copied once per link, never replaces a picture your team uploaded, and a link that fails leaves the picture unchanged.',
  'CUSTOMER_CONFLICT means the contacts belong to different customers: nothing is changed. Resolve it in Customers. CUSTOMER_EXISTS is a race: the SDK and helpers retry once.',
  'Pass the returned id as customer_id when starting a conversation. Tickets inherit that customer and the conversation’s channel. Existing conversations are not relinked.',
] as const;
