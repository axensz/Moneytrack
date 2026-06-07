# Contrast audit (WCAG 2.1)

Ratios computed directly from token hex values (relative-luminance formula), run via script — not eyeballed. Threshold: **4.5:1** for normal text (AA).

| Pair | Ratio | AA |
|---|---|---|
| L body text on canvas | 15.67:1 | ✅ |
| L muted text on canvas | 5.06:1 | ✅ |
| L muted text on card | 5.33:1 | ✅ |
| L muted text on muted | 4.85:1 | ✅ |
| L income text on card | 5.48:1 | ✅ |
| L income badge | 5.21:1 | ✅ |
| L expense text on card | 6.47:1 | ✅ |
| L expense badge | 5.91:1 | ✅ |
| L warning text on card | 5.02:1 | ✅ |
| L warning badge | 4.51:1 | ✅ |
| L info text on card | 6.70:1 | ✅ |
| L info badge | 6.16:1 | ✅ |
| L primary text on card | 7.10:1 | ✅ |
| L primary badge | 6.02:1 | ✅ |
| L primary link/tab | 5.42:1 | ✅ |
| L white on gradient btn (dark stop) | 5.70:1 | ✅ |
| L white on gradient btn (light stop) | 4.93:1 | ✅ |
| L white on secondary btn | 5.70:1 | ✅ |
| L balance value on accent | 7.39:1 | ✅ |
| D body text on canvas | 16.91:1 | ✅ |
| D body text on card | 12.54:1 | ✅ |
| D muted text on card | 5.82:1 | ✅ |
| D income text on card | 9.63:1 | ✅ |
| D income badge | 6.38:1 | ✅ |
| D expense text on card | 7.73:1 | ✅ |
| D expense badge | 5.28:1 | ✅ |
| D warning text on card | 10.18:1 | ✅ |
| D warning badge | 6.29:1 | ✅ |
| D info text on card | 8.14:1 | ✅ |
| D info badge | 5.74:1 | ✅ |
| D primary text on card | 7.95:1 | ✅ |
| D primary badge | 8.12:1 | ✅ |
| D primary tab | 4.68:1 | ✅ |
| D white on gradient btn (dark stop) | 5.70:1 | ✅ |
| D white on gradient btn (light stop) | 4.93:1 | ✅ |
| D white on secondary btn | 5.70:1 | ✅ |
| D balance value on accent | 6.15:1 | ✅ |

**Result: 37/37 pairs pass AA (4.5:1) — including every pixel of the brand gradient button in both themes.**

The primary-button gradient light stop was AA-darkened from `#8b5cf6` to `#8250e8` (visually near-identical) and the dark secondary button uses `--primary-strong`, so white labels clear 4.5:1 everywhere. All semantic text/badge pairs pass in light and dark.