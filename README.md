# Keely's House of Cards

A static site for a sports card resale business: singles for sale, live pack opens
every Tuesday, a running feed of takes, and the baked goods she brings to shows.

Plain HTML, CSS and vanilla JavaScript. **No build step, no npm, no framework** —
open a file, edit it, push it, it's live. All of it can be done from a phone.

---

## Editing the content

You almost never need to touch the HTML. Everything that changes week to week
lives in **`data/`** as JSON:

| File | What's in it |
|---|---|
| `data/site.json` | Brand name, social links, contact, shipping rules, the signed-card promise, home-page section blurbs |
| `data/cards.json` | The shop catalog — one entry per card |
| `data/live-opens.json` | Tuesday schedule, upcoming opens, how-it-works steps, optional results archive |
| `data/projections.json` | The ticker feed and the picks board |
| `data/baked.json` | Baked goods gallery and the upcoming show schedule |

Each file starts with a `_readme` key explaining its own fields. Those `_`-prefixed
keys are notes only — the site ignores them.

### Rules that keep it from breaking

- It's JSON, so **every string needs double quotes** and every item except the last
  in a list needs a trailing comma. If a page goes blank after an edit, that's
  almost always a stray or missing comma.
- **Dates are `"YYYY-MM-DD"`.** Ticker entries can add a time: `"2026-09-17T21:40:00"`.
- **Prices are plain numbers** — `240`, not `"$240"`.
- **Photos:** set `photoFront` / `photoBack` / `photo` to a path like
  `"assets/img/purdy-front.jpg"`. Leave it `null` and the site draws a correctly
  sized `[PHOTO NEEDED]` frame instead. Never point it at a stock photo — the
  empty frame is the honest version.

### `[COPY NEEDED]` placeholders

Anywhere Keely's own words are needed, the JSON holds a string starting with
`[COPY NEEDED — …]`. The site renders those as a loud gold dashed box so filler
can't quietly go live. Replace the whole string with her actual copy and the
marker disappears on its own.

To find every one of them at a glance:

```
grep -rn "COPY NEEDED" data/
```

### The sample-data strip

Until real inventory is in, a striped banner sits at the top of every page saying
the data is sample data. Turn it off by setting `"demoMode": false` in
`data/site.json`.

---

## Adding a card

Copy an existing entry in `data/cards.json`, paste it into the list, and change the
values. The `id` must be unique — it's what the product URL uses.

```json
{
  "id": "nfl-2024-nabers-select",
  "player": "Malik Nabers",
  "team": "New York Giants",
  "sport": "NFL",
  "year": 2024,
  "set": "Panini Select",
  "cardNumber": "#41",
  "parallel": "Concourse",
  "graded": false,
  "grader": null,
  "grade": null,
  "condition": "Mint",
  "price": 28,
  "status": "available",
  "featured": false,
  "photoFront": null,
  "photoBack": null,
  "notes": null,
  "addedOn": "2026-09-01"
}
```

- `status` is `"available"`, `"sold"` or `"reserved"`. Sold cards stay in the file —
  they're hidden from the default view and show up under "Sold archive".
- `graded: true` uses `grader` + `grade` and gets the foil slab chip.
  `graded: false` uses `condition`.
- `featured: true` puts it on the home page.
- The filters (sport, team, price) build themselves from whatever is in the file.
  Add an MLB card and "MLB" appears in the sport filter by itself.

## Adding a Tuesday

Add an entry to `opens` in `data/live-opens.json`. The page picks the soonest
upcoming date as "this week" automatically and lists the rest below it, so past
dates can just be deleted.

`status: "open"` makes the buy-a-spot button live; `"announced"` shows it as
posted-but-not-on-sale. Set `archive.enabled` to `false` to hide the results
section entirely.

## Posting a take

Newest entries go at the **top** of `ticker.entries` in `data/projections.json`.
Copy the entry above, change the `id`, `date` and `text`. That's it.

## Changing a pick

In `picksBoard.rows`, edit `pick` in place, then move the old value into that
row's `history` list with the date it changed. The board shows the old pick with a
line through it rather than losing it, and `lastUpdated` drives the stamp at the
top. Awards are just rows — add or remove as many as she wants to track.

---

## Deploying

The site is static files at the repository root, so both of these work with no
terminal.

### GitHub Pages (all from the phone browser)

1. Push this repo to GitHub.
2. Repo → **Settings** → **Pages**.
3. **Source:** "Deploy from a branch". **Branch:** `main`, folder `/ (root)`. Save.
4. A minute later it's live at `https://<username>.github.io/<repo>/`.

Every push republishes. `.nojekyll` is already in the repo so GitHub serves the
files as they are.

Custom domain: same Pages screen, "Custom domain", then point the domain's DNS at
GitHub per the instructions it shows.

### Netlify

1. netlify.com → **Add new site** → **Import an existing project** → GitHub → this repo.
2. Leave the build command empty and the publish directory as `.` —
   `netlify.toml` already sets both.
3. Deploy. Every push republishes.

Netlify also takes a drag-and-drop of the folder if connecting GitHub is a hassle,
but the GitHub connection is what makes phone edits publish themselves.

### Previewing locally (optional)

The pages `fetch()` the JSON in `data/`, which browsers block for files opened
directly off the disk. Serve it over http instead:

```
python3 -m http.server 8000     # then open http://localhost:8000
```

---

## Payment is deliberately unfinished

Everything up to payment works: cart, quantities, shipping details, order summary,
totals with shipping rules. Cards from the shop and pack-open spots share one cart.

The payment step is a clearly-marked stub. Right now, submitting the form opens a
pre-filled email with the full order so real orders can still happen.

Wiring in a processor is one function: `startPayment()` at the bottom of
`assets/js/cart.js`, which has the Stripe and Square shapes written out in a
comment. Both need a small server-side piece (Netlify Functions, Cloudflare
Workers) because the secret key must never live in these files.

Cart contents and typed shipping details are kept in the browser's `localStorage`.
There is no backend and no database — nothing is sent anywhere until she's emailed.

---

## How it's put together

```
index.html            Home
shop.html             Catalog with filter / sort / search
product.html          Card detail (reads ?id= from the URL)
live-opens.html       Tuesday schedule + buy a spot
projections.html      The ticker + the picks board
baked.html            Gallery by show + upcoming shows
cart.html             Cart, shipping details, stubbed payment
404.html

assets/css/main.css   The whole stylesheet, sectioned and commented
assets/js/site.js     Shared: data loading, header/footer, cart, formatting
assets/js/*.js        One small file per page
data/*.json           All the content
```

Header and footer are generated by `site.js` from `data/site.json`, so social
links, the promise and the nav are edited in one place and change everywhere.

### Design notes

The layout borrows from the object it sells. Photo frames hold a real 2.5×3.5 card
ratio whether or not there's a photo in them. The shop is a binder page with punched
rings, not a generic product grid. Graded cards get a slab label with the grader and
grade. Stat lines are set the way the back of a card is set. Tilt-on-hover is limited
to the catalog pockets, on pointer devices, and is off for anyone who asks for
reduced motion.

Type is Big Shoulders Display (condensed, scoreboard-ish) for headings, Archivo and
Archivo Narrow for text and stat lines, and Nothing You Could Do for anything tied
to the hand-signed promise. Colors are card-stock cream, near-black ink, one foil
gold used only for rarity and signed cues, and one saturated pine green for actions.

Mobile-first throughout, real `alt` text on every image, keyboard-focusable
everything, and it stays legible with the fonts still loading.
