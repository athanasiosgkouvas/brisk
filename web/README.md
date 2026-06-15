# Brisk — demo site

A self-contained, static landing page for the Brisk hackathon submission. No build
step, no frameworks. Matches the app's "Aurora" design system, embeds the demo
video, and shows the key screens as faithful CSS phone mockups.

**Live:** https://brisk-site.onrender.com
**Demo video:** https://www.youtube.com/watch?v=K89fJfj3xQo

```
web/
├── index.html     # the whole page
├── styles.css     # Aurora tokens + phone mockups
├── script.js      # scroll-reveal, screen carousel, year stamp
├── assets/        # logo / favicon (copied from ../assets/images)
└── README.md
```

## Preview locally

Open `index.html` in a browser, or serve it:

```bash
cd web
python3 -m http.server 8080
# open http://localhost:8080
```

> The YouTube embed needs an http(s) origin — over `file://` it shows
> "Error 153". Use the local server above (or the live URL) to see it play.

## Deploy

### Render — manual static site (current setup)

The live site runs as a Render **Static Site** (not a Blueprint), deployed from
this repo:

| Setting           | Value                        |
| ----------------- | ---------------------------- |
| Type              | Static Site                  |
| Branch            | `main`                       |
| Root Directory    | `web`                        |
| Build Command     | _(empty — nothing to build)_ |
| Publish Directory | `.`                          |

It auto-deploys on every push to `main`. Asset URLs carry a `?v=N` query
(bumped on each change) so the CDN never serves stale CSS/JS.

> The root `render.yaml` also declares a `brisk-site` static service. That's
> only read if you deploy via **New + → Blueprint**; the current site was
> created manually, so the Blueprint entry is unused (kept for reference).

### GitHub Pages / Netlify / Vercel

Point the publish directory at `web/`, no build command. For GitHub Pages, move
these files to `/docs` (Pages can't serve a `web/` subfolder directly) or use a
Pages Action that publishes `web/`.

## Swapping in real screenshots

Each phone screen is a self-contained `.screen` block in `index.html`. To use a
real app screenshot instead of a CSS mockup, replace a `.screen`'s inner markup
with `<img src="assets/<shot>.png" alt="…">` sized to the frame.
