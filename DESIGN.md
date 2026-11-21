# MonkeyNote — Design

A piano sight-reading trainer with MonkeyType's UX: same layout, settings page,
themes, and keyboard-driven flow, applied to reading notes on a staff.

## Decisions

| Topic | Decision |
|---|---|
| Stack | Vanilla HTML + JS (ES modules), no build step. Small libraries only if unavoidable. |
| Hosting | GitHub Pages, served from `main` root: https://andrewemets.github.io/MonkeyNote/ |
| Storage | `localStorage` for settings and stats. Backend (login + stats sync) later; Supabase free tier is the candidate. |
| Notation | Own SVG renderer. Pitch only: no rhythm, bars, or tempo. Glyph outlines (clefs, noteheads, accidentals) extracted from Bravura into `js/data/glyphs.js` by `tools/extract-glyphs.py`. |
| Themes | Port MonkeyType's themes. Project is GPL-3.0 as a result; credit MonkeyType in README. |
| Input | MIDI, computer keyboard (piano layout only), on-screen keyboard (optional). |
| Sound | Web Audio. Simple synth first, piano samples later. |

## Layout (mirrors MonkeyType)

- **Top bar**: logo, nav icons (test, stats, settings, account later).
- **Test config bar**: toggles (chords, memory, ear) | mode (notes, time, attack, zen, custom) | mode values.
- **Test area**: a line of notes on a staff with a caret. Played notes take the
  `correct` / `error` theme colors; the line scrolls as you progress.
- **Below test**: restart button; on-screen keyboard when enabled.
- **Footer**: shortcut hints, theme name (click to open theme picker).
- **Shortcuts**: Tab restarts; Esc opens the command palette.

## Modes

| Mode | Values | Notes |
|---|---|---|
| notes | 10 / 25 / 50 / 100 / custom | Play a fixed count. |
| time | 15 / 30 / 60 / 120 / custom s | Play as many as possible. |
| attack | — | Notes scroll toward a hit line, speed ramps up. A note crossing the line costs a life (3 lives). Score: notes cleared, peak speed. |
| zen | — | Free play, no scoring. |
| custom | — | User-defined note sequence (later). |

Toggles (combine with notes / time / attack):

- **chords**: items become chords; played together.
- **memory**: notes fade out once the first note of the line is played.
- **ear**: notes are played as audio, staff hidden; replay key. First note shown
  as a pitch reference by default (setting).

## Note generation

- **Clef**: treble, bass, grand staff. Alto/tenor later.
- **Grand staff**: alternating (one staff at a time) or both hands (notes on both staves at once).
- **Range**: lowest / highest note, per staff.
- **Key signature**: fixed or random per test.
- **Accidentals**: none / in key only / chromatic.
- **Max leap** between consecutive items, so lines stay playable.
- **Chords**: max notes per chord (2–5); notes within one hand span (an octave);
  style random / triads / sevenths, with inversions.

## Input

- **MIDI** (Web MIDI; Chrome, Edge, Firefox — not Safari): exact pitch,
  enharmonics equivalent by nature. A chord counts when all its notes go down
  within a configurable window (default ~100 ms) or are held together.
- **Computer keyboard**: piano layout, matched by physical key (`KeyboardEvent.code`)
  so it works on any keyboard layout. Tracker-style two rows:
  - lower: `Z S X D C V G B H N J M ,` = C … C (white on `Z X C V B N M ,`, black on `S D G H J`)
  - upper: `Q 2 W 3 E R 5 T 6 Y 7 U I` = next octave
  - octave shift with arrow keys; current octave shown on screen.
  - Several keys at once form a chord.
- **On-screen keyboard**: click / touch; shows computer key labels. Chord
  completes once all its notes are added, in any order.
- **Wrong notes**: the note shakes and flashes red, and the caret stays until it is played correctly,
  so every note is eventually entered. (Unlike MonkeyType, which advances: a typist can backspace,
  a pianist can't un-play a note.) A note that needed correction is shown in the error-extra color.
- **Ignore octave**: off / keyboard only (default) / all inputs. The computer keyboard spans ~2.5 octaves,
  less than a grand staff, so by default it accepts the right note name in any octave.
  The keyboard's octave defaults per clef (Z = C4 treble, C2 bass, C3 grand staff).

## Results

- **npm**: items (notes or chords) completed per minute; wrong notes cost time rather than being skipped.
  The first item starts the clock, so it is excluded from speed.
- **acc**: correct key presses / all key presses. **notes**: first try / needed correction.
- **consistency**: evenness of time between items (MonkeyType's formula on the coefficient of variation).
- Speed-over-time chart (npm, raw, error marks) with hover tooltip.
- Missed-notes map: a piano tinted by miss rate per pitch, plus the most-missed list.
- Personal bests per configuration (mode + length + clef + accidentals + ledger lines + chords), stored locally.

## Settings page

Same long sectioned page with button groups and a search/jump list:

- **behavior**: (reserved) quick restart, test length defaults.
- **input**: MIDI device, chord window, keyboard octave, on-screen keyboard on/off.
- **sound**: play sound on press, volume, instrument.
- **notation**: clef, range, key signature, accidentals, max leap, chord style, note size, show note names (helper).
- **appearance**: caret style, font, smooth line scroll.
- **theme**: preset grid, custom colors, random theme.
- **danger zone**: reset settings, clear stats.

## Milestones

1. ✅ Skeleton: layout, theme system, settings store, SVG staff renderer, Pages deploy.
2. ✅ Core loop: notes, time and zen modes, all three inputs, caret and wrong-note feedback, chords, results screen.
3. Options: memory mode, max leap, chord styles, note-name helper.
4. Sound and ear mode.
5. Attack mode.
6. Command palette, full theme set, polish.
7. Backend: login and stats sync.

## Open details

- Exact attack-mode speed curve.
