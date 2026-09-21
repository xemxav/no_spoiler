# No Spoiler — Design System

The single source of truth for how this product looks. Written to be consumed
by another session without reading the conversation that produced it.

**Visual reference:** [No Spoiler — Maquettes UI](https://claude.ai/artifact/777pvycNwi8i2TSMyEGTGK)
— popup states, in-page states, and the identity sheet.

**If this document and a mockup disagree, this document wins.** Mockups drift;
tokens do not.

---

## How to use this

Two surfaces consume these tokens, and they are not interchangeable:

| Surface | Where styles live | Constraint |
| --- | --- | --- |
| **Popup** | Its own stylesheet, shipped with the extension | Normal page. Anything goes. |
| **In-page (X)** | Injected by the content script | Hostile DOM. Read "In-page rules" before writing a single line. |

Paste the token block below into the popup stylesheet as-is. For in-page
styles, **do not** define custom properties on `:root` — see In-page rules.

---

## Tokens

```css
:root {
  /* Ground */
  --ns-paper:        #FBF7F0;  /* app background */
  --ns-surface:      #FFFFFF;  /* cards, rows, header/footer bands */
  --ns-sunken:       #EFEAE0;  /* disabled control track */
  --ns-rule:         #E4DDD0;  /* hairlines, dividers */
  --ns-rule-dashed:  #C9C1B2;  /* dashed advisory boxes */

  /* Ink */
  --ns-ink:          #141218;  /* borders, primary text, all glyphs */
  --ns-ink-2:        #3C3747;  /* body copy on paper */
  --ns-ink-3:        #5C5668;  /* labels, captions */
  --ns-ink-muted:    #9A94A6;  /* disabled text and knobs */

  /* Accents — meaning, not decoration */
  --ns-coral:        #FF3D5A;  /* brand, and "this is a spoiler" */
  --ns-teal:         #00C2A8;  /* safe, active, confirm */
  --ns-amber:        #FFD84D;  /* pending, slow — never brand */

  /* Accent text, for use ON paper/surface */
  --ns-teal-text:    #0A7263;
  --ns-teal-text-hi: #075548;  /* hover */
  --ns-coral-text:   #A81B2F;
  --ns-coral-line:   #C42038;  /* error borders */
  --ns-coral-wash:   #FFF1F3;  /* error field background */

  /* Type */
  --ns-font-display: "Bricolage Grotesque", system-ui, sans-serif;
  --ns-font-ui:      "Manrope", system-ui, sans-serif;

  /* Radii */
  --ns-r-xs:   9px;    /* 32px icon buttons */
  --ns-r-s:   12px;
  --ns-r-m:   14px;    /* inputs, list rows, standard buttons */
  --ns-r-l:   16px;    /* prominent inputs, cards */
  --ns-r-xl:  18px;    /* post cards in the feed */
  --ns-r-pill: 999px;

  /* Structure */
  --ns-border:       2px solid var(--ns-ink);
  --ns-shadow:       3px 3px 0 var(--ns-ink);   /* small controls */
  --ns-shadow-hi:    4px 4px 0 var(--ns-ink);   /* primary actions, cards */
  --ns-shadow-hero:  6px 6px 0 var(--ns-ink);   /* logo tile only */

  /* Motion */
  --ns-t-state:  120ms ease-out;  /* hover, press, toggle */
  --ns-t-expand: 160ms ease-out;  /* the in-page pill expanding */
}
```

### Colour meaning is load-bearing

Each accent carries one meaning. Reusing one for decoration breaks the states.

| Token | Means | Never use for |
| --- | --- | --- |
| `--ns-coral` | Brand, and "spoiler detected" | A generic highlight |
| `--ns-teal` | Safe, active, confirming action | A destructive action |
| `--ns-amber` | Pending, slow, degraded | **The logo.** It would make the brand indistinguishable from the "slow engine" state |

### Ink on colour, always

Every accent is a *fill*; text and glyphs on it are `--ns-ink`. Verified
contrast against `--ns-ink`:

| Fill | Ratio | Verdict |
| --- | --- | --- |
| `--ns-paper` | 17.4:1 | pass |
| `--ns-amber` | 13.4:1 | pass |
| `--ns-teal` | 8.2:1 | pass |
| `--ns-coral` | 5.4:1 | pass |

**White text on `--ns-coral` is 3.5:1 and on `--ns-teal` is 2.3:1 — both fail.**
Do not reach for white on an accent.

Text on `--ns-paper`: `--ns-ink-2` is 10.7:1, `--ns-ink-3` is 6.6:1,
`--ns-teal-text` is 5.5:1, `--ns-coral-text` on `--ns-coral-wash` is 6.7:1. All
pass AA. `--ns-ink-muted` is for disabled affordances only and is not held to
the text threshold.

---

## Type scale

Display is Bricolage Grotesque at weight 800, always tight-tracked. UI is
Manrope; weight carries hierarchy far more than size does.

| Role | Family | Size / line-height | Weight | Tracking |
| --- | --- | --- | --- | --- |
| `display-l` | display | 32 / 1.02 | 800 | -0.9px |
| `display-m` | display | 22 / 1.10 | 800 | -0.5px |
| `display-s` | display | 18 / 1.00 | 800 | -0.4px |
| `body-l` | ui | 14 / 1.45 | 700 | — |
| `body-m` | ui | 13 / 1.55 | 500 | — |
| `body-s` | ui | 12 / 1.45 | 600 | — |
| `label` | ui | 11 / 1.00 | 800 | 0.6px, uppercase |
| `micro` | ui | 10 / 1.00 | 800 | 0.7px, uppercase |

`label` and `micro` are section headers and status strings only. Never set a
sentence in them.

### Fonts are self-hosted

Ship the `woff2` files with the extension and declare `@font-face` locally.
Do **not** link a font CDN: an extension page should make no network request
to render, and it must work offline. Both families fall back to `system-ui`.

---

## Spacing

A 4px base. Use `4 · 8 · 12 · 16 · 20 · 24 · 32`. Two habits carry most of the
layout:

- Panel padding is `20px` horizontally in the popup, `24px` for hero blocks.
- Sibling groups are laid out with flex or grid plus `gap`, never margins.

---

## Components

### Button

All buttons are real `<button type="button">` (or `submit`). Never a styled
`div` — Tab skips it.

| Variant | Fill | Border | Shadow | Use |
| --- | --- | --- | --- | --- |
| Primary | `--ns-teal` | ink 2px | `--ns-shadow-hi` | The one action that moves the flow forward |
| Accent | `--ns-amber` | ink 2px | `--ns-shadow` | Add-to-list, retry |
| Secondary | `--ns-surface` | ink 2px | none | Everything else |
| Quiet | `--ns-paper` | ink 2px | none | Icon buttons inside a row |

Heights: `46–52px` for primary actions, `40–44px` for secondary, `30–32px`
for icon buttons nested in a row. Radius `--ns-r-m`, or `--ns-r-l` on
full-width primaries.

On press, translate by the shadow offset and drop the shadow — the button
appears to physically depress. Skip it under `prefers-reduced-motion`.

### Input

Always paired with a real `<label for="…">`. `--ns-surface` fill, ink 2px
border, radius `--ns-r-m`, height `46–52px`, `600` weight.

Error state: border `--ns-coral-line`, fill `--ns-coral-wash`,
`aria-invalid="true"`, and `aria-describedby` pointing at the message. The
message sits below in `--ns-coral-text`, `body-s`, preceded by a stroke icon.
It clears on the next edit.

### Toggle

A `<button>` with `aria-label` and `aria-pressed`, `62×36px`, pill radius, ink
2px border. Track `--ns-teal` when on, `--ns-sunken` when off. The `26px` knob
is `--ns-ink` when on and `--ns-ink-muted` when off — so state survives for
anyone who cannot distinguish the track colours. Disabled: muted border and
knob, and say why nearby.

### List row

`--ns-surface`, ink 2px border, radius `--ns-r-m`, padding `11px`, `11px`,
`11px`, `15px`. Label `body-l` with `text-overflow: ellipsis`. Trailing
controls are `32px` quiet icon buttons with an `aria-label` naming the item
("Remove Dune 3", not "Remove").

### Chip / status pill

Pill radius, ink 2px border, `4–6px` by `9–13px` padding, `micro` or
`body-s` at weight 800. Filled with the accent whose meaning it carries.

### Status dot

`9px` circle, `1.5px` ink border, filled with the state accent. **Never the
only carrier of state** — always beside a word.

### Card

`--ns-surface` or an accent fill, ink 2px border, radius `--ns-r-l`,
`--ns-shadow-hi`. Feed post cards use `--ns-r-xl`.

### Advisory box

Dashed `2px --ns-rule-dashed`, radius `--ns-r-m`, no fill, `body-s` in
`--ns-ink-2`. For explaining a state, never for an error.

### Section header

`label` in `--ns-ink-3`, optionally followed by a count chip and a `2px`
`--ns-rule` divider filling the remaining width.

---

## In-page rules

X is hostile ground. These are not style preferences; each one is a bug that
has already been paid for.

1. **Never style X's own elements.** X is react-native-web, so hover is React
   state. Re-rendering an element rewrites `className` wholesale and drops
   anything the extension added. Append your own element instead; React does
   not track appended children.

2. **Cover, do not filter.** Blur the post with `backdrop-filter` on an
   appended cover, not `filter` on the post. A filter applies to the whole
   subtree and would blur your own controls along with the content.

3. **Anchor floating chrome outside the post subtree.** The in-page pill is
   `position: fixed`, bottom-left, `16px` margin — bottom-left because X's
   message drawer owns the bottom-right on desktop.

4. **Prefix every class** with `no-spoiler-`, and never define custom
   properties on `:root` from the content script — that is X's `:root` and the
   properties would leak into their page. Scope tokens to your own elements,
   or inline the literal values.

5. **Assume dark mode.** X ships light and dark. The cream-on-ink inverse of
   the mark exists for this; test both.

6. **Chrome 105+** is the floor, set by `:has()` and `backdrop-filter`.

---

## Identity

The mark is the **blurred disc**: three ink discs of radius 17 at x = 26, 39
and 49 on a 64×64 canvas, at opacity `1`, `0.5` and `0.25` — drawn faintest
first so the solid disc lands on top. It reads as a smear: the blur itself,
not a metaphor for it.

```html
<svg viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="49" cy="32" r="17" fill="#141218" opacity="0.25"/>
  <circle cx="39" cy="32" r="17" fill="#141218" opacity="0.5"/>
  <circle cx="26" cy="32" r="17" fill="#141218"/>
</svg>
```

- **At 32px and below, drop to two discs** — r=19 at x=26 and x=44, opacity
  `1` and `0.35`. Three discs at that size turn to grey mush.
- **Tile:** `--ns-coral`, ink border, radius scaled with the tile
  (`--ns-r-xs` at 32px up to `38px` at 168px). Clip with `overflow: hidden`;
  the discs run to the edges by design.
- **Inverse:** cream discs on `--ns-ink`, cream border. For X's dark mode and
  any dark ground.
- **Never on `--ns-amber`.** That colour is the slow/pending state.
- **One sanctioned exception:** in the in-page pill, the tile takes the *state*
  colour and the glyph carries the brand.

Wordmark: "No Spoiler" in `--ns-font-display` 800, `-0.5px` tracking, set
beside the tile with an `8–10px` gap.

Manifest needs `icons` and `action.default_icon` at 16, 32, 48 and 128.

---

## Icons

Inline stroke SVG on a 24×24 viewBox, `stroke-width` `2.4–3`, round caps and
joins, `currentColor` or `--ns-ink`. **No emoji, anywhere.** Icon-only controls
carry an `aria-label`; decorative glyphs carry `aria-hidden="true"`.

---

## Accessibility floor

- Real `<button>`, `<a href>`, `<input>` + `<label>`. Never `role` or
  `onClick` on a `div` or `span`.
- Interactive targets ≥ 44px for primary actions; ≥ 32px for icon buttons
  nested inside an already-large row.
- Text meets 4.5:1 (3:1 at 24px and above). The table above is verified — stay
  inside it.
- Colour is never the sole carrier of meaning: every status dot has a word,
  every toggle state changes the knob as well as the track.
- Respect `prefers-reduced-motion`: drop the press translate and the pill
  expansion.

---

## What not to do

- Gradient washes, glassmorphism, left-border accent cards.
- Inter, Roboto, Arial.
- Emoji as iconography.
- White text on an accent fill.
- The logo on amber.
- Soft blurred drop shadows. Shadows here are hard, offset, and ink — they are
  a structural device, not depth.
- Defining tokens on `:root` from the content script.
