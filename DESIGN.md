# MonkeyScore — Design

A piano sight-reading trainer with MonkeyType's UX: same layout, settings page,
themes, and keyboard-driven flow, applied to reading notes on a staff.

## Decisions

| Topic | Decision |
|---|---|
| Stack | Vanilla HTML + JS (ES modules), no build step. Small libraries only if unavoidable. |
| Hosting | GitHub Pages, served from `main` root: https://andrewemets.github.io/MonkeyScore/ |
| App | Installable (web app manifest, icons in `icons/` drawn by `tools/build-icons.py`) and usable offline: `sw.js` serves network-first with the cached copy as fallback (fonts cache-first); the page hands it the files it loaded before the worker took over. |
| Storage | `localStorage` only: settings, results (last 5000), personal bests, activity counters. No backend. |
| Notation | Own SVG renderer. Pitch only: no rhythm, bars, or tempo. Glyph outlines (clefs, noteheads, accidentals) extracted from Bravura into `js/data/glyphs.js` by `tools/extract-glyphs.py`. |
| Themes | Port MonkeyType's themes. Project is GPL-3.0 as a result; credit MonkeyType in README. |
| Input | MIDI, computer keyboard (piano layout only), on-screen keyboard (optional). |
| Sound | Built-in Web Audio synth, or the MIDI keyboard's own sound via MIDI output (setting). Synth: an additive "piano" (decaying, slightly stretched harmonics) and a soft sine voice. Notes you press are played for keyboard/screen input by default (MIDI keyboards often have speakers). Optional wrong-note thud (a GM drum on channel 10 when sound goes to the MIDI keyboard). Volume in 5% steps. Samples may come later. |

## Layout (mirrors MonkeyType)

Content column 62.5rem (1000px at 16px). The root font size grows on big screens
(`clamp(16px, min(0.95vw, 1.6vh), 28px)`: from about 1700x1000 up), and the staff's size in px follows it,
so a 1920x1080 or 1440p screen gets a wider column and bigger notes rather than a small island.

- **Top bar**: logo, nav icons (test, stats, settings).
- **Test config bar**: presentation (default / memory / ear, one at a time) | batch (memory: 2/4/8/custom;
  ear: 1/2/3/custom) | mode (notes, time, attack, zen) | length (presets + custom). Sections grow in and
  collapse by width when they appear or go, so the others slide instead of jumping.
- **Above the staff**: level, clef, key (+ ", chromatic"), single / chords, and "range"
  (max leap and ledger lines; the values in its tooltip) are dropdowns. Key opens side panels (random / major / minor / harmonic minor), then diatonic /
  chromatic below a line; chords opens density / style / max notes; leaps and ledger lines are two columns
  in one dropdown. A pick keeps the dropdown
  open (checkmarks update) so several things can be changed; an outside click or Esc closes it.
- **Test area**: a line of notes on a staff with a caret. At the end of a line (or memory batch) the last
  note finishes its animation; the caret moves to the next line while the rows slide up and the finished
  line fades out (or, with one visible line, the last note shows played, then it fades out and the next
  fades in). Playing during the change speeds the animation up 4x. The staff keeps its height so the
  last line doesn't make the page jump.
- **Pace caret** (off / average of last 10 runs with these settings / best / custom npm): a faint second
  caret moving at that speed, starting with the first note. Thin divider lines mark
  every 4 notes (setting). Played notes take
  the text color; notes that needed correction the error-extra color.
- **Below test**: restart button; on-screen keyboard when enabled.
- **Caret**: stretches to cover notes on ledger lines; on the grand staff it spans both staves.
- **Groups** (memory batch, ear group): a line holds whole groups when they fit, and divider lines (when on)
  mark the groups instead of every 4 notes. The quick picks in the test bar (2/4/8 and 2/3/4 by default)
  can be changed in the custom prompt; a custom value shows as the wrench and the number.
- **Short screens** (a phone held sideways, height ≤ 500px): the name shortens to "ms", the test bar moves up
  beside it on one row, tighter spacing, no keyboard hints, shorter on-screen keys and one staff line, so the
  test fits without scrolling (on-screen keyboard included from ~840px wide). On phones the test bar
  shortens the unselected labels to four letters (dflt, memo, note, attk) and drops their icons; group
  sizes and lengths fold to the selected value (dashed underline), and clicking it slides the rest in; the selected ones keep their full
  name, unless the bar still doesn't fit on one row (then they shorten too).
- **Header**: logo, test / stats / settings, and a user-settings button (placeholder for now).
- **Per-presentation settings**: default, memory and ear each keep their own mode, length and notation
  (clef, key, accidentals, leaps, ledger lines, chords). Switching presentation brings back the ones last
  used there; the first switch copies the current ones. Picking a ranked level switches to default first.
  Reset settings starts all three over.
- **Share settings** (icon at the end of the line above the staff, or the command line): a dialog with
  groups to include (test and notation: what sets the difficulty; both on), a link and a copy button.
  The link is `?s=` + base64url JSON of the chosen groups and their non-default values; opening it applies
  them (presentation first), shows a note and removes the parameter from the address bar.
- **Footer**: shortcut hints, theme name (click to open theme picker).
- **Shortcuts**: Tab restarts; Esc or Ctrl/Cmd+Shift+P opens the command palette: search every setting
  and action, settings open a submenu of their values, themes preview as you move through them.
  The footer theme name opens the theme list.

## Modes

| Mode | Values | Notes |
|---|---|---|
| notes | 8 / 16 / 32 / 64 / custom (1–999) | Play a fixed count. |
| time | 15 / 30 / 60 / 120 / custom (5–3600) s | Play as many as possible. |
| attack | 20 / 30 / 45 / 60 npm start | One staff line scrolls toward a hit line after the key signature; speed rises 20 npm per minute. Notes can be played early (in order). A note reaching the line costs a life (3 lives), turns red and stays current: the notes spring back 4 slots, then restart slowly and speed back up over 2.5 s. Wrong notes cost time only. Score: notes played on time; also speed reached and missed count. Memory and ear work here too. |
| zen | — | Free play, no scoring. |
| custom | — | User-defined note sequence (later). |

Toggles (combine with notes / time / attack):

- **chords**: items become chords; played together.
- **memory**: notes come in batches of 2 / 4 / 8 / custom (1–32), chosen in the test bar. All lines show as
  in other modes; every batch is visible until its first note is played, then the rest of it fades out.
  A wrong note sends the caret back to the batch start and shows the whole batch again; it hides once the
  batch's first note is played, and the whole batch has to be played again. In attack mode the groups
  scroll in visible; once a group's first note is played the rest of it hides (a missed note is revealed).
  Memory and ear are exclusive (ear already hides notes).
- **ear**: notes (or chords) are played as audio in groups of 2 / 3 / 4 / custom (2–8), and stay hidden on
  the staff until you play them; the next group plays once the last one is done. Each note pulses as it
  sounds. The first note of every group is always shown (relative hearing: hear the rest against it). Replay (the whole batch) with space, the replay button, or the MIDI sustain pedal.
  A wrong note sends the caret back to the batch start and replays the batch; notes found so far stay
  shown, but the whole batch has to be played again. After 3 wrong tries on a note it is shown.
  Replayed notes keep their first result (no new speed or accuracy credit; wrong notes still count).
  Playing while a group is being played stops the playback.
- **Ear timing (4/4 at your tempo)**: the beat is your typical time between notes found in a row (lower
  median of the last 8, 0.35–1.5 s; 0.65 s until you've played; kept for the page view). Groups play at
  that beat, and the next group starts on a bar line (4 beats) counted from the start of the last
  playback, at least half a beat after your last note. Answering right after the playback brings the
  next group on the next bar; leaving a rest moves it to the bar after. After a wrong note the group
  replays after max(1.1 s, 2 beats). (Tuned from a tempo-test log: every wait was a whole number of
  beats and every call-and-response cycle a whole number of bars.)
- **Whole groups**: a notes test in memory or ear mode rounds its length to the nearest whole number of
  groups (32 notes in groups of 3 → 33; 16 → 15).
  Attack mode can't go back: a wrong note there replays the current note only.
  The caret flashes red on wrong notes, so feedback shows even for hidden notes.

## Note generation

- **Clef**: treble, bass, grand staff. Alto/tenor later.
- **Grand staff**: alternating (one staff at a time) or both hands (notes on both staves at once).
- **Range**: lowest / highest note, per staff.
- **Key**: any major key, natural minor (same signature and notes as its relative major) or harmonic minor
  (raised 7th as an accidental), or random per test: any key, up to 2♯/♭, up to N sharps, or up to N flats (random
  picks major, minor or harmonic minor too). Chosen from a menu with random / major / minor side panels.
- **Accidentals**: none / in key only / chromatic.
- **Max leap** between consecutive items on a staff: 2nd / 3rd / 4th / 5th / octave (default) / any.
- **Chords**: style random (2–max notes stacked within an octave), triads, sevenths, or both.
  Triads and sevenths are built on the key's scale degrees (so they're the key's own chords),
  in root position and every inversion, and are never chromatically altered.
- **Chord density**: each item gets `1 + floor(r^p × max)` notes for a random r in [0, 1) (max = max chord notes,
  or the triad/seventh size). p = 3 / 2 / 1 / 0.5 / 0.33: mostly single, sparse, even (default), dense, mostly full.
  Smaller triads/sevenths take the lowest notes of the shape (a third or fourth, etc.).
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
  lowest and highest key). Reset forgets it after switching keyboards. With "fit notes to keyboard" (default
  on) only notes inside the range are generated; any that still fall outside are accepted in any octave. Stored apart from settings (it describes hardware).

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
- Personal bests per ranked level + mode + length, plus practice (see Ranked levels), stored locally.

## Ranked levels

Fixed notation settings everyone competes on (bests are local for now; a leaderboard could use the same levels).
Picked from the first dropdown above the staff (level details in tooltips); a crown marks a ranked setup.
Picking a level remembers your own settings; "custom" brings them back.

| Level | Settings |
|---|---|
| beginner | treble, C major, no ledger lines, single notes, leaps up to a 3rd |
| intermediate | grand staff, random key with up to 2 sharps/flats, 2 ledger lines, single notes, leaps up to a 5th |
| advanced | grand staff, any key, chromatic, 3 ledger lines, chords (random, max 3, even density) |
| expert | grand staff, any key, chromatic, 4 ledger lines, any leap, chords (random, max 4, dense) |

A test is ranked when its settings match a level, its length is notes 16/32 or time 30/60, notes are read
normally (not memory or ear) and no key-light hints were used. Everything else is **practice**. Personal
bests are kept per level + mode + length, and one set for practice. All results stay in the history.

## Key lights

For keyboards that light keys for notes received on a guide channel (Casio "MIDI IN Navigate": channel 4
right hand, 3 left hand by default). Off / light the current note / light it only after a wrong note.
Notes go out at velocity 1 on the chosen channel, whose volume (CC 7/11) is turned down so lit notes stay
silent; it's restored when lights are turned off or the page closes. Hinted tests count as practice. Brands with proprietary
light protocols (e.g. ROLI/Lumi SysEx) aren't covered.

## Stats page

Modeled on MonkeyType's account page, all from local data:

- **Summary**: tests started, tests completed, time playing (abandoned tests count toward time), since date.
- **Personal bests**: one row per ranked level plus practice, for notes 16/32 and time 30/60.
- **Activity heatmap**: tests per day over the last 12 months.
- **Filters** (apply to everything below): all / current notation settings; last day / week / month /
  3 months / all time; mode.
- **Charts**: npm per test with averages of 10 and 100; accuracy per test (separate chart, no dual axis);
  speed change per hour of practice (least-squares slope); tests by npm (histogram); practice time per day.
- **Averages**: highest / average / last-10 npm, accuracy, consistency; tests per active day; notes played.
- **Weakest notes**: miss rate per pitch over the filtered results, as a tinted piano and a list.
- **Results table** with load more and CSV export.

## Settings page

Same long sectioned page with button groups, a search box (settings and theme names), a jump list and a
back-to-top button once scrolled down:

- **behavior**: (reserved) quick restart, test length defaults.
- **input**: MIDI device, chord window, keyboard octave, on-screen keyboard on/off.
- **sound**: play notes you press (off / keyboard & screen / all), instrument, volume, error sound.
- (no notation section: clef, key, accidentals, leaps, ledger lines and chords are picked above the staff)
- **appearance**: note size, note names (helper), staff lines, divider lines, caret style, pace caret, smooth
  caret, flip test colors, font.
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
