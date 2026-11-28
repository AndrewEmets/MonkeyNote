# MonkeyScore

A sight-reading trainer for piano notation (formerly MonkeyNote), in the spirit of [MonkeyType](https://monkeytype.com).

Live: https://monkeyscore.github.io/app/

See [DESIGN.md](DESIGN.md) for the plan.

## Run locally

Plain HTML + JS modules, no build step. Serve the folder with any static server:

```
node tools/serve.js
```

then open http://localhost:8173.

## Debug mode

Open the page with `?debug` (or run "toggle debug mode" from the command palette) to get cheat keys on
the test page: <kbd>Enter</kbd> plays the right note or chord, <kbd>Backspace</kbd> a wrong one, and
<kbd>\</kbd> toggles autoplay (right notes every 0.7 s with the odd mistake). `?debug=0` turns it off.

In ear mode, <kbd>'</kbd> toggles the ear tempo test: the next group doesn't play by itself, you ask for it
(space, pedal or the replay button) when you're ready. Each wait is logged (under the staff, in the console
as plain text, or with "copy log") in seconds and beats, next to the pause the app would have picked, with
the batch size, your beat, how soon you started answering and how long the group took.

## Generated data

- `js/data/themes.js`: `node tools/build-themes.js path/to/monkeytype/frontend/src/ts/constants/themes.ts`
- `js/data/glyphs.js`: `python tools/extract-glyphs.py path/to/Bravura.otf` (needs `pip install fonttools`)
- `icons/*.png` (app icons): `python tools/build-icons.py` (needs `pip install pillow`)

## License

GPL-3.0.

- Themes are ported from [MonkeyType](https://github.com/monkeytypegame/monkeytype) (GPL-3.0).
- Music glyph outlines come from [Bravura](https://github.com/steinbergmedia/bravura) by Steinberg (SIL Open Font License 1.1, see [licenses/Bravura-OFL.txt](licenses/Bravura-OFL.txt)).
