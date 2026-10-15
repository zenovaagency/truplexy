/**
 * Word-level timing for the approved narration (take 4 of each scene; scenes
 * 01, 05, 06 and 07 from the v2 script, 02, 03, 04 and 08 from the v3
 * script). Start and end are seconds from the start of that scene's clip,
 * measured with ElevenLabs Scribe (eleven_scribe_v1) on the exact files in
 * public/audio/narration/, and cross-checked against the clips' pauses. The
 * text is the approved script, not the transcript, so "Truplexy" and
 * punctuation are always spelled correctly.
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
  // 02 · Juggling apps
  [
    ['Too', 0.08, 0.32], ['often,', 0.4, 0.8], ['your', 0.88, 0.96], ['team', 1.04, 1.12], ['is', 1.2, 1.28], ['jumping', 1.36, 1.68], ['between', 1.88, 2.08], ['apps.', 2.16, 2.64],
    ['A', 2.8, 2.84], ['website', 2.88, 3.2], ['inbox', 3.4, 3.6], ['here…', 3.68, 4.16], ['WhatsApp', 4.24, 4.72], ['there…', 4.8, 5.32],
    ['Instagram', 5.36, 5.76], ['somewhere', 5.8, 6.0], ['else.', 6.08, 6.56],
    ['Messages', 6.88, 7.2], ['get', 7.28, 7.44], ['missed,', 7.56, 7.8], ['and', 7.84, 7.92], ['customers', 8.0, 8.4], ['are', 8.48, 8.56], ['left', 8.64, 8.72], ['waiting.', 8.88, 9.44],
  ],
  // 03 · Meet Truplexy
  [
    ['Meet', 0.24, 0.48], ['Truplexy!', 0.8, 1.48],
    ['An', 1.84, 1.92], ['AI', 2.08, 2.32], ['assistant', 2.56, 2.8], ['on', 2.92, 3.04], ['every', 3.12, 3.36], ['channel', 3.52, 3.68], ['you', 3.76, 3.84], ['already', 3.92, 4.24], ['use,', 4.4, 4.84],
    ['and', 5.04, 5.12], ['one', 5.2, 5.36], ['platform', 5.44, 5.84], ['where', 5.92, 6.0], ['your', 6.08, 6.24], ['team', 6.32, 6.56], ['manages', 6.64, 6.96], ['it', 7.04, 7.12], ['all.', 7.2, 7.52],
  ],
  // 04 · One inbox
  [
    ['Website,', 0.08, 0.68], ['WhatsApp,', 0.8, 1.28], ['Instagram,', 1.36, 2.0], ['Telegram.', 2.08, 2.84],
    ['Every', 3.12, 3.28], ['conversation', 3.36, 4.0], ['lands', 4.12, 4.24], ['in', 4.28, 4.32], ['one', 4.4, 4.48], ['inbox.', 4.56, 5.08],
    ['See', 5.6, 5.68], ['what', 5.76, 5.84], ['the', 5.88, 5.92], ['AI', 6.08, 6.32], ['already', 6.4, 6.72], ['handled,', 6.8, 7.28],
    ['what', 7.44, 7.52], ['each', 7.6, 7.76], ['customer', 8.0, 8.24], ['needs,', 8.32, 8.84],
    ['and', 9.04, 9.12], ["what's", 9.2, 9.4], ['waiting', 9.44, 9.68], ['for', 9.72, 9.76], ['your', 9.84, 10.0], ['team,', 10.08, 10.48],
    ['all', 10.64, 10.8], ['from', 10.88, 10.96], ['one', 11.04, 11.2], ['place.', 11.4, 11.76],
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
    ['Every', 0.16, 0.4], ['channel.', 0.48, 0.96], ['One', 1.12, 1.28], ['platform.', 1.36, 1.92],
    ['Truplexy.', 2.24, 2.96],
    ['Customer', 3.36, 3.76], ['support,', 3.84, 4.36], ['managed', 4.48, 4.88], ['from', 4.96, 5.12], ['one', 5.2, 5.36], ['place.', 5.56, 5.92],
    ['Start', 6.08, 6.24], ['your', 6.32, 6.4], ['free', 6.48, 6.64], ['trial', 6.72, 6.96], ['today!', 7.16, 7.52],
  ],
];
