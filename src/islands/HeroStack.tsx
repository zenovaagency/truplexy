import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { HERO, type Msg } from '@/data/demo';
import { channel, type ChannelId } from '@/data/channels';

/**
 * The hero's living proof, told as a notification stack: one customer, one
 * order, a website chat that carries on in Telegram twenty minutes later.
 * The newest event lands on top and pushes the older ones back.
 *
 * Server render = the finished stack. That is what no-JS and reduced-motion
 * visitors see. After hydration the stack empties and plays on a loop while
 * it is on screen; a CSS guard (`[data-hero-stack]:not([data-ready])`) keeps the
 * finished render from flashing before that.
 *
 * The visual stack is aria-hidden; screen readers get the whole exchange as
 * an ordered list, which is also where the demo text is marked for the
 * honesty audit (`data-demo`).
 */

type Ev =
  | { kind: 'msg'; msg: Msg }
  | { kind: 'memory'; channel: ChannelId; from: ChannelId; time?: string };

const [webAsk, , , webReply] = HERO.first.messages;
const [tgAsk, tgReply] = HERO.second.messages;

const EVENTS: Ev[] = [
  { kind: 'msg', msg: webAsk },
  { kind: 'msg', msg: webReply },
  { kind: 'msg', msg: tgAsk },
  { kind: 'memory', channel: HERO.second.channel, from: HERO.first.channel, time: tgAsk.time },
  { kind: 'msg', msg: tgReply },
];

/** Vertical offset between stacked cards, and how each slot sits. */
const STEP = 78;
const SLOTS: { y: number; scale: number; opacity: number }[] = [
  { y: 0, scale: 1, opacity: 1 },
  { y: STEP, scale: 0.93, opacity: 0.94 },
  { y: STEP * 2, scale: 0.86, opacity: 0.6 },
  { y: STEP * 2 + 28, scale: 0.8, opacity: 0 }, // leaving
];
const STEP_MS = 2300;
const FIRST_MS = 700;
/** The finished stack holds, then fades out before the loop starts again. */
const HOLD_MS = 4200;
const FADE_MS = 500;

const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2);

function Avatar({ ev, markSrc }: { ev: Ev; markSrc: string }) {
  const isCustomer = ev.kind === 'msg' && ev.msg.from === 'customer';
  const badgeChannel = ev.kind === 'msg' ? ev.msg.channel : null;
  return (
    <span className="relative flex-none">
      {isCustomer ? (
        <span
          className="grid h-10 w-10 place-items-center rounded-full text-[0.8rem] font-bold text-white"
          style={{ background: 'var(--gradient-brand)' }}
        >
          {initials(HERO.customer)}
        </span>
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface-2">
          <img src={markSrc} alt="" width={22} height={22} className="h-[22px] w-[22px]" />
        </span>
      )}
      <span className="absolute -bottom-1 -right-1 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-surface bg-surface shadow-sm">
        {badgeChannel ? (
          <ChannelIcon id={badgeChannel} size={10} />
        ) : (
          <span className="grid h-full w-full place-items-center rounded-full bg-live text-white">
            <Check size={9} strokeWidth={3.5} />
          </span>
        )}
      </span>
    </span>
  );
}

function Card({ ev, markSrc }: { ev: Ev; markSrc: string }) {
  if (ev.kind === 'memory') {
    return (
      <>
        <Avatar ev={ev} markSrc={markSrc} />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-3 text-[0.875rem] leading-tight">
            <span className="truncate">
              <span className="font-semibold text-ink">Context carried over</span>{' '}
              <span className="text-ink-faint">from {channel(ev.from).name}</span>
            </span>
            {ev.time && <span className="flex-none text-[0.72rem] text-ink-faint">{ev.time}</span>}
          </p>
          {/* One row only: on narrow cards the last chip drops out rather than wrapping. */}
          <p className="mt-2 flex h-[22px] flex-wrap gap-1.5 overflow-hidden">
            {HERO.memory.map((m) => (
              <span key={m} className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 text-[0.72rem] font-medium text-accent">
                {m}
              </span>
            ))}
          </p>
        </div>
      </>
    );
  }
  const m = ev.msg;
  return (
    <>
      <Avatar ev={ev} markSrc={markSrc} />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-3 text-[0.875rem] leading-tight">
          <span className="truncate">
            <span className="font-semibold text-ink">{m.from === 'customer' ? HERO.customer : 'Truplexy'}</span>{' '}
            <span className="text-ink-faint">via {channel(m.channel).name}</span>
          </span>
          {m.time && <span className="flex-none text-[0.72rem] text-ink-faint">{m.time}</span>}
        </p>
        <p className="mt-1.5 line-clamp-2 text-[0.84rem] leading-[1.45] text-ink-muted">{m.text}</p>
      </div>
    </>
  );
}

export default function HeroStack({ markSrc, store }: { markSrc: string; store: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [shown, setShown] = useState(EVENTS.length);
  const [visible, setVisible] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Rewind on hydration unless the visitor prefers reduced motion.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      setAnimate(true);
      setShown(0);
    }
    setReady(true);
  }, []);

  // Play only while on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!ready || !animate || !visible) return;
    if (shown < EVENTS.length) {
      const t = window.setTimeout(() => setShown((s) => s + 1), shown === 0 ? FIRST_MS : STEP_MS);
      return () => clearTimeout(t);
    }
    // Finished: hold, fade the stack out, then play it again.
    const t = resetting
      ? window.setTimeout(() => {
          setShown(0);
          setResetting(false);
        }, FADE_MS)
      : window.setTimeout(() => setResetting(true), HOLD_MS);
    return () => clearTimeout(t);
  }, [ready, animate, visible, shown, resetting]);

  const done = shown >= EVENTS.length;
  // Newest first; one extra card stays mounted in the "leaving" slot so it can fade out.
  const stack = EVENTS.slice(Math.max(0, shown - SLOTS.length), shown)
    .map((ev, i, arr) => ({ ev, index: shown - arr.length + i }))
    .reverse();

  return (
    <div ref={rootRef} data-hero-stack data-ready={ready || undefined} className="relative mx-auto w-full max-w-[440px]">
      <div
        className={`relative h-[244px] transition-opacity duration-500 ${resetting ? 'opacity-0' : 'opacity-100'}`}
        aria-hidden="true"
      >
        {stack.map(({ ev, index }, slot) => {
          const s = SLOTS[slot];
          const style: CSSProperties = {
            transform: `translateY(${s.y}px) scale(${s.scale})`,
            opacity: s.opacity,
            zIndex: 10 - slot,
          };
          return (
            <div
              key={index}
              style={style}
              className={`hs-card absolute inset-x-0 top-0 flex h-[90px] origin-top items-start gap-3 overflow-hidden rounded-2xl border border-line bg-surface px-3.5 py-3 text-left shadow-[var(--shadow-md)] transition-[transform,opacity] duration-700 ease-[var(--ease-out-expo)] ${
                animate && slot === 0 ? 'hs-enter' : ''
              }`}
            >
              <Card ev={ev} markSrc={markSrc} />
            </div>
          );
        })}
      </div>

      <ol className="sr-only" aria-label={`Sample conversation between a customer and ${store}, across website chat and Telegram`}>
        {EVENTS.map((ev, i) =>
          ev.kind === 'msg' ? (
            <li key={i} data-demo>
              {ev.msg.from === 'customer' ? HERO.customer : 'Truplexy'} on {channel(ev.msg.channel).name}: {ev.msg.text}
            </li>
          ) : (
            <li key={i} data-demo>
              Context carried over from {channel(ev.from).name}: {HERO.memory.join(', ')}.
            </li>
          ),
        )}
      </ol>

      {/* Caption */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <p
          className={`flex items-center gap-2 text-[0.9rem] font-semibold transition-opacity duration-500 ${
            done && !resetting ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-live-soft text-live">
            <Check size={12} strokeWidth={3} aria-hidden="true" />
          </span>
          Truplexy remembers the conversation.
        </p>
        <span className="mono text-[0.66rem] text-ink-faint">Sample conversation</span>
      </div>
    </div>
  );
}
