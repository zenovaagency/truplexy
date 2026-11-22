/**
 * What the promo film says and shows, cue by cue. Feeds both the captions
 * track (/video/truplexy-promo.en.vtt, built by src/pages/video/truplexy-promo.en.vtt.ts)
 * and the transcript under the video, so the two always match.
 *
 * The film tells its story in on-screen text. If a voiceover is added to the
 * film, put its words in `text` and keep the timings in step.
 */
export interface Cue {
  /** Seconds from the start. */
  start: number;
  end: number;
  /** The words on screen. */
  text: string;
  /** What is shown, for anyone who can't see it. */
  scene?: string;
}

export const PROMO_CUES: Cue[] = [
  { start: 0.8, end: 3.2, text: 'Your customers are reaching out everywhere.', scene: 'Customer messages float across the screen.' },
  { start: 3.2, end: 7.6, text: 'Website. Messenger. WhatsApp. Instagram.', scene: 'Each channel’s name appears with its icon.' },
  { start: 8, end: 11.9, text: 'Your team can’t be online 24/7.', scene: 'A support team’s clock runs from 9 PM past midnight while unread messages pile up.' },
  { start: 11.9, end: 13.5, text: 'Replies slow down.', scene: 'At 3 AM the average first reply has grown to hours.' },
  { start: 13.5, end: 15.4, text: 'Customers walk away.' },
  { start: 16.3, end: 20.4, text: 'Truplexy. Every channel. One platform.', scene: 'The Truplexy logo.' },
  { start: 20.9, end: 26.8, text: 'Answers every customer, on every channel.', scene: 'The Truplexy assistant answers questions from the website, Messenger, WhatsApp and Instagram using the shop’s policies and catalog.' },
  { start: 26.8, end: 30, text: 'Resolved in seconds.', scene: 'All four questions are marked resolved by AI.' },
  { start: 30.9, end: 33.3, text: 'On your website.', scene: 'The Truplexy chat widget opens on a shop’s product page.' },
  { start: 33.3, end: 34.4, text: 'Greets every visitor.' },
  { start: 34.4, end: 36.6, text: 'Answers in seconds.', scene: 'The widget answers a visitor’s question about the product.' },
  { start: 38.8, end: 41.3, text: 'One unified inbox.', scene: 'The Truplexy dashboard lists every ticket; a billing question has been handed to a person.' },
  { start: 41.5, end: 43.5, text: 'Take over in one click.' },
  { start: 43.5, end: 47, text: 'Full context, every time.', scene: 'A teammate replies to the customer about a duplicate charge, with the whole conversation in view.' },
  { start: 47.4, end: 51.1, text: 'Live in three steps: connect your channels, add your knowledge, go live 24/7.' },
  { start: 51.1, end: 55.2, text: 'Works for your business, day and night.' },
  { start: 55.8, end: 65.2, text: 'Start your 7-day free trial. Starter or Pro free for 7 days. Every channel, one platform. truplexy.com' },
];

const stamp = (s: number) => {
  const ms = Math.round(s * 1000);
  const hh = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const mm = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, '0');
  const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
  return `${hh}:${mm}:${ss}.${String(ms % 1000).padStart(3, '0')}`;
};

/** The cues as a WebVTT file. */
export const toVtt = (cues: Cue[]) =>
  ['WEBVTT', '', ...cues.flatMap((c, i) => [String(i + 1), `${stamp(c.start)} --> ${stamp(c.end)}`, c.text, ''])].join('\n');

/** m:ss, for the transcript. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
