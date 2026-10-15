# Truplexy launch film: production report

Delivered 2026-10-14. Everything below was measured on the delivered files unless noted.

## Output

| | `truplexy-launch-final.mp4` (subtitled, primary) | `truplexy-launch-clean.mp4` |
|---|---|---|
| Runtime | 90.900 s (2,726 frames) | 90.900 s (2,726 frames) |
| Video | H.264 High, 1920×1080, 30 fps, yuv420p, BT.709 limited range | same |
| Audio | AAC-LC 48 kHz stereo, 256 kbps | same |
| Loudness | −14.0 LUFS integrated, −1.1 dBTP, LRA 2.0 LU | same |
| Size | 18.2 MB | 15.8 MB |

Also delivered: `truplexy-launch.srt` (47 phrases), `truplexy-launch-mix.wav` (mastered soundtrack), `captions/word-timings.json`, `previews/contact-sheet-final.png` (key frames taken from the encoded MP4) and `previews/transitions-check.png` (a frame from the middle of every scene change).

## Story and scenes

The story (v3): Truplexy is an AI assistant on every channel a business uses, plus one platform where the owner and team manage every conversation. The film does not claim that the assistant recognises the same customer across channels.

| # | Scene | Time |
|---|---|---|
| 01 | Your customers never stop asking | 0:00–0:11.5 |
| 02 | Juggling apps (separate inboxes, missed messages, customers waiting) | 0:11.5–0:21.2 |
| 03 | Meet Truplexy (AI assistant + your team, one platform) | 0:21.2–0:29.4 |
| 04 | One inbox (the dashboard's Tickets page) | 0:29.4–0:41.5 |
| 05 | Human-like support, 24/7 | 0:41.5–0:58.4 |
| 06 | Your business knowledge | 0:58.4–1:09.7 |
| 07 | AI efficiency, human connection | 1:09.7–1:20.5 |
| 08 | Every channel. One platform. | 1:20.5–1:30.9 |

**Headlines** use one motion system throughout: each word rises out of a mask on the frame it is spoken (word times from the narration), and accent words take the brand gradient a beat after they land. Headlines repeat the narration's words so this sync is exact. Only the logo moment ("Meet Truplexy.") reveals letter by letter.

The film is white-themed throughout: a white canvas with faint brand-tinted glows, white-to-white dissolves, no dark frames, and a white end card held to the last frame.

## Narration

- **Voice:** ElevenLabs "Brittney – Social Media Voice – Fun, Youthful & Informative" (`kPzsL2i3teMYv0FxEYQ6`), model `eleven_v4`. Each line opens `[energetic]` and lands its payoff `[confident]`, following the user's template generation `MFuB6DtFIeBlK37OrlEe`.
- **Script and takes:** take 4 of each scene, chosen by the user. Scenes 01, 05, 06 and 07 are the v2 script; 02, 03, 04 and 08 were re-voiced for the v3 story (v2 clips kept in `audio-archive/narration-v2/`). Lines are placed so about 0.5 s separates them across scene changes.
- **Pronunciation:** "Truplexy" is sent as IPA `/ˈtruːplɛksi/` (TROO-plex-ee, user-approved).
- **Validation:** all 8 clips were transcribed with ElevenLabs Scribe for word timings. For the four v3 clips the word times were also cross-checked against the clips' measured pauses (ffmpeg `silencedetect`), agreeing to within about 0.1 s.
- **Levelling:** all clips are levelled to the same loudness (−20 LUFS before mastering) through an 80 Hz high-pass and a gentle 2.5:1 compressor. Pre-master true peaks are −5.2 to −0.2 dBTP.

## Subtitles

- **Alignment method:** word-level timestamps from ElevenLabs Scribe on the exact delivered clips, offset by each clip's position on the timeline. No timing is estimated or evenly divided.
- **Phrasing:** 47 phrases, mostly 3–7 words (1 to 9, so a sentence can finish rather than split mid-thought), broken at sentence and clause boundaries. On screen from 0.12 s before the first word to 0.35 s after the last word (or until the next phrase).
- **Active-word highlight:** follows the measured word start times frame by frame. The burned-in subtitles and the SRT come from the same phrase data, so they match.
- **Placement:** lower centre, 92 px above the bottom edge, inside the safe area. Checked against every scene's UI. They stay clear of the logo and end card, and the last phrase leaves before the 2.6 s end-card hold.

## Audio mix

- **Music:** an original ElevenLabs Music v2.5 instrumental, chosen from 2 takes because its loudness arc matches the brief: a tense opening around −26 LUFS, a lift at 20–30 s, a peak at 70–85 s, and a resolve at the end. It is ducked 12 dB under the voice by an envelope built from the word timings (0.1 s look-ahead, ~0.15 s attack, ~0.6 s release), with a 0.5 s fade-in and a 2.2 s fade-out.
- **Effects:** 10 original ElevenLabs Sound Effects v2: notify, send, receive, whoosh, clock, disconnect, success, handoff, logo reveal and sonic logo. They make up about 50 cues, each tied to the same frame as its visual event, and are levelled to −33 to −23 LUFS so they always sit under the voice.
- **Master:** two-pass EBU R128 loudnorm (linear) to −14.0 LUFS integrated, −1.1 dBTP measured after AAC encoding. No clipping.

## Sources

- **Brand:** logo `src/assets/brand/mark.png` and `wordmark-dark.png`; colours, radii and easing from `src/styles/tokens.css`; Plus Jakarta Sans and Geist Mono from the site's `@fontsource-variable` packages.
- **UI:** recreated from the site (`TryChat.tsx`, `PhoneChat.astro`, `global.css`) and the dashboard (Sidebar, Tickets, Knowledge base, inspected live in its light theme in mock mode).
- **Channel logos:** `public/brands/*.svg`. Only channels marked `live` in `src/data/channels.ts` appear.

## Product claims shown, all confirmed in the repo or on truplexy.com

- Website chat, WhatsApp, Instagram, Messenger, Telegram, Discord and Email are live channels (`src/data/channels.ts`).
- Unified inbox: every conversation and ticket in one place, with status, AI summary and intent (`src/data/site.ts` nav, `src/components/home/Inbox.astro`, the dashboard Tickets page). Each conversation is shown on its own channel; the film makes no claim that one customer is recognised across channels.
- Always-on support while the team is offline (site "Continuous support" section).
- Order lookups (store integrations; `src/data/channel-pages.ts`).
- Answers from the knowledge base that cite their sources (dashboard Knowledge base copy; the chat API returns `sources`).
- Human handoff with the full thread and context (site "Human + AI" section; handoff packet fields from `src/data/demo.ts`).
- Starter and Pro plans and the free trial (`src/data/pricing.ts`).
- No metrics, testimonials, certifications or unsupported integrations are shown. All people, stores and orders are fictional and labelled "Sample store" or "Sample data".

## Quality checks completed

- Every scene reviewed from rendered stills at key moments, mid-animation and settled; headline masks checked for descender clipping.
- Transitions: a frame from the middle of each of the 7 scene changes, pulled from the encoded MP4. All are white-to-white, with no black or blank frames (also confirmed by an ffmpeg `blackdetect` pass: 0 segments).
- Container, codec, resolution, frame rate, frame count, duration and audio stream verified with ffprobe on both MP4s.
- Loudness and true peak verified with ffmpeg `ebur128` on both MP4s.
- The SRT and burned-in subtitles were generated from one source; spot-checked active-word highlights against the narration timing in rendered frames.

## Known limitations

- **Listening:** the mix was set and verified by measurement (loudness, peaks, ducking envelope, cue timing), but nobody has listened to it on headphones, laptop speakers or at low volume yet. Please give it that pass before launch. If anything needs adjusting, the duck depth (`DUCK_DB`), music level (`MUSIC_UP`) and per-cue trims (`audio/cues.ts`) are single numbers.
- **Product UI:** the UI is a faithful motion recreation, not live product screenshots. If the dashboard's design changes, update `src/components/Dashboard.tsx` and the scene files.
- **Product shot:** the jacket in Scene 05 is a drawn illustration, not a product photo, so no third-party imagery is used.
- **Tooling:** rendering needs Remotion's Chrome Headless Shell. The audio prep and mastering scripts need a full ffmpeg build (see README).
