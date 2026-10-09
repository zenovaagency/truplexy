/**
 * The smallest Supabase Realtime client that can listen to one broadcast
 * topic (the Phoenix protocol, vsn 1.0.0). Truplexy publishes a
 * conversation's messages and ticket changes on its `conversation_topic`.
 * Each event only says "something changed"; the client refetches history.
 */

export interface RealtimeOptions {
  url: string;
  key: string;
  topic: string;
  onEvent: (event: string) => void;
  /** Called with true once joined, and false when the connection drops. */
  onStatus: (connected: boolean) => void;
}

const HEARTBEAT_MS = 25_000;

export function listenRealtime({ url, key, topic, onEvent, onStatus }: RealtimeOptions): () => void {
  if (typeof WebSocket !== 'function') {
    onStatus(false);
    return () => {};
  }
  const socketUrl = `${url.replace(/^http/, 'ws').replace(/\/$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
  const channel = `realtime:${topic}`;
  let ref = 0;
  let joined = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const ws = new WebSocket(socketUrl);

  const send = (msg: object) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const down = () => {
    clearInterval(heartbeat);
    joined = false;
    onStatus(false);
  };

  ws.onopen = () => {
    const joinRef = String(++ref);
    send({
      topic: channel,
      event: 'phx_join',
      payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [], private: false } },
      ref: joinRef,
      join_ref: joinRef,
    });
    heartbeat = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) }), HEARTBEAT_MS);
  };
  ws.onmessage = (e) => {
    let msg: { topic?: string; event?: string; payload?: any };
    try {
      msg = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (msg.topic !== channel) return;
    if (msg.event === 'phx_reply' && !joined) {
      if (msg.payload?.status === 'ok') {
        joined = true;
        onStatus(true);
      } else ws.close();
    } else if (msg.event === 'broadcast') {
      onEvent(String(msg.payload?.event ?? ''));
    } else if (msg.event === 'phx_error' || msg.event === 'phx_close') {
      ws.close();
    }
  };
  ws.onclose = down;
  ws.onerror = () => ws.close();

  return () => {
    ws.onclose = null;
    clearInterval(heartbeat);
    ws.close();
  };
}
