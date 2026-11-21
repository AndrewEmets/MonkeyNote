# MonkeyNote — Design

A piano sight-reading trainer with MonkeyType's UX: same layout, settings page,
themes, and keyboard-driven flow, applied to reading notes on a staff.

## Decisions

| Topic | Decision |
|---|---|
| Stack | Vanilla HTML + JS (ES modules), no build step. Small libraries only if unavoidable. |
| Hosting | GitHub Pages, served from `main` root: https://andrewemets.github.io/MonkeyNote/ |
| Storage | `localStorage` only: settings, results (last 5000), personal bests, activity counters. No backend. |
| Notation | Own SVG renderer. Pitch only: no rhythm, bars, or tempo. Glyph outlines (clefs, noteheads, accidentals) extracted from Bravura into `js/data/glyphs.js` by `tools/extract-glyphs.py`. |
| Themes | Port MonkeyType's themes. Project is GPL-3.0 as a result; credit MonkeyType in README. |
| Input | MIDI, computer keyboard (piano layout only), on-screen keyboard (optional). |
| Sound | Web Audio synth, no samples: an additive "piano" (decaying, slightly stretched harmonics) and a soft sine voice. Notes you press are played for keyboard/screen input by default (MIDI keyboards often have speakers). Optional wrong-note thud. Samples may come later. |

## Layout (mirrors MonkeyType)

- **Top bar**: logo, nav icons (test, stats, settings).
- **Test config bar**: toggles (chords, memory, ear) | mode (notes, time, attack, zen, custom) | mode values.
- **Test area**: a line of notes on a staff with a caret. Played notes take the
  `correct` / `error` theme colors; the line scrolls as you progress.
- **Below test**: restart button; on-screen keyboard when enabled.
- **Footer**: shortcut hints, theme name (click to open theme picker).
- **Shortcuts**: Tab restarts; Esc or Ctrl/Cmd+Shift+P opens the command palette: search every setting
  and action, settings open a submenu of their values, themes preview as you move through them.
  The footer theme name opens the theme list.

## Modes

| Mode | Values | Notes |
|---|---|---|
| notes | 10 / 25 / 50 / 100 / custom | Play a fixed count. |
| time | 15 / 30 / 60 / 120 / custom s | Play as many as possible. |
| attack | 20 / 30 / 45 / 60 npm start | One staff line scrolls toward a hit line after the key signature; speed rises 20 npm per minute. Notes can be played early (in order). A note reaching the line unplayed is missed and costs a life (3 lives). Wrong notes cost time only. Score: notes played; also speed reached and missed count. Memory has no effect here; ear works (notes hidden, played as they come up). |
| zen | — | Free play, no scoring. |
| custom | — | User-defined note sequence (later). |

Toggles (combine with notes / time / attack):

- **chords**: items become chords; played together.
- **memory**: once the first note of the current line is played, the rest of that line fades out
  (the next line stays visible, so you can memorize it ahead). A wrong note reveals the note it was
  meant for, since every note has to be played to move on.
- **ear**: each note (or chord) is played as audio and stays hidden on the staff until you play it.
  The first note is shown as a pitch reference (setting). Replay with space, the replay button,
  or the MIDI sustain pedal. A wrong note replays the target; after 3 wrong tries the note is shown.
  The caret flashes red on wrong notes, so feedback shows even for hidden notes.

## Note generation

- **Clef**: treble, bass, grand staff. Alto/tenor later.
- **Grand staff**: alternating (one staff at a time) or both hands (notes on both staves at once).
- **Range**: lowest / highest note, per staff.
- **Key signature**: fixed or random per test.
- **Accidentals**: none / in key only / chromatic.
- **Max leap** between consecutive items on a staff: 2nd / 3rd / 4th / 5th / octave (default) / any.
- **Chords**: style random (2–max notes stacked within an octave), triads, sevenths, or both.
  Triads and sevenths are built on the key's scale degrees (so they're the key's own chords),
  in root position and every inversion, and are never chromatically altered.
- **Note names** (helper): the note's letter and accidental next to each notehead.

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
- **MIDI keyboard range**: browsers can't query it, so it is learned from the lowest/highest keys played
  (trusted once it spans two octaves), or set in settings (25–88 key presets, or detect by pressing the
  lowest and highest key). Reset forgets it after switching keyboards. MIDI notes outside the range are
  accepted in any octave. Stored apart from settings (it describes hardware).

## MIDI controls (results screen only)

The results screen is the one place where notes can't start or affect an exercise, so white keys
(any octave) act as buttons there. A 1 s lockout ignores trailing notes from the exercise.
Shown only when a MIDI device is connected.

| Key | Action |
|---|---|
| C | restart (with any changes below) |
| D / E / F | toggle chords / memory / ear |
| G | cycle mode: notes → time → zen |
| A | cycle length (notes count or seconds) |
| B | cycle clef: treble → bass → grand staff |

Changes made this way keep the results screen up; C starts the new test. (Mouse clicks on the test bar
restart immediately, as in MonkeyType.)

## Results

- **npm**: items (notes or chords) completed per minute; wrong notes cost time rather than being skipped.
  The first item starts the clock, so it is excluded from speed.
- **acc**: correct key presses / all key presses. **notes**: first try / needed correction.
- **consistency**: evenness of time between items (MonkeyType's formula on the coefficient of variation).
- Speed-over-time chart (npm, wrong-note marks) with hover tooltip.
- Missed-notes map: a piano tinted by miss rate per pitch, plus the most-missed list.
- Personal bests per configuration (mode + length + clef + accidentals + ledger lines + chords), stored locally.

## Stats page

Modeled on MonkeyType's account page, all from local data:

- **Summary**: tests started, tests completed, time playing (abandoned tests count toward time), since date.
- **Personal bests**: notes 10/25/50/100, time 15/30/60/120, attack score per start speed; best across all
  notation settings, details on hover.
- **Activity heatmap**: tests per day over the last 12 months.
- **Filters** (apply to everything below): all / current notation settings; last day / week / month /
  3 months / all time; mode.
- **Charts**: npm per test with averages of 10 and 100; accuracy per test (separate chart, no dual axis);
  speed change per hour of practice (least-squares slope); tests by npm (histogram); practice time per day.
- **Averages**: highest / average / last-10 npm, accuracy, consistency; tests per active day; notes played.
- **Weakest notes**: miss rate per pitch over the filtered results, as a tinted piano and a list.
- **Results table** with load more and CSV export.

## Settings page

Same long sectioned page with button groups and a search/jump list:

- **behavior**: (reserved) quick restart, test length defaults.
- **input**: MIDI device, chord window, keyboard octave, on-screen keyboard on/off.
- **sound**: play notes you press (off / keyboard & screen / all), instrument, volume, error sound, ear-mode reference.
- **notation**: clef, range, key signature, accidentals, max leap, chord style, note size, show note names (helper).
- **appearance**: note size, staff lines, caret style, smooth caret, flip test colors, font.
- **theme**: random theme (each test), custom theme (8 color pickers, starting from the current theme), preset grid with search and hover preview. The tab icon takes the theme's colors.
- **danger zone**: reset settings, clear stats.

## Milestones

1. ✅ Skeleton: layout, theme system, settings store, SVG staff renderer, Pages deploy.
2. ✅ Core loop: notes, time and zen modes, all three inputs, caret and wrong-note feedback, chords, results screen.
3. ✅ Options: memory mode, max leap, chord styles, note-name helper.
4. ✅ Sound and ear mode.
5. ✅ Attack mode.
6. ✅ Command palette, custom/random themes, flip colors, themed favicon.
7. ✅ Stats page (local only; login and sync dropped: no backend).
