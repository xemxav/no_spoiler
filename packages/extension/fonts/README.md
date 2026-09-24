# Fonts

Shipped with the extension so the popup renders with no network request and
works offline, per `docs/design-system.md` ("Fonts are self-hosted").

| File | Family | Source |
| --- | --- | --- |
| `bricolage-grotesque-latin.woff2`, `bricolage-grotesque-latin-ext.woff2` | Bricolage Grotesque | [Google Fonts](https://fonts.google.com/specimen/Bricolage+Grotesque) |
| `manrope-latin.woff2`, `manrope-latin-ext.woff2` | Manrope | [Google Fonts](https://fonts.google.com/specimen/Manrope) |

Both families are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/),
which permits bundling and redistribution.

These are the `latin` and `latin-ext` subsets of each family's variable font,
so one file covers every weight in the type scale. `popup.css` declares them
with the same `unicode-range` values the upstream stylesheet uses, so the
extended subset only loads when a topic needs it.
