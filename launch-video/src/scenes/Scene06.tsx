import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BookOpen, FileText, PenLine, Upload } from 'lucide-react';
import { Backdrop, SceneShell, Scaled } from '../components/Stage';
import { Headline } from '../components/Headline';
import { AppShell, Badge } from '../components/Dashboard';
import { Bubble, Mono, Typing } from '../components/Chat';
import { C, FONT, SHADOW } from '../theme';
import { EXPO, SMOOTH, mix, msgIn, prog } from '../animations/motion';
import { f, SCENES, wordAt } from '../timeline';

/**
 * 06 · Your business knowledge, working for you.
 * The dashboard's Knowledge base page (features/knowledge/KnowledgePage.tsx),
 * restyled for the sample store. The returns policy lifts out of the table,
 * and the answer to "What is your return policy?" cites it, as the product
 * does (answers are drawn from these documents and cite them).
 */
const S = SCENES[5];
export const SCENE06_LENGTH = f(S.end - S.start);

/** Word cues from the narration (scene 06). */
const W = (word: string) => wordAt(5, word);
const POLICIES = W('policies');
export const SOURCE = W('source');

interface Doc {
  name: string;
  file: string;
  passages: number;
  updated: string;
  /** The returns policy: lifts out of the table and is cited. */
  hero?: boolean;
  /** Narration word on which the row is highlighted. */
  cue?: string;
}

const DOCS: Doc[] = [
  { name: 'Returns and refunds', file: 'Article · en', passages: 1, updated: '2 days ago', hero: true, cue: 'policies' },
  { name: 'Shipping policy', file: 'Article · en', passages: 2, updated: '6 days ago' },
  { cue: 'products', name: 'Product catalog 2026', file: 'product-catalog-2026.pdf · catalog', passages: 1184, updated: '1 week ago' },
  { name: 'Size guide', file: 'size-guide.docx', passages: 77, updated: '1 week ago' },
  { name: 'Exchanges and alterations', file: 'Article · en', passages: 1, updated: 'Oct 2, 2026' },
  { cue: 'faqs', name: 'Store FAQ', file: 'store-faq.html', passages: 40, updated: 'Sep 29, 2026' },
];

const POLICY = 'You have 30 days from delivery to return anything unworn with the tags on. Returns are free anywhere in the US.';

const KnowledgePage = () => {
  const frame = useCurrentFrame();
  const lift = prog(frame, POLICIES - 6, 26, EXPO);
  return (
    <div style={{ padding: '26px 30px', fontFamily: FONT.sans }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em' }}>Knowledge base</div>
          <div style={{ fontSize: 13.5, color: C.inkMuted, marginTop: 6 }}>What Store assistant knows. Answers are drawn from these documents and cite them.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.white, fontSize: 13, fontWeight: 600 }}>
            <PenLine size={14} /> Write article
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 10, background: C.accent, color: '#fff', fontSize: 13, fontWeight: 600 }}>
            <Upload size={14} /> Upload files
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 22, borderBottom: `1px solid ${C.line}`, fontSize: 13, fontWeight: 600 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 10, borderBottom: `2px solid ${C.accent}`, color: C.ink }}>
          <BookOpen size={14} color={C.accent} /> Documents <Badge style={{ padding: '1px 7px', fontSize: 10.5 }}>6</Badge>
        </span>
        <span style={{ paddingBottom: 10, color: C.inkFaint }}>Test retrieval</span>
      </div>
      <div style={{ marginTop: 14, background: C.white, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'visible' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 90px 110px', padding: '10px 16px', borderBottom: `1px solid ${C.line}`, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: C.inkFaint }}>
          <span>DOCUMENT</span>
          <span>STATUS</span>
          <span>PASSAGES</span>
          <span>UPDATED</span>
        </div>
        {DOCS.map((d, i) => {
          const t = prog(frame, 14 + i * 4, 16);
          const hero = d.hero ? lift : 0;
          // "your products, your FAQs": those rows pulse as they are named.
          const cue = d.cue && !d.hero ? W(d.cue) : -1;
          const pulse = cue < 0 ? 0 : prog(frame, cue, 8) * (1 - prog(frame, cue + 24, 16));
          return (
            <div
              key={d.name}
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: '1fr 130px 90px 110px',
                alignItems: 'center',
                padding: '11px 16px',
                borderTop: i ? `1px solid ${C.line}` : 'none',
                opacity: t,
                transform: `translateY(${mix(10, 0, t)}px) translateZ(0) scale(${1 + hero * 0.03})`,
                background: d.hero ? `rgb(238 240 255 / ${hero})` : `rgb(238 240 255 / ${pulse})`,
                boxShadow: d.hero ? `0 0 0 ${2 * hero}px ${C.accent}, 0 ${18 * hero}px ${40 * hero}px rgb(35 56 230 / ${0.18 * hero})` : `0 0 0 ${2 * pulse}px ${C.accent}`,
                borderRadius: d.hero ? 10 * hero : 10 * pulse,
                zIndex: d.hero ? 2 : 1,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, background: C.accentSoft }}>
                  <FileText size={15} color={C.accent} />
                </span>
                <span>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{d.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.inkFaint, marginTop: 2 }}>{d.file}</span>
                </span>
              </span>
              <span>
                <Badge tone="live" dot>
                  Indexed
                </Badge>
              </span>
              <span style={{ fontSize: 13, color: C.inkMuted, fontVariantNumeric: 'tabular-nums' }}>{d.passages.toLocaleString('en-US')}</span>
              <span style={{ fontSize: 13, color: C.inkMuted }}>{d.updated}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** The policy article itself, lifted out of the table. */
const PolicyCard = () => {
  const frame = useCurrentFrame();
  const t = prog(frame, POLICIES, 26, EXPO);
  const glow = prog(frame, SOURCE - 12, 16) * (1 - prog(frame, SOURCE + 28, 40));
  if (frame < POLICIES) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: 1210,
        top: 250,
        width: 600,
        padding: '24px 26px',
        borderRadius: 24,
        background: C.white,
        border: `1px solid ${C.line}`,
        boxShadow: `${SHADOW.xl}, 0 0 0 ${3 * glow}px ${C.accent}`,
        fontFamily: FONT.sans,
        opacity: t,
        transform: `translateX(${mix(-180, 0, t)}px) scale(${mix(0.9, 1, t)})`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: 12, background: C.accentSoft }}>
          <FileText size={22} color={C.accent} />
        </span>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Returns and refunds</div>
          <Mono style={{ fontSize: 12.5 }}>Knowledge base · Article</Mono>
        </div>
        <span style={{ marginLeft: 'auto' }}>
          <Badge tone="live" dot style={{ fontSize: 14 }}>
            Indexed
          </Badge>
        </span>
      </div>
      <p style={{ margin: '16px 0 0', fontSize: 20, lineHeight: 1.5, color: C.inkMuted }}>
        Items can be returned within <b style={{ color: C.ink }}>30 days</b> of delivery, unworn and with tags attached. Return shipping is <b style={{ color: C.ink }}>free</b> within the US.
      </p>
    </div>
  );
};

/** The citation link: from the article down into the answer. */
const Link = () => {
  const frame = useCurrentFrame();
  const t = prog(frame, SOURCE - 12, 22, SMOOTH);
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <defs>
        <linearGradient id="s6-link" gradientUnits="userSpaceOnUse" x1="0" y1="470" x2="0" y2="690">
          <stop offset="0" stopColor={C.blue} />
          <stop offset="1" stopColor={C.violet} />
        </linearGradient>
      </defs>
      <path d="M 1300 470 C 1300 560, 1300 600, 1300 690" stroke="url(#s6-link)" strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={240} strokeDashoffset={240 * (1 - t)} opacity={t > 0 ? 1 : 0} />
    </svg>
  );
};

const Source = ({ at }: { at: number }) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  return (
    <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: C.white, border: `1px solid ${C.line}`, color: C.accent, fontSize: 12, fontWeight: 600, marginTop: -4, ...msgIn(frame, at) }}>
      <FileText size={12} /> Source · Returns and refunds
    </div>
  );
};

export const Scene06 = () => {
  const frame = useCurrentFrame();
  const appIn = prog(frame, 0, 26, EXPO);
  const push = prog(frame, 80, 120, SMOOTH);
  return (
    <SceneShell length={SCENE06_LENGTH}>
      <Backdrop />
      <AbsoluteFill style={{ padding: '78px 0 0 100px' }}>
        <Headline variant="wipe" text="Your Business Knowledge." at={12} out={W('relevant') - 16} size={76} accent={['KNOWLEDGE']} />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: '78px 0 0 100px' }}>
        <Headline variant="wipe" text="Powering Better Answers." at={W('relevant') - 4} size={76} accent={['ANSWERS']} />
      </AbsoluteFill>

      <div
        style={{
          position: 'absolute',
          left: 100,
          top: 230,
          transform: `perspective(2200px) rotateY(${mix(10, 4, appIn) + push * 2}deg) translateX(${mix(-60, 0, appIn)}px) scale(${mix(0.96, 1, appIn) * mix(1, 1.02, push)})`,
          transformOrigin: 'left center',
          opacity: appIn,
        }}
      >
        <Scaled s={0.83} style={{ position: 'relative' }}>
          <AppShell active="knowledge" width={1280} height={790}>
            <KnowledgePage />
          </AppShell>
        </Scaled>
      </div>

      <PolicyCard />
      <Link />
      <Scaled s={1.3} style={{ left: 1210, top: 640, width: 460 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 460, fontFamily: FONT.sans }}>
          <Bubble who="customer" at={W('customers')}>
            What is your return policy?
          </Bubble>
          <Typing from={W('customers') + 8} to={W('answers')} />
          <Bubble who="ai" at={W('answers')}>
            {POLICY}
          </Bubble>
          <Source at={SOURCE} />
        </div>
      </Scaled>
    </SceneShell>
  );
};
