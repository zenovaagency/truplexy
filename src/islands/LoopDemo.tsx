import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Headset, Sparkles } from 'lucide-react';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { STORE_CHAT, type ChatLine } from '@/data/demo';
import { channel } from '@/data/channels';

/**
 * One conversation with the sample store, played on a loop with no input from
 * the visitor: a product question, a follow-up, then a handoff to a person.
 * Beside the chat, the context Truplexy has gathered fills in as it goes.
 *
 * It only plays while on screen and starts over from the greeting each lap.
 * With reduced motion it shows the finished conversation instead. Nothing
 * here talks to a server; every line comes from STORE_CHAT in demo.ts.
 */

/** The nodes of STORE_CHAT that make up the demo, in order. */
const SCRIPT = ['jacket', 'fit', 'sleeves'];

type Line = { id: number } & (ChatLine | { from: 'customer'; text: string });
type Typing = { from: 'ai' | 'agent'; author?: string } | null;
type Fact = { key: string; value: string };

/** Always-known facts, then the two every conversation fills in. */
const BASE: Fact[] = [
  { key: 'Channel', value: channel(STORE_CHAT.channel).name },
  { key: 'Customer', value: 'Signed in · 3 past orders' },
];
const PENDING: Record<string, string> = { Intent: 'Not yet known', Handoff: 'Not needed' };

const greeting = (): Line[] => [{ id: 0, from: 'ai', text: STORE_CHAT.greeting }];
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
/** Long replies take a little longer to "type". */
const typingTime = (text: string) => Math.min(1500, 650 + text.length * 6);

/** Merge new facts over the old ones by key. */
const merge = (facts: Fact[], items: Fact[]) => {
  const next = [...facts];
  for (const item of items) {
    const i = next.findIndex((x) => x.key === item.key);
    if (i === -1) next.push(item);
    else next[i] = item;
  }
  return next;
};

/** The whole conversation at once, for visitors who prefer reduced motion. */
const finished = () => {
  let id = 1;
  const log: Line[] = greeting();
  let facts: Fact[] = [];
  for (const key of SCRIPT) {
    const node = STORE_CHAT.nodes[key];
    log.push({ id: id++, from: 'customer', text: node.ask });
    for (const line of node.replies) log.push({ ...line, id: id++ });
    facts = merge(facts, node.learns);
  }
  return { log, facts };
};

export default function LoopDemo({ markSrc }: { markSrc: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const run = useRef(0);
  const nextId = useRef(1);

  const [log, setLog] = useState<Line[]>(greeting);
  const [typing, setTyping] = useState<Typing>(null);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [fresh, setFresh] = useState<string[]>([]);
  const [handedOff, setHandedOff] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const done = finished();
      setLog(done.log);
      setFacts(done.facts);
      setHandedOff(true);
      return;
    }

    const push = (line: ChatLine | { from: 'customer'; text: string }) =>
      setLog((l) => [...l, { ...line, id: nextId.current++ }]);

    const reset = () => {
      nextId.current = 1;
      setLog(greeting());
      setTyping(null);
      setFacts([]);
      setFresh([]);
      setHandedOff(false);
    };

    async function play(token: number) {
      const live = () => run.current === token;
      while (live()) {
        reset();
        await sleep(1200);
        for (const key of SCRIPT) {
          if (!live()) return;
          const node = STORE_CHAT.nodes[key];
          push({ from: 'customer', text: node.ask });
          await sleep(500);
          for (const [i, line] of node.replies.entries()) {
            if (!live()) return;
            if (line.from === 'event') {
              await sleep(600);
            } else {
              setTyping({ from: line.from, author: line.author });
              await sleep(typingTime(line.text));
            }
            if (!live()) return;
            setTyping(null);
            push(line);
            // Truplexy has understood the question once it has answered it.
            if (i === 0) {
              setFacts((f) => merge(f, node.learns));
              setFresh(node.learns.map((l) => l.key));
            }
          }
          if (node.handoff) setHandedOff(true);
          await sleep(1400);
        }
        // Hold on the finished conversation before the next lap.
        await sleep(5000);
      }
    }

    // Plays only while on screen; leaving stops it, returning starts a fresh lap.
    const io = new IntersectionObserver(
      ([entry]) => {
        const token = ++run.current;
        if (entry.isIntersecting) play(token);
      },
      { threshold: 0.25 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      run.current++;
    };
  }, []);

  // Keep the newest line in view, scrolling the log itself and never the page.
  useEffect(() => {
    const el = logRef.current;
    if (!el || log.length < 2) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [log, typing]);

  const agent = handedOff ? facts.find((f) => f.key === 'Handoff')?.value.split(' · ')[0] : undefined;

  // Facts in a stable order: the base pair, Intent, whatever was learned, Handoff last.
  const value = (key: string) => facts.find((f) => f.key === key)?.value;
  const rows = [
    ...BASE.map((f) => ({ ...f, pending: false })),
    { key: 'Intent', value: value('Intent') ?? PENDING.Intent, pending: !value('Intent') },
    ...facts.filter((f) => !(f.key in PENDING)).map((f) => ({ ...f, pending: false })),
    { key: 'Handoff', value: value('Handoff') ?? PENDING.Handoff, pending: !value('Handoff') },
  ];

  return (
    <div ref={rootRef} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
      <p className="sr-only">
        A sample conversation with {STORE_CHAT.store}: a customer asks about a jacket and its fit, then asks for the
        sleeves to be shortened. Truplexy answers each question, then brings in a person from the tailoring team with
        the whole conversation attached.
      </p>

      {/* Chat widget */}
      <div className="card pointer-events-none select-none overflow-hidden !rounded-[28px] !shadow-[var(--shadow-lg)]" aria-hidden="true">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="relative flex-none">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface-2">
              <img src={markSrc} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
            </span>
            <span className="live-dot absolute -bottom-0.5 -right-0.5 ring-2 ring-surface" />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold">{STORE_CHAT.store}</p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[0.78rem] text-ink-faint">
              <ChannelIcon id={STORE_CHAT.channel} size={12} />
              {channel(STORE_CHAT.channel).name} · powered by Truplexy
            </p>
          </div>
          <span className="mono text-[0.62rem] text-ink-faint">Sample store</span>
        </div>

        <div ref={logRef} className="flex h-[380px] flex-col gap-2.5 overflow-hidden bg-paper/60 px-4 py-5 sm:h-[420px] sm:px-5">
          {log.map((l) =>
            l.from === 'event' ? (
              <p
                key={l.id}
                className="msg-in my-1 flex items-center gap-1.5 self-center rounded-full bg-human-soft px-3 py-1 text-center text-[0.75rem] font-medium text-human"
              >
                <Headset size={12} strokeWidth={2.2} />
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
            <div className={`bubble bubble-${typing.from} msg-in !py-3`}>
              {typing.author && <span className="mb-1.5 block text-[0.72rem] font-semibold text-ink-faint">{typing.author}</span>}
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>

        <div className="flex min-h-[60px] items-center border-t border-line px-5 py-4">
          <p className="mono text-[0.62rem] text-ink-faint">
            {agent ? (
              <>
                <span className="font-semibold text-human">{agent} has the whole conversation.</span> Nobody repeats a thing.
              </>
            ) : typing ? (
              'Truplexy is replying…'
            ) : (
              'Sample conversation'
            )}
          </p>
        </div>
      </div>

      {/* What Truplexy knows */}
      <aside className="card p-5 sm:p-6">
        <p className="mono flex items-center gap-2 text-ink-faint">
          <Sparkles size={13} strokeWidth={2.2} className="text-accent" aria-hidden="true" />
          What Truplexy knows
        </p>
        <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-muted">
          Fills in as the conversation goes. It’s the same context your team sees, on every channel.
        </p>
        <dl className="mt-4 divide-y divide-line border-y border-line" aria-hidden="true">
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
                  <span className="ml-auto mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-accent" />
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
