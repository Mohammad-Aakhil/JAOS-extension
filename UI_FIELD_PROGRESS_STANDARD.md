# JAOS Extension — Field Progress UI Standard

This document defines the consistent UI standard for the autofill field progress panel across ALL ATS adapters. Every adapter's detection + fill result MUST follow these rules.

## Layout

```
┌─────────────────────────────────────┐
│  X of Y required filled    [badge]  │  ← Header
│  ████████████░░░░░░░░░░░░░░░░░░░░░  │  ← Progress bar (required only)
│                                     │
│  REQUIRED              X of Y       │  ← Section header
│  ████████░░░░░░░░░░                 │  ← Mini bar
│  ○ First Name                       │  ← Red: unfilled required
│  ○ Email                            │  ← Red: unfilled required
│  ✓ Last Name                        │  ← Green: filled required
│  ✓ Phone                            │  ← Green: filled required
│                                     │
│  OPTIONAL              N of N       │  ← Only if ≥1 filled
│  ████████████████████████████████   │  ← Always 100% (all shown are filled)
│  ✓ LinkedIn                         │  ← Green: filled optional
│  ✓ Website                          │  ← Green: filled optional
│                                     │
│  ⚠ Needs manual input:             │  ← Warnings (amber)
│    Location — typeahead required    │
└─────────────────────────────────────┘
```

## Rules

### Required Fields
- **Always show ALL** required fields, filled or not
- Unfilled required → red dot (○) + red text
- Filled required → green checkmark (✓) + green text
- Unfilled required fields listed FIRST (top), then filled below

### Optional Fields
- **Only show FILLED** optional fields (green checkmark)
- **Never show unfilled** optional fields — they are invisible in the UI
- If zero optional fields were filled, the entire Optional section is hidden
- Section counter always reads "N of N" since only filled ones are shown

### Header
- Text: `"X of Y required filled"` — optional fields excluded from count
- Color: green when all required filled, default otherwise

### Status Badge
- `"Complete"` (green) — all required filled + no warnings
- `"X missing"` (red) — X = unfilled required + warning count
- `"X need attention"` (amber) — only warnings, no missed required
- `"Working..."` (blue) — during fill

### Progress Bar
- Based on **required field completion only**
- 100% + green when all required filled
- Blue gradient while incomplete

### Warnings Section
- Amber section at bottom
- Shows fields that need manual user input (e.g., typeahead, CAPTCHA)
- Not counted in required or optional — separate category

## Adapter Compliance

Every ATS adapter that returns field labels with `{ label, isFilled, isRequired }` MUST follow this standard. The rendering logic lives in `content.js → renderFieldProgress()` and applies uniformly — adapters do NOT implement their own progress UI.

V1 adapters (no isRequired flag) treat all scanned fields as required — the Optional section only appears for V2 engine results.
