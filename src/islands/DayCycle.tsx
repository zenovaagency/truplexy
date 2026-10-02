import { useEffect, useRef, useState } from 'react';
import { Clock, Headset, Moon, Pause, Play, Sun } from 'lucide-react';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { BUSINESS_HOURS, DAY, type DayMoment, type Msg, type TeamState } from '@/data/demo';
import { channel } from '@/data/channels';

/**
 * One day of support, played on a loop. A clock marker travels a 24-hour
 * rail; at each moment the team's status flips, Truplexy's never does, and
 * the conversation from that hour plays in the chat window beside it.
 *
 * The rail runs 6 AM → 6 AM, so the day reads left to right and the overnight
 * moment comes last. Moments are clickable; a pause button stops the loop.
 *
 * Server render = the first moment, finished. That is what no-JS and
 * reduced-motion visitors see, and they can still pick a moment. The chat
 * window is aria-hidden; screen readers get every moment as an ordered list,
 * marked `data-demo` for the honesty audit.
 */

const DAY_START = 6;
/** Position on the rail, 0–100. */
const pos = (hour: number) => (((hour - DAY_START + 24) % 24) / 24) * 100;
const isDaytime = (hour: number) => hour >= DAY_START && hour < 18;

const TICKS = [
  { at: 0, label: '6 AM' },
  { at: 25, label: '12 PM' },
  { at: 50, label: '6 PM' },
  { at: 75, label: '12 AM' },
  { at: 100, label: '6 AM' },
];

const TICK_MS = 100;
const LEAD_MS = 500;
/** Pause before the customer's next message, as if they read the reply. */
const READ_MS = 1500;
const GAP_MS = 400;
const TYPING_MS = 1100;
const EVENT_MS = 900;
const HOLD_MS = 3200;

type Item =
  | { kind: 'msg'; msg: Msg; at: number; typed: boolean }
  | { kind: 'join'; author: string; packet?: DayMoment['packet']; at: number }
  | { kind: 'note'; text: string; at: number };

/** When each line of a moment appears, in ms from the start of the moment. */
function schedule(m: DayMoment) {
  const items: Item[] = [];
  let t = 0;
  let joined = false;
  m.messages.forEach((msg, i) => {
    if (msg.from === 'agent' && !joined) {
      joined = true;
      t += EVENT_MS;
      items.push({ kind: 'join', author: msg.author ?? 'Support', packet: m.packet, at: t });
    }
    if (msg.from === 'customer') t += i === 0 ? LEAD_MS : READ_MS;
    else t += GAP_MS + TYPING_MS;
    items.push({ kind: 'msg', msg, at: t, typed: msg.from !== 'customer' });
  });
  if (m.note) {
    t += EVENT_MS;
    items.push({ kind: 'note', text: m.note, at: t });
  }
  return { items, done: t, total: t + HOLD_MS };
}

const PLAN = DAY.map(schedule);

const TEAM: Record<TeamState, { label: string; dot: string }> = {
  online: { label: 'Online', dot: 'bg-live' },
  busy: { label: 'All busy', dot: 'bg-human' },
  offline: { label: 'Offline', dot: 'bg-ink-faint' },
};

const OUTCOME: Record<DayMoment['state'], { label: string; chip: string; dot: string }> = {
  resolved: { label: 'Resolved by AI', chip: 'bg-live-soft text-live', dot: 'bg-live' },
  handoff: { label: 'Human handoff', chip: 'bg-human-soft text-human', dot: 'bg-human' },
  queued: { label: 'Queued for the team', chip: 'bg-ai-soft text-ai', dot: 'bg-ai' },
};

/** The packet rows worth showing in a small chat window. */
const PACKET_ROWS = ['Customer', 'Intent', 'Suggested next step'];

const speaker = (m: DayMoment, msg: Msg) => (msg.from === 'customer' ? m.customer : msg.from === 'agent' ? msg.author : 'Truplexy');

export default function DayCycle() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [motion, setMotion] = useState(false);
  const [active, setActive] = useState(0);
  const [elapsed, setElapsed] = useState(Number.POSITIVE_INFINITY);
  const [lap, setLap] = useState(0);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);

  // Rewind on hydration unless the visitor prefers reduced motion.
  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setMotion(true);
      setElapsed(0);
    }
  }, []);

  // Play only while on screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!motion || !visible || paused) return;
    const id = window.setInterval(() => setElapsed((e) => e + TICK_MS), TICK_MS);
    return () => clearInterval(id);
  }, [motion, visible, paused]);

  // A finished moment hands over to the next; after the last, a new day starts.
  useEffect(() => {
    if (!motion || elapsed < PLAN[active].total) return;
    const next = (active + 1) % DAY.length;
    if (next === 0) setLap((l) => l + 1);
    setActive(next);
    setElapsed(0);
  }, [motion, elapsed, active]);

  const select = (i: number) => {
    setActive(i);
    // Paused, a picked moment shows complete and holds there when play resumes.
    setElapsed(!motion ? Number.POSITIVE_INFINITY : paused ? PLAN[i].done : 0);
  };

  const m = DAY[active];
  const plan = PLAN[active];
  const shown = plan.items.filter((it) => it.at <= elapsed);
  const upcoming = plan.items.find((it) => it.at > elapsed);
  const typing = upcoming?.kind === 'msg' && upcoming.typed && elapsed >= upcoming.at - TYPING_MS ? upcoming.msg : null;
  const finished = elapsed >= plan.done;
  const progress = Math.min(1, elapsed / plan.total);
  const day = isDaytime(m.hour);
  const enter = motion ? 'msg-in' : '';

  return (
    <div ref={rootRef} className="card overflow-hidden !rounded-[28px] !shadow-[var(--shadow-lg)]">
      {/* Rail */}
      <div className="border-b border-line px-5 pb-6 pt-5 sm:px-8 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span
              className={`grid h-12 w-12 flex-none place-items-center rounded-2xl transition-colors duration-500 ${
                day ? 'bg-[#fff4d6] text-[#8a5a00]' : 'bg-accent-soft text-accent'
              }`}
              aria-hidden="true"
            >
              {day ? <Sun size={22} strokeWidth={2} /> : <Moon size={22} strokeWidth={2} />}
            </span>
            <div aria-hidden="true">
              <p key={m.id} className={`text-[1.9rem] font-bold leading-none tracking-tight tabular-nums ${enter}`}>
                {m.time}
              </p>
              <p className="mono mt-1.5 text-[0.62rem] text-ink-faint">One day of support</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <span className="hidden flex-wrap items-center gap-4 text-[0.8rem] text-ink-muted sm:flex">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-5 rounded-sm bg-live-soft ring-1 ring-live/30" aria-hidden="true" />
                Your team ({BUSINESS_HOURS.start} AM – {BUSINESS_HOURS.end - 12} PM)
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="thread-h w-5" aria-hidden="true" />
                Truplexy
              </span>
            </span>
            {motion && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? 'Play the day' : 'Pause the day'}
                className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-muted transition-colors hover:border-line-strong hover:text-ink pointer-coarse:w-11"
              >
                {paused ? <Play size={14} strokeWidth={2.4} aria-hidden="true" /> : <Pause size={14} strokeWidth={2.4} aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>

        <div className="relative mt-7 h-[76px]" aria-hidden="true">
          {/* Day and night */}
          <div className="absolute inset-x-0 top-0 h-[50px] overflow-hidden rounded-xl border border-line bg-paper">
            <div className="absolute inset-y-0 left-1/2 right-0 bg-[color-mix(in_oklab,var(--color-indigo)_7%,var(--color-surface))]">
              <span className="mono absolute right-3 top-1.5 hidden items-center gap-1 text-[0.58rem] text-accent sm:flex">
                <Moon size={10} strokeWidth={2.4} /> Night
              </span>
            </div>
            <div
              className="absolute inset-y-[5px] rounded-lg bg-live-soft ring-1 ring-live/25"
              style={{ left: `${pos(BUSINESS_HOURS.start)}%`, width: `${pos(BUSINESS_HOURS.end) - pos(BUSINESS_HOURS.start)}%` }}
            >
              <span className="mono absolute right-2.5 top-1 hidden text-[0.58rem] text-live sm:block">Team</span>
            </div>
          </div>

          {/* Truplexy: unbroken across all 24 hours */}
          <div className="thread-h absolute inset-x-0 top-[24px] !h-[3px]" />

          {DAY.map((d, i) => (
            <button
              key={d.id}
              type="button"
              tabIndex={-1}
              onClick={() => select(i)}
              className="absolute top-[25.5px] grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center"
              style={{ left: `${pos(d.hour)}%` }}
            >
              <span className={`block h-3 w-3 rounded-full ring-[3px] ring-surface ${OUTCOME[d.state].dot}`} />
            </button>
          ))}

          {/* The clock marker; a new day starts it afresh at the left. */}
          <span
            key={lap}
            className="pointer-events-none absolute top-[25.5px] -translate-x-1/2 -translate-y-1/2 transition-[left] duration-[900ms] ease-[var(--ease-out-expo)]"
            style={{ left: `${pos(m.hour)}%` }}
          >
            <span
              className={`block h-[22px] w-[22px] rounded-full bg-surface ring-[3px] ring-accent ${lap > 0 ? 'msg-in' : ''}`}
              style={{ boxShadow: '0 0 0 7px color-mix(in oklab, var(--color-accent) 16%, transparent)' }}
            />
          </span>

          {TICKS.map((t) => (
            <span
              key={t.at}
              className={`mono absolute bottom-0 whitespace-nowrap text-[0.6rem] text-ink-faint ${
                t.at === 0 ? '' : t.at === 100 ? '-translate-x-full' : '-translate-x-1/2'
              }`}
              style={{ left: `${t.at}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr]">
        {/* Status */}
        <div className="border-b border-line px-5 py-5 sm:px-8 lg:col-start-1 lg:row-start-1 lg:border-r">
          <div className="grid grid-cols-2 gap-3" aria-hidden="true">
            <div className="rounded-2xl border border-line bg-paper p-4">
              <p className="mono text-[0.62rem] text-ink-faint">Your team</p>
              <p key={m.team} className={`mt-2 flex items-center gap-2 font-semibold ${enter}`}>
                <span className={`h-2.5 w-2.5 flex-none rounded-full ${TEAM[m.team].dot}`} />
                {TEAM[m.team].label}
              </p>
            </div>
            <div className="rounded-2xl border border-accent/25 bg-accent-soft p-4">
              <p className="mono text-[0.62rem] text-accent">Truplexy</p>
              <p className="mt-2 flex items-center gap-2 font-semibold text-accent">
                <span className="live-dot" />
                Always on
              </p>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="border-b border-line bg-paper/70 px-4 py-5 sm:px-8 sm:py-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-b-0">
          <div className="card flex h-[440px] flex-col overflow-hidden !rounded-[22px] !shadow-[var(--shadow-md)]" aria-hidden="true">
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-xl border border-line bg-surface-2">
                <ChannelIcon id={m.channel} size={16} />
              </span>
              <p className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[0.9rem] font-semibold">{m.customer}</span>
                <span className="block truncate text-[0.74rem] text-ink-faint">
                  via {channel(m.channel).name} · {m.time}
                </span>
              </p>
              <span
                className={`chip hidden flex-none !px-2.5 !py-1 text-[0.7rem] transition-opacity duration-500 sm:inline-flex ${OUTCOME[m.state].chip} ${
                  finished ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {OUTCOME[m.state].label}
              </span>
            </div>

            <div
              className="flex flex-1 flex-col justify-end gap-2.5 overflow-hidden px-4 py-4"
              style={{ maskImage: 'linear-gradient(to bottom, transparent, #000 32px)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 32px)' }}
            >
              {shown.map((it, i) => {
                const key = `${m.id}-${lap}-${i}`;
                if (it.kind === 'join') {
                  return (
                    <div key={key} className={`flex-none overflow-hidden rounded-2xl border border-human/25 bg-surface ${enter}`}>
                      <p className="flex items-center gap-2 border-b border-line bg-human-soft px-3.5 py-2 text-[0.78rem] font-semibold text-human">
                        <Headset size={13} strokeWidth={2.2} />
                        {it.author} joined
                        <span className="mono ml-auto text-[0.56rem] font-normal">Full thread attached</span>
                      </p>
                      {it.packet && (
                        <dl className="px-3.5 py-1.5">
                          {it.packet
                            .filter((p) => PACKET_ROWS.includes(p.label))
                            .map((p) => (
                              <div key={p.label} className="grid grid-cols-[92px_1fr] gap-2 py-1 text-[0.76rem]">
                                <dt className="text-ink-faint">{p.label}</dt>
                                <dd className="font-medium text-ink">{p.value}</dd>
                              </div>
                            ))}
                        </dl>
                      )}
                    </div>
                  );
                }
                if (it.kind === 'note') {
                  return (
                    <p key={key} className={`chip flex-none self-center whitespace-normal bg-ai-soft text-center text-[0.75rem] text-ai ${enter}`}>
                      <Clock size={12} strokeWidth={2.4} className="flex-none" />
                      {it.text}
                    </p>
                  );
                }
                return (
                  <div key={key} className={`bubble bubble-${it.msg.from} flex-none !text-[0.875rem] ${enter}`}>
                    {it.msg.from === 'agent' && (
                      <span className="mb-0.5 block text-[0.72rem] font-semibold text-ink-faint">{it.msg.author}</span>
                    )}
                    {it.msg.text}
                  </div>
                );
              })}
              {typing && (
                <div className={`bubble bubble-${typing.from} msg-in flex-none !py-3`}>
                  {typing.from === 'agent' && (
                    <span className="mb-1.5 block text-[0.72rem] font-semibold text-ink-faint">{typing.author}</span>
                  )}
                  <span className="typing">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Moments */}
        <div className="px-3 py-4 sm:px-5 lg:col-start-1 lg:row-start-2 lg:border-r lg:border-line">
          <ol className="flex flex-col gap-1">
            {DAY.map((d, i) => {
              const on = i === active;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => select(i)}
                    className={`relative w-full overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-colors ${
                      on ? 'border-accent/30 bg-surface shadow-[var(--shadow-sm)]' : 'border-transparent hover:bg-surface-2'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <time className="w-[62px] flex-none font-mono text-[0.75rem] font-semibold text-ink tabular-nums">{d.time}</time>
                      <span className={`h-2 w-2 flex-none rounded-full ${OUTCOME[d.state].dot}`} aria-hidden="true" />
                      <span className={`min-w-0 flex-1 truncate text-[0.9rem] ${on ? 'font-semibold text-ink' : 'font-medium text-ink-muted'}`}>
                        {d.title}
                      </span>
                    </span>
                    {on && <span className="mt-1.5 block pl-[94px] text-[0.84rem] leading-snug text-ink-muted">{d.outcome}</span>}
                    {on && motion && (
                      <span className="absolute inset-x-0 bottom-0 h-[2px] bg-surface-3" aria-hidden="true">
                        <span className="block h-full bg-accent transition-[width] duration-100 ease-linear" style={{ width: `${progress * 100}%` }} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="sr-only">
        <p>
          Your team is online from {BUSINESS_HOURS.start} AM to {BUSINESS_HOURS.end - 12} PM. Truplexy is available across all 24
          hours.
        </p>
        <ol aria-label="One day of support, sample conversations">
          {DAY.flatMap((d) => [
            <li key={`${d.id}-at`} data-demo>
              {d.time}, team {TEAM[d.team].label.toLowerCase()}, on {channel(d.channel).name}: {d.title}.
            </li>,
            ...d.messages.map((msg, j) => (
              <li key={`${d.id}-${j}`} data-demo>
                {speaker(d, msg)}: {msg.text}
              </li>
            )),
            <li key={`${d.id}-out`} data-demo>
              {OUTCOME[d.state].label}. {d.outcome}
              {d.note ? ` ${d.note}.` : ''}
            </li>,
          ])}
        </ol>
      </div>
    </div>
  );
}
