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
  { start: 0.5, end: 3, text: 'Your customers are reaching out everywhere.', scene: 'Customer messages float across the screen.' },
  { start: 3, end: 7, text: 'Website. Messenger. WhatsApp. Instagram.', scene: 'Each channel’s name appears with its icon.' },
  { start: 7, end: 12, text: 'Your team can’t be online 24/7.', scene: 'A support team’s clock runs from 9 PM past midnight while unread messages pile up.' },
  { start: 12, end: 14, text: 'Replies slow down.', scene: 'At 3 AM the average first reply has grown to hours.' },
  { start: 14, end: 15.5, text: 'Customers walk away.' },
  { start: 15.5, end: 20.5, text: 'Truplexy. Every channel. One platform.', scene: 'The Truplexy logo.' },
  { start: 20.5, end: 27, text: 'Answers every customer, on every channel.', scene: 'The Truplexy assistant answers questions from the website, Messenger, WhatsApp and Instagram using the shop’s policies and catalog.' },
  { start: 27, end: 30, text: 'Resolved in seconds.', scene: 'All four questions are marked resolved by AI.' },
  { start: 30, end: 35, text: 'One unified inbox.', scene: 'The Truplexy dashboard lists every ticket; a billing question has been handed to a person.' },
  { start: 35, end: 37, text: 'Take over in one click.' },
  { start: 37, end: 40.5, text: 'Full context, every time.', scene: 'A teammate replies to the customer about a duplicate charge, with the whole conversation in view.' },
  { start: 40.5, end: 45, text: 'Live in three steps: connect your channels, add your knowledge, go live 24/7.' },
  { start: 45, end: 48.5, text: 'Works for your business, day and night.' },
  { start: 48.5, end: 58.7, text: 'Start your 7-day free trial. Starter or Pro free for 7 days. Every channel, one platform. truplexy.com' },
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
