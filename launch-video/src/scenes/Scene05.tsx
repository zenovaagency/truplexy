import type { ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Check, Clock3, Moon, PackageCheck, Truck } from 'lucide-react';
import { Backdrop, SceneShell, Scaled } from '../components/Stage';
import { Headline } from '../components/Headline';
import { Bubble, ChatWidget, LiveDot, Mono, Typing } from '../components/Chat';
import { C, FONT, SHADOW } from '../theme';
import { EXPO, SMOOTH, mix, prog } from '../animations/motion';
import { f, SCENES, wordAt, wordAtNth } from '../timeline';

/**
 * 05 · Human-like support, 24/7.
 * Loom & Lane, the site's sample store, in its website chat. A product
 * question, an order lookup against a fictional fixture, then the clock runs
 * past closing time: the team goes offline and Truplexy keeps answering. The
 * canvas stays white; only the clock and the status chips change.
 */
const S = SCENES[4];
export const SCENE05_LENGTH = f(S.end - S.start);

/** Word cues from the narration (scene 05). */
const W = (word: string) => wordAt(4, word);
export const JACKET_Q = W('is');
export const ORDER_Q = W("where's");
export const ANSWERED = W('answered');
/** "And when your team logs off for the night": the clock runs past closing. */
export const NIGHT = W('and');
export const LATE_Q = wordAtNth(4, 'truplexy', 1);

/** Store clock: 5:58 PM until the 24/7 beat, then it runs to 9:41 PM. */
const clockAt = (frame: number) => {
  const t = prog(frame, NIGHT, 70, SMOOTH);
  const minutes = Math.round(mix(17 * 60 + 58, 21 * 60 + 41, t));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { label: `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} PM`, offline: minutes >= 18 * 60 };
};

const StatusChips = () => {
  const frame = useCurrentFrame();
  const { label, offline } = clockAt(frame);
  const offIn = prog(frame, W('logs'), 14);
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: C.surface2, color: C.inkMuted, fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        <Clock3 size={12} /> {label}
      </span>
      {offline && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: C.surface3, color: C.inkMuted, fontSize: 11.5, fontWeight: 600, opacity: offIn }}>
          <Moon size={11} /> Team offline
        </span>
      )}
    </span>
  );
};

/** A small floating card beside the chat, entering in 2.5D. */
const Float = ({ at, out, x, y, w, children }: { at: number; out?: number; x: number; y: number; w: number; children: ReactNode }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const t = prog(frame, at, 22, EXPO);
  const o = out === undefined ? 0 : prog(frame, out, 18, EXPO);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        padding: 26,
        background: C.white,
        border: `1px solid ${C.line}`,
        borderRadius: 28,
        boxShadow: SHADOW.xl,
        fontFamily: FONT.sans,
        color: C.ink,
        opacity: t * (1 - o),
        transform: `perspective(1400px) translateX(${mix(-90, 0, t) + o * 60}px) rotateY(${mix(-14, -4, t)}deg) scale(${mix(0.92, 1, t) * mix(1, 0.94, o)})`,
        transformOrigin: 'left center',
      }}
    >
      {children}
    </div>
  );
};

/** The Atlas Jacket, drawn rather than photographed, so nothing is borrowed. */
const Jacket = ({ color }: { color: string }) => (
  <svg viewBox="0 0 200 200" width={168} height={168}>
    <defs>
      <linearGradient id="jk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a3d47" />
        <stop offset="1" stopColor={color} />
      </linearGradient>
    </defs>
    <path d="M70 28 L100 40 L130 28 L168 50 L186 140 L160 146 L156 96 L156 184 L44 184 L44 96 L40 146 L14 140 L32 50 Z" fill="url(#jk)" />
    <path d="M100 40 L100 184" stroke="#6b7080" strokeWidth="2" />
    <path d="M70 28 L88 70 L100 40 M130 28 L112 70 L100 40" fill="none" stroke="#6b7080" strokeWidth="2" />
    {[78, 104, 130, 156].map((y) => (
      <circle key={y} cx="106" cy={y} r="2.6" fill="#9aa0b0" />
    ))}
    <rect x="58" y="122" width="26" height="4" rx="2" fill="#6b7080" />
    <rect x="116" y="122" width="26" height="4" rx="2" fill="#6b7080" />
  </svg>
);

const Product = () => {
  const frame = useCurrentFrame();
  const sizesIn = prog(frame, W('black') + 18, 14);
  return (
    <>
      <div style={{ display: 'flex', gap: 22, alignItems: 'center' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 190, height: 190, borderRadius: 22, background: C.surface2 }}>
          <Jacket color="#15171d" />
        </div>
        <div>
          <Mono style={{ fontSize: 13 }}>Loom &amp; Lane · Outerwear</Mono>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6 }}>Atlas Jacket</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {[
              ['#15171d', 'Black'],
              ['#5b6146', 'Olive'],
              ['#cdbb99', 'Sand'],
            ].map(([c, n], i) => (
              <span
                key={n}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  background: c,
                  boxShadow: i === 0 ? `0 0 0 3px #fff, 0 0 0 5px ${C.accent}` : `0 0 0 1px ${C.line}`,
                }}
              />
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 600, color: C.live, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={18} /> In stock in Black
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 22, opacity: sizesIn }}>
        {['S', 'M', 'L', 'XL'].map((s) => (
          <span key={s} style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 12, border: `1px solid ${C.line}`, fontSize: 20, fontWeight: 600 }}>
            {s}
          </span>
        ))}
      </div>
    </>
  );
};

const STEPS = [
  { label: 'Ordered', Icon: Check },
  { label: 'Packed', Icon: PackageCheck },
  { label: 'Out for delivery', Icon: Truck },
];

const Order = () => {
  const frame = useCurrentFrame();
  const fill = prog(frame, ORDER_Q + 22, 30, SMOOTH);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Mono style={{ fontSize: 13 }}>Order lookup</Mono>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6 }}>Order #1048</div>
        </div>
        <span style={{ padding: '4px 12px', borderRadius: 999, background: C.surface2, color: C.inkMuted, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.08em' }}>SAMPLE DATA</span>
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', margin: '30px 6px 8px' }}>
        <div style={{ position: 'absolute', left: 20, right: 20, top: 19, height: 4, borderRadius: 2, background: C.surface3 }} />
        <div style={{ position: 'absolute', left: 20, top: 19, height: 4, borderRadius: 2, width: `calc((100% - 40px) * ${fill})`, background: C.accent }} />
        {STEPS.map(({ label, Icon }, i) => {
          const on = fill >= i / (STEPS.length - 1) - 0.01;
          return (
            <div key={label} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 120 }}>
              <span style={{ display: 'grid', placeItems: 'center', width: 42, height: 42, borderRadius: 21, background: on ? C.accent : C.white, border: `2px solid ${on ? C.accent : C.line}`, color: on ? '#fff' : C.inkFaint }}>
                <Icon size={20} />
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: on ? C.ink : C.inkFaint, textAlign: 'center' }}>{label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: '14px 16px', borderRadius: 14, background: C.paper, border: `1px solid ${C.line}` }}>
          <Mono style={{ fontSize: 12 }}>Status</Mono>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>Out for delivery</div>
        </div>
        <div style={{ padding: '14px 16px', borderRadius: 14, background: C.accentSoft, border: '1px solid rgb(35 56 230 / .2)' }}>
          <Mono style={{ fontSize: 12, color: C.accent }}>Estimated arrival</Mono>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, color: C.accent }}>Tomorrow</div>
        </div>
      </div>
    </>
  );
};

/** The site's day-cycle language: your team keeps hours, Truplexy doesn't. */
const Hours = () => {
  const frame = useCurrentFrame();
  const { label } = clockAt(frame);
  const t = prog(frame, NIGHT, 70, SMOOTH);
  // Day bar runs 6 AM → 6 AM; team hours 9–6 are shaded.
  const needle = mix((17.97 - 6) / 24, (21.68 - 6) / 24, t);
  return (
    <>
      <Mono style={{ fontSize: 13 }}>One day of support</Mono>
      <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{label}</div>
      <div style={{ position: 'relative', height: 14, borderRadius: 7, background: C.surface2, marginTop: 22 }}>
        <div style={{ position: 'absolute', left: `${(3 / 24) * 100}%`, width: `${(9 / 24) * 100}%`, top: 0, bottom: 0, borderRadius: 7, background: C.surface3 }} />
        <div style={{ position: 'absolute', left: `${needle * 100}%`, top: -7, width: 4, height: 28, marginLeft: -2, borderRadius: 2, background: C.accent }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: C.inkFaint, fontWeight: 600 }}>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
        <span>6 AM</span>
      </div>
      <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 16, border: `1px solid ${C.line}` }}>
          <span style={{ fontSize: 19, fontWeight: 600, color: C.inkMuted }}>Your team</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: C.surface3, color: C.inkMuted, fontSize: 16, fontWeight: 600 }}>
            <Moon size={15} /> Offline
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 16, border: `1px solid rgb(21 128 61 / 0.25)`, background: C.liveSoft }}>
          <span style={{ fontSize: 19, fontWeight: 700 }}>Truplexy</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: C.white, color: C.live, fontSize: 16, fontWeight: 600 }}>
            <LiveDot /> Always on
          </span>
        </div>
      </div>
    </>
  );
};

export const Scene05 = () => {
  const frame = useCurrentFrame();
  const widgetIn = prog(frame, 4, 22);
  return (
    <SceneShell length={SCENE05_LENGTH}>
      <Backdrop />
      <AbsoluteFill style={{ padding: '300px 0 0 110px' }}>
        <Headline variant="pop" text={'Natural\nConversations.'} at={20} out={200} size={62} accent={['CONVERSATIONS']} />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: '300px 0 0 110px' }}>
        <Headline variant="pop" text={'Helpful\nAnswers.'} at={210} out={NIGHT - 14} size={62} accent={['ANSWERS']} />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: '250px 0 0 110px' }}>
        <Headline variant="pop" text="24/7." at={W('24/7')} size={200} accent={['24/7']} />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: '540px 0 0 116px' }}>
        <Headline variant="pop" text={'Even when your\nteam is offline.'} at={W('night')} size={44} color={C.inkMuted} stagger={2} style={{ fontWeight: 700, letterSpacing: '-0.02em' }} />
      </AbsoluteFill>

      <Scaled s={1.2} style={{ left: 700, top: 230, opacity: widgetIn, translate: `0 ${mix(30, 0, widgetIn)}px` }}>
        <ChatWidget width={480} height={530} status={<StatusChips />}>
          <Bubble who="ai" at={26}>
            Hi! I&apos;m the Loom &amp; Lane assistant. Ask me about an order, a product or a return.
          </Bubble>
          <Bubble who="customer" at={JACKET_Q}>
            Do you have this jacket in black?
          </Bubble>
          <Typing from={JACKET_Q + 8} to={W('black') + 4} />
          <Bubble who="ai" at={W('black') + 4}>
            Yes! It&apos;s available in black. Would you like to see the available sizes?
          </Bubble>
          <Bubble who="customer" at={ORDER_Q}>
            Where&apos;s my order?
          </Bubble>
          <Typing from={ORDER_Q + 8} to={ANSWERED} />
          <Bubble who="ai" at={ANSWERED}>
            Your order is out for delivery and expected tomorrow.
          </Bubble>
          <Bubble who="customer" at={LATE_Q}>
            Can I swap it for a Medium if it doesn&apos;t fit?
          </Bubble>
          <Typing from={LATE_Q + 8} to={W('going') + 4} />
          <Bubble who="ai" at={W('going') + 4}>
            Of course. Just reply here when it arrives, and I&apos;ll set up the exchange for you.
          </Bubble>
        </ChatWidget>
      </Scaled>

      <Float at={W('black') + 6} out={ORDER_Q + 4} x={1310} y={280} w={510}>
        <Product />
      </Float>
      <Float at={ORDER_Q + 14} out={NIGHT + 8} x={1310} y={300} w={510}>
        <Order />
      </Float>
      <Float at={NIGHT + 10} x={1310} y={250} w={510}>
        <Hours />
      </Float>
    </SceneShell>
  );
};
