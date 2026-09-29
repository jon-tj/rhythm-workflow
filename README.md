# Rhythm

A personal work-rhythm app: Pomodoro-style focus blocks across projects and activities, movement breaks, spaced repetition, focus-loss tracking and lightweight reflection. See [ideas.md](ideas.md) for the original outline.

Plain HTML, CSS and JavaScript with no build step. All data stays in your browser: localStorage for state, IndexedDB for canvas images. Use **Settings → Export backup** to save a copy or move it to another device.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server (for example `npx serve .`).

## Deploy to GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
3. The site is published at `https://<user>.github.io/<repo>/`.

## Files

| File | Purpose |
|---|---|
| `js/store.js` | State shape, persistence, projects, activities and blocks |
| `js/session.js` | Focus → time up → break lifecycle, lost focus, left-site detection |
| `js/srs.js` | Anki-style spaced repetition (SM-2), with mirrored cards |
| `js/canvas.js` | Project canvas you can pan and zoom, with notes and images (paste or drop) |
| `js/views.js` | All screens |
| `js/app.js` | Router, tick loop, live clocks |
