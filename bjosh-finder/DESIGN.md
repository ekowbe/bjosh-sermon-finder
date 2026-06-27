# Sanctuary — BJosh Sermon Finder theme

A warm, editorial, reverent identity. Replaces the Apple-Music clone (red `#FC3C44`, SF Pro).
The feeling: candlelight, scripture, anointing/glory — gravitas without being austere.

## Color tokens

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#FAF6EF` | App background (warm parchment) |
| `--surface` | `#FFFFFF` | Cards, sheets |
| `--surface-2` | `#F3EDE1` | Inset fills, search field, chips |
| `--ink` | `#211C17` | Primary text (warm espresso) |
| `--muted` | `#6B6157` | Secondary text (warm taupe) |
| `--faint` | `#A89E90` | Tertiary / metadata |
| `--border` | `#ECE3D4` | Hairlines |
| `--gold` | `#B26B12` | Primary accent — text/icons on light |
| `--gold-bright` | `#E5A53B` | Accent fills, gradient highlight |
| `--clay` | `#6E2A23` | Deep secondary (hero depth) |
| `--espresso` | `#2A211A` | Hero base |

**Hero gradient:** `linear-gradient(160deg, #2A211A 0%, #5A2A22 100%)` with a soft gold radial glow top-right.
**Gold gradient (mic, CTAs):** `linear-gradient(135deg, #E5A53B, #B26B12)`.

### Semantic / confidence
| | text | bg |
|---|---|---|
| high | `#1E6F47` | `#E7F2EB` |
| medium | `#9A6212` | `#FBF0DC` |
| low | `#6B6157` | `#F3EDE1` |

## Typography

- **Display / sermon titles:** **Fraunces** — a warm "old-style" serif with optical sizing. Editorial gravitas, scripture-like weight. Use 600–900.
- **UI / body:** **Inter** — clean, neutral, excellent at small sizes. Use 400–600.

Loaded via `next/font/google` with CSS variables `--font-fraunces`, `--font-inter`.

## Principles
- Serif for *content* (titles, scripture), sans for *chrome* (nav, labels, buttons).
- Generous warmth: parchment bg, not stark white. Soft shadows, never harsh.
- Gold is precious — use it for accents and one hero, not everywhere.
- Sermon artwork: warm gradient tiles seeded from id, gold-leaning palette.
