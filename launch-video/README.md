# Truplexy launch film

The official ~91-second Truplexy launch film, built in Remotion from the site's own brand tokens, logo and product UI. It is white-themed in every scene and narrated by ElevenLabs "Brittney – Social Media Voice", with word-synced subtitles, original music and sound design.

This folder is self-contained. Nothing in the site (`../src`) or the dashboard (`../dashboard`) is modified; the film recreates their UI as motion components.

## Deliverables

| File | What it is |
|---|---|
| `renders/truplexy-launch-final.mp4` | **Primary launch video**: 1920×1080, 30 fps, H.264 + AAC, burned-in animated subtitles |
| `renders/truplexy-launch-clean.mp4` | Same film without subtitles |
| `renders/truplexy-launch.srt` | Subtitles, phrase-timed to the narration (also in `captions/`) |
| `renders/truplexy-launch-mix.wav` | The final mastered soundtrack on its own |
| `captions/word-timings.json` | Every subtitle phrase with per-word start/end times |
| `previews/contact-sheet-final.png` | Key frames from all eight scenes |
| `docs/production-report.md` | Runtime, checks, sources and known limitations |
| `docs/scene-design.md` | The original scene plan (approved in step 2; timings since re-cut to the v2 narration) |

`renders/*.mp4` are git-ignored; regenerate them with the commands below.

## Setup

```bash
cd launch-video
npm install
```

Node 22+. Rendering uses Remotion's bundled Chrome Headless Shell and ffmpeg (downloaded on first use). The audio prep and mastering scripts need a **full** ffmpeg build (for `ebur128` and `loudnorm`): set `FFMPEG=/path/to/ffmpeg`, or on Windows install `winget install Gyan.FFmpeg` (the scripts find it automatically).

## Preview

```bash
npm run studio
```

Compositions: `TruplexyLaunch` (with subtitles), `TruplexyLaunchClean`, and each scene on its own under **Scenes**.

## Render

```bash
node scripts/prepare-audio.mjs          # level audio-source/ → public/audio/ (only when sources change)
node scripts/export-srt.mjs             # captions/truplexy-launch.srt + word-timings.json
npx remotion render TruplexyLaunch renders/raw/final-raw.mp4
npx remotion render TruplexyLaunchClean renders/raw/clean-raw.mp4
node scripts/master.mjs renders/raw/final-raw.mp4 renders/truplexy-launch-final.mp4
node scripts/master.mjs renders/raw/clean-raw.mp4 renders/truplexy-launch-clean.mp4
```

Review helpers: `node scripts/stills.mjs <outDir> [frames…]` renders PNG frames; `node scripts/contact-sheet.mjs <stillsDir> <out.png>` tiles them.

## Project structure

```
src/
  Root.tsx              compositions
  Film.tsx              the full film: scenes + subtitles + soundtrack
  timeline.ts           THE timeline: scene starts/ends, narration placement, wordAt(), sayFrames()
  theme.ts              brand tokens (from ../src/styles/tokens.css)
  fonts.ts              Plus Jakarta Sans + Geist Mono, loaded locally
  animations/motion.ts  easing and frame helpers
  components/           Stage, Brand (logo), Chat (widget, bubbles), Phone (Telegram),
                        Dashboard (app shell, badges), Headline (voice-synced), ChannelGlyph
  scenes/Scene01–08.tsx one file per scene
  captions/
    narration.ts        word timings of the approved narration (ElevenLabs Scribe)
    phrases.ts          groups words into subtitle phrases; SRT export
    Subtitles.tsx       burned-in subtitles with the active-word highlight
  audio/
    cues.ts             every sound effect, on the same cues as the animation
    Soundtrack.tsx      narration, ducked music, effects
public/                 assets the film plays: logo, brand glyphs, fonts, levelled audio
audio-source/           untouched ElevenLabs downloads (narration, music, sfx)
audio-archive/          superseded takes (v1 and v2 narration, music take B)
scripts/                stills, contact sheet, SRT export, audio prep, mastering
```

## Asset sources

- **Logo**: `../src/assets/brand/mark.png` and `wordmark-dark.png`, copied to `public/brand/`.
- **Channel logos**: `../public/brands/*.svg` (the site's vendored marks), only for channels marked `live` in `../src/data/channels.ts`.
- **Fonts**: `@fontsource-variable/plus-jakarta-sans` and `geist-mono`, the site's own.
- **Colours, radii, shadows, easing**: `../src/styles/tokens.css`.
- **UI**: recreated from `../src/islands/TryChat.tsx`, `../src/components/channels/demo/PhoneChat.astro`, `../dashboard/src/components/layout/Sidebar.tsx`, the dashboard Tickets and Knowledge base pages, and `../src/styles/global.css` (bubble, badge and app-demo styles).
- **Story data**: the site's sample cast in `../src/data/demo.ts` (Loom & Lane, James, Daniel, Priya), plus order #1048 from the brief. All people, stores and orders are fictional, and the UI is labelled "Sample store" / "Sample data".

## Narration

- Voice: ElevenLabs **Brittney – Social Media Voice – Fun, Youthful & Informative** (`kPzsL2i3teMYv0FxEYQ6`), model `eleven_v4`.
- Style (the user's template, generation `MFuB6DtFIeBlK37OrlEe`): each line opens `[energetic]` and lands its payoff `[confident]`.
- "Truplexy" is pronounced TROO-plex-ee, sent as IPA `/ˈtruːplɛksi/`.
- Approved: take 4 of each scene; scenes 02, 03, 04 and 08 re-voiced for the v3 story ("every channel, one platform"). ElevenLabs flow `HAnATQKeyBXvt62zp4Hz` holds every take.

## Subtitles

- Timings are measured, not estimated: each approved clip was transcribed with ElevenLabs Scribe (`eleven_scribe_v1`) for per-word start/end times, stored in `src/captions/narration.ts` with the approved script's spelling.
- `phrases.ts` groups words into phrases of mostly 3–7 words (up to 9 to finish a sentence) at sentence and clause breaks, shows each from 0.12 s before its first word to 0.35 s after its last, and exports the same phrases to SRT.
- Style: Plus Jakarta Sans 600, 42 px, ink on a soft white pill, lower centre (92 px above the bottom edge). Words still to come are lighter, the spoken word turns indigo on a soft brand pill, and key words (Truplexy, Everywhere, 24/7…) swell slightly.
- **If narration changes**: re-transcribe the clip, replace its row in `narration.ts`, and update `vo.at`/scene times in `timeline.ts`. Animations, headlines, subtitles, ducking and effect cues all follow automatically.
- **Headlines** are separate from the subtitles: each headline word enters on the frame it is spoken (`sayFrames()` in `timeline.ts`), so headline copy repeats the narration's words.

## Audio mix

- `prepare-audio.mjs` levels every source: narration −20 LUFS (80 Hz high-pass and a gentle 2.5:1 compressor), music −20 LUFS, effects −33 to −23 LUFS by role.
- The music ducks 12 dB under the voice. The envelope is computed from the word timings (0.1 s look-ahead, ~0.15 s attack, ~0.6 s release), so it swells in the pauses and on the logo moments. Fade in 0.5 s, fade out over the last 2.2 s.
- Effects (`audio/cues.ts`) sit on the same cues as the visuals: notifications, sent/received blips, the "disconnected" tone, the logo reveal shimmer, context-preserved chime, clock run, handoff chord and the final sonic logo.
- `master.mjs`: two-pass EBU R128 loudnorm to −14 LUFS integrated, −1.2 dBTP ceiling, linear (balance untouched), AAC 256 kbps / 48 kHz.
- Music and effects are original ElevenLabs generations (Music v2.5, Sound Effects v2) made in this account for this film.
