/**
 * Word-level timing for the approved narration (v2 script, take 4 of each
 * scene). Start and end are seconds from the start of that scene's clip,
 * measured with ElevenLabs Scribe (eleven_scribe_v1) on the exact files in
 * public/audio/narration/. The text is the approved script, not the
 * transcript, so "Truplexy" and punctuation are always spelled correctly.
 * Scribe heard "24/7" as three words ("twenty four seven"); it is shown as one.
 *
 * These timings drive the subtitles and every word-synced animation beat.
 * If a clip is regenerated, re-transcribe it and replace its row here.
 */
export type Word = [text: string, start: number, end: number];

export const NARRATION: Word[][] = [
  // 01 · Customers never stop asking
  [
    ['Your', 0.2, 0.32], ['customers', 0.42, 0.88], ['have', 0.92, 1.06], ['questions.', 1.1, 1.64],
    ['Anytime.', 2.02, 2.6], ['Everywhere.', 2.9, 3.36],
    ['On', 3.76, 3.86], ['your', 3.9, 4.0], ['website,', 4.019, 4.56], ['on', 4.74, 4.84], ['WhatsApp,', 4.88, 5.4], ['on', 5.52, 5.6], ['Instagram…', 5.66, 6.26],
    ['But', 6.72, 6.84], ['keeping', 6.88, 7.1], ['up', 7.16, 7.24], ['with', 7.26, 7.46], ['every', 7.56, 7.8], ['conversation,', 7.9, 8.64],
    ['on', 8.82, 8.94], ['every', 9.2, 9.46], ['channel,', 9.58, 9.9], ["isn't", 10.14, 10.36], ['easy.', 10.42, 10.76],
  ],
  // 02 · Disconnected conversations
  [
    ['Too', 0.16, 0.32], ['often,', 0.46, 0.8], ['every', 1.04, 1.26], ['channel', 1.36, 1.64], ['becomes', 1.66, 1.96], ['another', 1.98, 2.32],
    ['disconnected', 2.34, 2.92], ['conversation.', 3.0, 3.78],
    ['Same', 4.3, 4.48], ['customer,', 4.52, 5.02], ['new', 5.32, 5.48], ['inbox…', 5.52, 6.02],
    ['and', 6.48, 6.56], ["they're", 6.58, 6.7], ['left', 6.74, 6.92], ['repeating', 6.96, 7.36], ['themselves,', 7.38, 7.88],
    ['again', 8.039, 8.46], ['and', 8.48, 8.6], ['again.', 8.66, 8.98],
  ],
  // 03 · Meet Truplexy
  [
    ['Meet', 0.2, 0.46], ['Truplexy!', 0.66, 1.52],
    ['One', 2.1, 2.3], ['intelligent', 2.36, 2.88], ['conversation', 2.96, 3.54], ['layer —', 3.6, 3.84],
    ['connecting', 4.16, 4.54], ['your', 4.56, 4.66], ['customers,', 4.7, 5.28], ['your', 5.44, 5.6], ['AI,', 5.68, 6.02],
    ['and', 6.16, 6.34], ['your', 6.38, 6.5], ['team,', 6.54, 6.78],
    ['on', 7.12, 7.28], ['every', 7.36, 7.52], ['channel', 7.64, 7.88], ['you', 7.92, 7.98], ['already', 8.039, 8.28], ['use.', 8.42, 8.7],
  ],
  // 04 · One conversation, across channels
  [
    ['From', 0.14, 0.28], ['your', 0.32, 0.4], ['website', 0.48, 1.0], ['to', 1.0, 1.12], ['your', 1.16, 1.26], ['messaging', 1.3, 1.66], ['channels,', 1.74, 2.18],
    ['Truplexy', 2.58, 3.14], ['keeps', 3.3, 3.52], ['the', 3.56, 3.64], ['conversation', 3.68, 4.24], ['connected.', 4.3, 4.78],
    ['Ask', 5.28, 5.44], ['on', 5.48, 5.58], ['your', 5.6, 5.7], ['website', 5.74, 6.1], ['on', 6.14, 6.28], ['Tuesday,', 6.32, 6.78],
    ['pick', 7.18, 7.28], ['it', 7.32, 7.36], ['up', 7.42, 7.5], ['on', 7.54, 7.64], ['Telegram', 7.7, 8.1], ['on', 8.14, 8.24], ['Wednesday,', 8.28, 8.76],
    ['and', 9.14, 9.26], ['nobody', 9.36, 9.78], ['has', 9.82, 10.02], ['to', 10.06, 10.12], ['start', 10.2, 10.38], ['over.', 10.46, 10.68],
  ],
  // 05 · Human-like support, 24/7
  [
    ['From', 0.14, 0.26], ['product', 0.34, 0.72], ['questions', 0.8, 1.28], ['to', 1.32, 1.44], ['order', 1.48, 1.68], ['updates,', 1.74, 2.14],
    ['Truplexy', 2.56, 3.16], ['delivers', 3.22, 3.62], ['helpful,', 3.7, 4.1], ['human-like', 4.4, 4.86], ['responses', 4.9, 5.48], ['right', 5.76, 5.94], ['away.', 6.0, 6.28],
    ['Is', 6.92, 7.0], ['this', 7.04, 7.2], ['jacket', 7.24, 7.5], ['in', 7.54, 7.62], ['black?', 7.66, 8.02],
    ["Where's", 8.48, 8.66], ['my', 8.7, 8.82], ['order?', 8.88, 9.18], ['Answered.', 9.72, 10.12],
    ['And', 10.56, 10.66], ['when', 10.7, 10.82], ['your', 10.88, 11.02], ['team', 11.06, 11.22], ['logs', 11.3, 11.56], ['off', 11.62, 11.74],
    ['for', 11.76, 11.84], ['the', 11.88, 11.92], ['night,', 11.98, 12.22],
    ['Truplexy', 12.64, 13.24], ['keeps', 13.4, 13.68], ['going,', 13.7, 14.02],
    ['so', 14.26, 14.36], ['customers', 14.4, 14.8], ['get', 14.84, 14.94], ['answers', 14.98, 15.34], ['24/7.', 15.4, 16.379],
  ],
  // 06 · Your business knowledge
  [
    ['With', 0.12, 0.22], ['your', 0.26, 0.34], ['business', 0.42, 0.72], ['knowledge', 0.78, 1.08], ['behind', 1.16, 1.48], ['it,', 1.52, 1.66],
    ['Truplexy', 2.04, 2.54], ['gives', 2.62, 2.78], ['customers', 2.82, 3.2], ['relevant', 3.36, 3.72], ['answers', 3.8, 4.18],
    ['that', 4.22, 4.3], ['reflect', 4.34, 4.68], ['how', 4.72, 4.84], ['your', 4.86, 4.98], ['business', 5.02, 5.4], ['actually', 5.5, 5.9], ['works.', 5.94, 6.32],
    ['Your', 6.78, 6.9], ['policies,', 6.94, 7.56], ['your', 7.7, 7.78], ['products,', 7.88, 8.36], ['your', 8.72, 8.84], ['FAQs,', 8.98, 9.68],
    ['with', 9.72, 9.82], ['the', 9.86, 9.96], ['source', 10.04, 10.32], ['right', 10.46, 10.64], ['there.', 10.68, 10.9],
  ],
  // 07 · AI efficiency, human connection
  [
    ['And', 0.14, 0.24], ['when', 0.28, 0.36], ['a', 0.42, 0.48], ['human', 0.54, 0.78], ['touch', 0.88, 1.1], ['matters,', 1.24, 1.68],
    ['Truplexy', 1.92, 2.5], ['brings', 2.6, 2.8], ['your', 2.84, 2.94], ['team', 3.0, 3.18], ['in,', 3.26, 3.4],
    ['with', 3.74, 3.82], ['the', 3.86, 3.94], ['conversation', 4.0, 4.84], ['and', 4.88, 4.98], ['context', 5.1, 5.68], ['already', 5.82, 6.16], ['there.', 6.2, 6.42],
    ['No', 6.98, 7.12], ['repeating.', 7.16, 7.66], ['No', 8.119, 8.26], ['starting', 8.4, 8.68], ['over.', 8.76, 9.02],
    ['Just', 9.4, 9.66], ['real', 9.84, 10.06], ['help.', 10.18, 10.46],
  ],
  // 08 · Final brand moment
  [
    ['One', 0.24, 0.38], ['conversation.', 0.48, 1.16], ['Everywhere.', 1.64, 2.08],
    ['Truplexy.', 2.56, 3.14],
    ['Customer', 3.68, 4.04], ['support', 4.12, 4.46], ['that', 4.48, 4.6], ['feels', 4.64, 4.86], ['connected.', 4.88, 5.36],
    ['Start', 5.76, 5.94], ['your', 5.98, 6.04], ['free', 6.1, 6.24], ['trial', 6.28, 6.54], ['today!', 6.58, 6.88],
  ],
];
