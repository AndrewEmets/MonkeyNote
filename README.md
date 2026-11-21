# MonkeyNote

A sight-reading trainer for piano notation, in the spirit of [MonkeyType](https://monkeytype.com).

Live: https://andrewemets.github.io/MonkeyNote/

See [DESIGN.md](DESIGN.md) for the plan.

## Run locally

Plain HTML + JS modules, no build step. Serve the folder with any static server:

```
python -m http.server 8173
```

then open http://localhost:8173.

## Generated data

- `js/data/themes.js`: `node tools/build-themes.js path/to/monkeytype/frontend/src/ts/constants/themes.ts`
- `js/data/glyphs.js`: `python tools/extract-glyphs.py path/to/Bravura.otf` (needs `pip install fonttools`)

## License

GPL-3.0.

- Themes are ported from [MonkeyType](https://github.com/monkeytypegame/monkeytype) (GPL-3.0).
- Music glyph outlines come from [Bravura](https://github.com/steinbergmedia/bravura) by Steinberg (SIL Open Font License 1.1, see [licenses/Bravura-OFL.txt](licenses/Bravura-OFL.txt)).
