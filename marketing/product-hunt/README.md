# Product Hunt gallery

Two gallery images to sit beside the OG card (`public/og-card.png`). Their copy and sample data follow the launch film (`launch-video/`). Every store and person shown is fictional, and both images say so.

The PNGs are written to `public/`, so the site serves them at `truplexy.com/gallery-1-inbox.png` and `truplexy.com/gallery-2-handoff.png`.

| File | What it shows |
|---|---|
| `public/gallery-1-inbox.png` | "Every conversation. One inbox.": the Tickets inbox, with one conversation per channel and the AI summary and intent |
| `public/gallery-2-handoff.png` | "No repeating. No starting over. Just real help.": an answer with its source, then a handoff to the team with the thread attached |

Both are 2540×1520, which is twice Product Hunt's recommended 1270×760 at the same aspect ratio.

Edit the HTML and re-render:

```bash
node marketing/product-hunt/render.mjs
```

This needs Chrome or Edge, and the repo's `node_modules` for the fonts and `sharp`. Pass a single file name to render just that image.
