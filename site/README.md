# GitHub Pages site

Static site deployed to GitHub Pages by `.github/workflows/pages.yml` on every
push to `main` that touches this directory.

## Structure

```
site/
  index.html        # landing page, lists pages from manifest.json
  manifest.json      # registry of published pages
  assets/style.css   # shared styles
  pages/              # individual html pages (charts, dashboards, etc.)
```

## Adding a new page

1. Add an HTML file under `site/pages/`, e.g. `site/pages/sales-2026.html`.
   Link `../assets/style.css` if it should match the site's look.
2. Add an entry to `site/manifest.json`:
   ```json
   {
     "title": "Sales 2026",
     "file": "pages/sales-2026.html",
     "description": "Monthly sales breakdown."
   }
   ```
3. Commit and push to `main`. The workflow republishes automatically.

## First-time setup

In the repo settings, under **Settings → Pages**, set **Source** to
**GitHub Actions** (only needed once).
