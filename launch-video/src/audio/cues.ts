import { SCENES, wordAt } from '../timeline';
import { NOTES, BUT } from '../scenes/Scene01';
import { APPS, JOIN, MISSED } from '../scenes/Scene02';
import { LAND } from '../scenes/Scene03';
import { HANDLED, SELECT, TICKETS, WAITING } from '../scenes/Scene04';
import { JACKET_Q, ORDER_Q, ANSWERED, NIGHT, LATE_Q } from '../scenes/Scene05';
import { SOURCE } from '../scenes/Scene06';
import { CARRY, HANDOFF, AGENT_REPLY } from '../scenes/Scene07';
import { LOGO } from '../scenes/Scene08';

/**
 * Every sound effect, placed on the same cues that drive the animation (so a
 * sound always lands with what you see). Files are pre-levelled by
 * scripts/prepare-audio.mjs; `vol` is a relative trim on top of that.
 */
export type Sfx = 'notify' | 'send' | 'receive' | 'whoosh' | 'clock' | 'disconnect' | 'success' | 'handoff' | 'reveal' | 'sonic-logo';

export interface Cue {
  sfx: Sfx;
  /** Absolute frame on the film timeline. */
  frame: number;
  vol: number;
}

/** Scene-local frame → film frame. */
const at = (scene: number, local: number) => Math.round(SCENES[scene].start * 30) + local;
const W = (scene: number, word: string) => at(scene, wordAt(scene, word));

export const CUES: Cue[] = [
  // 01 · one delicate ping, then more and more; the flood after "But" is quieter.
  ...NOTES.filter((n) => n.at < BUT).map((n, i) => ({ sfx: 'notify' as const, frame: at(0, n.at), vol: Math.min(1, 0.7 + i * 0.05) })),
  ...NOTES.filter((n) => n.at >= BUT).filter((_, i) => i % 2 === 0).map((n) => ({ sfx: 'notify' as const, frame: at(0, n.at), vol: 0.45 })),

  // 02 · three separate apps pinging, one message missed, then they fold away.
  ...APPS.map((a) => ({ sfx: 'notify' as const, frame: at(1, a.enter), vol: 0.75 })),
  ...APPS.map((a) => ({ sfx: 'notify' as const, frame: at(1, a.focus), vol: 0.5 })),
  { sfx: 'disconnect', frame: at(1, MISSED), vol: 0.9 },
  { sfx: 'whoosh', frame: at(1, JOIN), vol: 1 },

  // 03 · the reveal, then a soft pop as the AI assistant and the team connect.
  { sfx: 'reveal', frame: at(2, LAND - 2), vol: 1 },
  { sfx: 'receive', frame: W(2, 'assistant'), vol: 0.6 },
  { sfx: 'receive', frame: W(2, 'team'), vol: 0.6 },

  // 04 · each conversation lands in the inbox; resolved, selected, waiting.
  ...TICKETS.map((t) => ({ sfx: 'receive' as const, frame: at(3, t.at), vol: 0.55 })),
  { sfx: 'success', frame: at(3, HANDLED), vol: 0.8 },
  { sfx: 'send', frame: at(3, SELECT), vol: 0.6 },
  { sfx: 'handoff', frame: at(3, WAITING), vol: 0.6 },

  // 05 · the store chat, and the clock running past closing time.
  { sfx: 'receive', frame: at(4, 26), vol: 0.6 },
  { sfx: 'send', frame: at(4, JACKET_Q), vol: 0.9 },
  { sfx: 'receive', frame: W(4, 'black') + 4, vol: 0.8 },
  { sfx: 'send', frame: at(4, ORDER_Q), vol: 0.9 },
  { sfx: 'receive', frame: at(4, ANSWERED), vol: 0.8 },
  { sfx: 'clock', frame: at(4, NIGHT), vol: 1 },
  { sfx: 'send', frame: at(4, LATE_Q), vol: 0.9 },
  { sfx: 'receive', frame: W(4, 'going') + 4, vol: 0.8 },

  // 06 · the question, the answer, and the cited source.
  { sfx: 'send', frame: W(5, 'customers'), vol: 0.9 },
  { sfx: 'receive', frame: W(5, 'answers'), vol: 0.8 },
  { sfx: 'success', frame: at(5, SOURCE), vol: 0.9 },

  // 07 · the handoff.
  { sfx: 'send', frame: at(6, 8), vol: 0.9 },
  { sfx: 'receive', frame: at(6, 40), vol: 0.8 },
  { sfx: 'whoosh', frame: at(6, CARRY), vol: 0.6 },
  { sfx: 'handoff', frame: at(6, HANDOFF), vol: 1 },
  { sfx: 'receive', frame: at(6, AGENT_REPLY), vol: 0.8 },

  // 08 · the recap collapses into the logo; the sonic signature lands with it.
  { sfx: 'whoosh', frame: at(7, wordAt(7, 'platform') + 12), vol: 0.8 },
  { sfx: 'sonic-logo', frame: at(7, LOGO - 4), vol: 1 },
];

