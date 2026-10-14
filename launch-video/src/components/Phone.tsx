import type { CSSProperties, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';
import { CheckCheck, ChevronLeft, Info, Mic, Paperclip, Smile } from 'lucide-react';
import { msgIn } from '../animations/motion';

/**
 * The customer's phone in Telegram, after the site's PhoneChat.astro
 * (`v-telegram`): white bar, green gradient wallpaper, pale-green outgoing
 * bubbles with the time inside. Store messages come in on the left.
 */
export const TelegramPhone = ({
  children,
  title = 'Loom & Lane',
  sub = 'bot',
  day = 'Today',
  avatar = 'L&L',
  width = 340,
  height = 600,
  style,
}: {
  children: ReactNode;
  title?: string;
  sub?: string;
  day?: string;
  avatar?: ReactNode;
  width?: number;
  height?: number;
  style?: CSSProperties;
}) => (
  <div
    style={{
      width,
      height,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      border: '8px solid #1b1d22',
      borderRadius: 44,
      background: '#a9c99a',
      boxShadow: '0 30px 60px -24px rgb(14 18 34 / 0.45)',
      fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      fontSize: 14.5,
      lineHeight: 1.38,
      color: '#111b21',
      ...style,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 22px 4px', background: '#fff', fontSize: 13, fontWeight: 600 }}>
      <span>9:41</span>
      <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {[5, 7, 9].map((h) => (
          <i key={h} style={{ width: 3, height: h, background: '#050505', borderRadius: 1 }} />
        ))}
        <b style={{ width: 20, height: 10, marginLeft: 5, border: '1.5px solid #050505', borderRadius: 3, padding: 1 }}>
          <span style={{ display: 'block', width: '70%', height: '100%', background: '#050505' }} />
        </b>
      </span>
    </div>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px 9px 6px',
        background: '#fff',
        boxShadow: '0 1px 0 rgb(0 0 0 / 0.08)',
        position: 'relative',
        zIndex: 1,
        color: '#3390ec',
      }}
    >
      <ChevronLeft size={22} />
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 36,
          height: 36,
          borderRadius: 18,
          background: typeof avatar === 'string' ? 'linear-gradient(#72d5fd, #2a9ef1)' : '#fff',
          border: typeof avatar === 'string' ? 'none' : '1px solid #e3e6f0',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          flex: 'none',
        }}
      >
        {avatar}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', flex: 1, color: '#050505' }}>
        <span style={{ fontSize: 15.5, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 12, color: '#6d7f8f' }}>{sub}</span>
      </span>
      <Info size={19} />
    </div>
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: 6,
        padding: '10px 10px 12px',
        overflow: 'hidden',
        backgroundImage: 'linear-gradient(160deg, #cfe2b6 0%, #a8c98f 45%, #8cb88f 100%)',
      }}
    >
      <p
        style={{
          alignSelf: 'center',
          margin: '0 0 4px',
          padding: '3px 10px',
          borderRadius: 999,
          background: 'rgb(0 0 0 / 0.18)',
          color: '#fff',
          fontSize: 11.5,
        }}
      >
        {day}
      </p>
      {children}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px 16px', background: '#fff', color: '#8e959b' }}>
      <Paperclip size={20} />
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', color: '#8696a0' }}>
        <span style={{ flex: 1 }}>Message</span>
        <Smile size={19} />
      </span>
      <Mic size={20} />
    </div>
  </div>
);

export const TgBubble = ({
  out,
  at,
  time,
  children,
  style,
}: {
  out?: boolean;
  at: number;
  time: string;
  children: ReactNode;
  style?: CSSProperties;
}) => {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  return (
    <div style={{ display: 'flex', justifyContent: out ? 'flex-end' : 'flex-start', ...msgIn(frame, at) }}>
      <div
        style={{
          maxWidth: '82%',
          padding: '6px 9px 7px',
          borderRadius: 12,
          background: out ? '#effdde' : '#fff',
          boxShadow: '0 1px 0.5px rgb(11 20 26 / 0.13)',
          ...style,
        }}
      >
        {children}
        <span
          style={{
            display: 'inline-flex',
            float: 'right',
            alignItems: 'center',
            gap: 3,
            margin: '6px 0 -3px 10px',
            fontSize: 11,
            color: out ? '#5ea152' : '#a1aab3',
          }}
        >
          {time}
          {out && <CheckCheck size={15} color="#5ea152" />}
        </span>
      </div>
    </div>
  );
};
