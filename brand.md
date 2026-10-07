# Brand — Obligor

_Status: active_

## Voice

Obligor is confidential two-party clearing for trading desks. Voice: precise, calm, honest. Short declarative sentences. Numbers do the persuading; no hype. We name tradeoffs aloud ("TEE ≠ MPC"). Never overclaim.

## Palette — "MetEngine industrial monochrome" (user-directed, 2026-10)

Dark-first industrial monochrome modeled on metengine.xyz. Page canvas #121212, engraved dual-edge borders (dark groove #090909 + light edge #202020), muted text ramp #E8E8E8 → #646464. No decorative gradients or glows; the light CTA button is the accent. Color appears only where it carries meaning: green = success/savings, red = destructive, neutral gray = TEE/secondary.

| Token | Light (reversed) | Dark (locked base) |
| --- | --- | --- |
| background | #f5f5f5 | **#121212** |
| surface (card) | #ffffff | #121212 (engraved borders separate) |
| popover | #ffffff | #1a1a1a |
| foreground | #171717 | #e8e8e8 |
| muted-foreground | #525252 | #838383 |
| border | #e4e4e4 | #202020 |
| **primary (CTA)** | #171717 | **#e8e8e8 (light letterpress button)** |
| primary-foreground | #f5f5f5 | #121212 |
| ring | #171717 | #e8e8e8 |
| success | #079455 | **#45d09d** |
| steel (TEE marker) | #6f7c88 | #7f7f7f |
| destructive | #d92d20 | **#f16056** |
| **gold (sparkle accent)** | #c9972b | **#ffde95** |

Gold rule (MetEngine-style, user-directed): gold exists ONLY as the 4-point sparkle glyph — logo mark, favicon, and eyebrow labels. Never gold text, buttons, borders, or backgrounds. All other accents stay semantic (green = success, red = destructive, gray = TEE).

Signature details: engraved card edges (`1px #202020` border + offset `1px #090909` shadows), engraved horizontal rules, fixed frame rails around the max-w-1332px content column, and a 1.5%-opacity grain overlay across the whole page.

## Typography

- **Everything (headings, body, buttons, stats):** Plus Jakarta Sans, medium weight, tight negative tracking (-0.03em on display sizes).
- **Display wordmark / giant marquee:** Clash Grotesk (Fontshare), heavy, outlined with text-stroke for the footer wordmark band.
- **Numbers/addresses/code only:** Geist Mono with `tabular-nums` — balances, margins, addresses. 2 decimals everywhere for USD.

## Motion (MetEngine language)

- Scroll reveals: blur(10px) + fade + 24px rise, 700ms ease-out, staggered by section.
- Count-up numbers in the stats band on scroll into view.
- Linear infinite marquees (40s) for ticker bands and the giant footer wordmark.
- Buttons: 200ms transitions, `active:scale-[0.97]` press. No hover-scale on cards.
- Grain overlay + engraved edges do the texture work. Respect `prefers-reduced-motion` everywhere.

## Gradients & texture

None as decoration. Depth via surface steps, engraved dual-edge borders, and the fixed grain overlay at 1.5% opacity.
