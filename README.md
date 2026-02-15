# NYC Curriculum Finder

Search NYC schools by date, district, school, and grade to instantly see:

- Curriculum (HMH Into Reading, EL Education, Wit & Wisdom)
- Current module (based on the selected date)
- Essential question
- Book list

## Quick start

Serve the folder locally:

```bash
cd "/Users/sandychan/Desktop/NYC Curriculum Finder"
python3 -m http.server 5173
```

Open `http://localhost:5173` in your browser.

## Vercel (Serverless) Deployment

This repo is structured for Vercel to host both the static frontend and a Python Flask API:

- Static frontend is served from `public/`
- Flask API runs as a Python Serverless Function in `api/index.py`

### Requirements

```bash
npm i -g vercel
```

### Local development

```bash
vercel dev
```

Then:
- UI: http://localhost:3000/
- API: http://localhost:3000/api/search?... and http://localhost:3000/api/meta, http://localhost:3000/api/modules

Notes:
- The Flask app in `api/index.py` defines routes without the `/api` prefix (e.g. `/search`), which Vercel mounts at `/api/search`.
- Frontend fetches use relative paths: `/api/meta`, `/api/search`, `/api/modules`.
- Ensure the hero image exists at `public/assets/nycreads-web-header.png`. If needed, copy it:

```bash
mkdir -p public/assets
cp assets/nycreads-web-header.png public/assets/
```

### Deploy

```bash
vercel
```

## Configure Google Sheet

This app loads data from a published Google Sheet with two tabs: `Pacing Guide` and `School Directories`.

1) Publish your sheet to the web (File → Share → Publish to web), ensure it’s visible to anyone with the link.
2) Copy the published base URL in this form (note `/pub`):

```
https://docs.google.com/spreadsheets/d/e/XXXX/pub
```

3) In `scripts/main.js`, update the config:

```js
const CONFIG = {
  SHEET_BASE_PUB: https://docs.google.com/spreadsheets/d/e/2PACX-1vSE0Mlty0JFy27H58nEULY3GNCsvwyCfIw4CQvf2_KbXsGXa4GIhU_SQojf5eXdz1MkKO7se9lJyjZT/pub,
  SHEETS: {
    pacingGuide: Pacing
