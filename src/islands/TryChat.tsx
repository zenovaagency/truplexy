import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Headset, RotateCcw, Sparkles } from 'lucide-react';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { STORE_CHAT, type ChatLine } from '@/data/demo';
import { channel } from '@/data/channels';

/**
 * A scripted chat with the sample store. The visitor plays the customer and
 * picks what to say from quick-reply buttons; Truplexy answers, takes simple
 * actions and brings in a person when one is needed. Beside the chat, the
 * context Truplexy has gathered fills in as the conversation goes.
 *
 * Server render = the greeting and the opening questions. Nothing here talks
 * to a server; every reply comes from STORE_CHAT in demo.ts.
 */

type Line = { id: number } & (ChatLine | { from: 'customer'; text: string });
type Typing = { from: 'ai' | 'agent'; author?: string } | null;

/** Always-known facts, then the two every conversation fills in. */
const BASE = [
  { key: 'Channel', value: channel(STORE_CHAT.channel).name },
  { key: 'Customer', value: 'Signed in · 3 past orders' },
];
const PENDING: Record<string, string> = { Intent: 'Not yet known', Handoff: 'Not needed' };

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
/** Long replies take a little longer to "type". */
const typingTime = (text: string) => Math.min(1500, 650 + text.length * 6);

const greeting = (): Line[] => [{ id: 0, from: 'ai', text: STORE_CHAT.greeting }];

export default function TryChat({ markSrc }: { markSrc: string }) {
  const logRef = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const nextId = useRef(1);
  const reduced = useRef(false);

  const [log, setLog] = useState<Line[]>(greeting);
  const [typing, setTyping] = useState<Typing>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const [visited, setVisited] = useState<string[]>([]);
  const [facts, setFacts] = useState<{ key: string; value: string }[]>([]);
  const [fresh, setFresh] = useState<string[]>([]);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Anything still playing stops when the island goes away.
    return () => {
      run.current++;
    };
  }, []);

  // Keep the newest line in view, scrolling the log itself and never the page.
  useEffect(() => {
    const el = logRef.current;
    if (!el || log.length < 2) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced.current ? 'auto' : 'smooth' });
  }, [log, typing]);

  const push = (line: ChatLine | { from: 'customer'; text: string }) =>
    setLog((l) => [...l, { ...line, id: nextId.current++ }]);

  const learn = (items: { key: string; value: string }[]) => {
    setFacts((f) => {
      const next = [...f];
      for (const item of items) {
        const i = next.findIndex((x) => x.key === item.key);
        if (i === -1) next.push(item);
        else next[i] = item;
      }
      return next;
    });
    setFresh(items.map((i) => i.key));
  };

  async function ask(id: string) {
    if (busy) return;
    const node = STORE_CHAT.nodes[id];
    const token = ++run.current;
    const live = () => run.current === token;
    const pause = (ms: number) => wait(reduced.current ? 0 : ms);

    setBusy(true);
    push({ from: 'customer', text: node.ask });
    await pause(350);

    for (const [i, line] of node.replies.entries()) {
      if (!live()) return;
      if (line.from === 'event') {
        await pause(600);
      } else {
        setTyping({ from: line.from, author: line.author });
        await pause(typingTime(line.text));
      }
      if (!live()) return;
      setTyping(null);
      push(line);
      // Truplexy has understood the question once it has answered it.
      if (i === 0) learn(node.learns);
    }

    setVisited((v) => [...v, id]);
    setCurrent(id);
    setBusy(false);
  }

  const restart = () => {
    run.current++;
    setLog(greeting());
    setTyping(null);
    setBusy(false);
    setCurrent(null);
    setVisited([]);
    setFacts([]);
    setFresh([]);
  };

  const handedOff = visited.some((id) => STORE_CHAT.nodes[id].handoff);
  const followUps = current ? STORE_CHAT.nodes[current].next.filter((id) => !visited.includes(id)) : [];
  const options = handedOff
    ? []
    : followUps.length
      ? followUps
      : STORE_CHAT.starters.filter((id) => !visited.includes(id));
  const prompt = !current ? 'Ask a question' : followUps.length ? 'Ask a follow-up' : 'Ask something else';
  const agent = handedOff ? facts.find((f) => f.key === 'Handoff')?.value.split(' · ')[0] : undefined;

  // Facts in a stable order: the base pair, Intent, whatever was learned, Handoff last.
  const learned = facts.filter((f) => !(f.key in PENDING));
  const value = (key: string) => facts.find((f) => f.key === key)?.value;
  const rows = [
    ...BASE.map((f) => ({ ...f, pending: false })),
    { key: 'Intent', value: value('Intent') ?? PENDING.Intent, pending: !value('Intent') },
    ...learned.map((f) => ({ ...f, pending: false })),
    { key: 'Handoff', value: value('Handoff') ?? PENDING.Handoff, pending: !value('Handoff') },
  ];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
      {/* Chat widget */}
      <div className="card overflow-hidden !rounded-[28px] !shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="relative flex-none">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface-2">
              <img src={markSrc} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
            </span>
            <span className="live-dot absolute -bottom-0.5 -right-0.5 ring-2 ring-surface" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold">{STORE_CHAT.store}</p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[0.78rem] text-ink-faint">
              <ChannelIcon id={STORE_CHAT.channel} size={12} />
              {channel(STORE_CHAT.channel).name} · powered by Truplexy
            </p>
          </div>
          <span className="mono hidden text-[0.62rem] text-ink-faint sm:block">Sample store</span>
          <button
            type="button"
            onClick={restart}
            aria-label="Start the conversation over"
            className="grid h-9 w-9 flex-none place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink pointer-coarse:w-11"
          >
            <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div
          ref={logRef}
          data-lenis-prevent
          role="log"
          aria-live="polite"
          aria-label={`Conversation with ${STORE_CHAT.store}`}
          className="flex h-[360px] flex-col gap-2.5 overflow-y-auto overscroll-contain bg-paper/60 px-4 py-5 sm:h-[400px] sm:px-5"
        >
          {log.map((l) =>
            l.from === 'event' ? (
              <p
                key={l.id}
                className="msg-in my-1 flex items-center gap-1.5 self-center rounded-full bg-human-soft px-3 py-1 text-center text-[0.75rem] font-medium text-human"
              >
                <Headset size={12} strokeWidth={2.2} aria-hidden="true" />
                {l.text}
              </p>
            ) : (
              <div key={l.id} className={`bubble bubble-${l.from} ${l.id > 0 ? 'msg-in' : ''}`}>
                {l.from === 'agent' && <span className="mb-0.5 block text-[0.72rem] font-semibold text-ink-faint">{l.author}</span>}
                {l.text}
              </div>
            ),
          )}
          {typing && (
            <div className={`bubble bubble-${typing.from} msg-in !py-3`} aria-hidden="true">
              {typing.author && <span className="mb-1.5 block text-[0.72rem] font-semibold text-ink-faint">{typing.author}</span>}
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>

        <div className="min-h-[124px] border-t border-line px-4 py-4 sm:px-5">
          {handedOff ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[0.9rem] text-ink-muted">
                <span className="font-semibold text-ink">{agent} has the whole conversation.</span> That’s the handoff — nobody repeats a thing.
              </p>
              <button
                type="button"
                onClick={restart}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[0.85rem] font-medium text-ink transition-colors hover:border-line-strong"
              >
                <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
                Start over
              </button>
            </div>
          ) : (
            <>
              <p className="mono text-[0.62rem] text-ink-faint">{busy ? 'Truplexy is replying…' : prompt}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {options.map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => ask(id)}
                    className="rounded-full border border-accent/30 bg-accent-soft px-3.5 py-2 text-left text-[0.85rem] font-medium leading-snug text-accent transition-colors hover:bg-btn hover:text-white disabled:pointer-events-none disabled:opacity-50"
                  >
                    {STORE_CHAT.nodes[id].ask}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => ask(STORE_CHAT.person)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-human/30 bg-human-soft px-3.5 py-2 text-[0.85rem] font-medium leading-snug text-human transition-colors hover:border-human/60 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Headset size={14} strokeWidth={2.2} aria-hidden="true" />
                  Talk to a person
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* What Truplexy knows */}
      <aside className="card p-5 sm:p-6" aria-labelledby="try-facts-title">
        <p id="try-facts-title" className="mono flex items-center gap-2 text-ink-faint">
          <Sparkles size={13} strokeWidth={2.2} className="text-accent" aria-hidden="true" />
          What Truplexy knows
        </p>
        <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-muted">
          Fills in as you chat. It’s the same context your team sees, on every channel.
        </p>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {rows.map((r) => (
            <div
              key={`${r.key}:${r.value}`}
              className={`grid grid-cols-[96px_1fr] gap-3 py-2.5 ${!r.pending && fresh.includes(r.key) ? 'msg-in' : ''}`}
            >
              <dt className="mono pt-0.5 text-[0.62rem] text-ink-faint">{r.key}</dt>
              <dd className={`flex items-start gap-2 text-[0.88rem] ${r.pending ? 'text-ink-faint' : 'font-medium text-ink'}`}>
                {r.key === 'Channel' && <ChannelIcon id={STORE_CHAT.channel} size={13} className="mt-1 flex-none" />}
                <span className="min-w-0">{r.value}</span>
                {!r.pending && fresh.includes(r.key) && (
                  <span className="ml-auto mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-accent" aria-hidden="true" />
                )}
              </dd>
            </div>
          ))}
        </dl>
        <a href="#inbox" className="mt-4 inline-flex items-center gap-1.5 text-[0.85rem] font-semibold text-accent hover:underline">
          See where your team reads it
          <ArrowRight size={14} strokeWidth={2.2} aria-hidden="true" />
        </a>
      </aside>
    </div>
  );
}
