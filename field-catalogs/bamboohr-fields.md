# BambooHR — Field Catalog (adapter analysis + portal observation)

## Detection
- Hostname: `*.bamboohr.com`

---

## Framework Notes

BambooHR uses **Fabric UI** (MUI wrappers). Most fields are standard `<input>` or `<textarea>`.
**State** and **Country** use custom `fab-SelectToggle` widgets — the hidden native `<select>` has `aria-hidden="true"` and is zero-size, NOT fillable directly.

---

## REQUIRED Fields — Fillable from Profile (LLM maps, with adapter afterFill for fab-selects)

| Field | Profile Key | Fill Method |
|-------|------------|-------------|
| First Name | `first_name` | Standard text input, LLM maps |
| Last Name | `last_name` | Standard text input, LLM maps |
| Email | `email` | Standard text input, LLM maps |
| Phone | `phone` | Standard text input, LLM maps |
| Address Line 1 | `address_line1` or `address` | Standard text input, LLM maps |
| Address Line 2 | `address_line2` | Standard text input, LLM maps |
| City | `city` | Standard text input, LLM maps |
| State | `state` | **fab-SelectToggle** — `afterFill` types in search box, clicks option |
| Zip Code | `zip` or `postal_code` | Standard text input, LLM maps |
| Country | `country` | **fab-SelectToggle** — same as state |
| LinkedIn URL | `linkedin` | Standard text input, LLM maps |
| Website / Portfolio | `portfolio` or `website` | Standard text input, LLM maps |

---

## fab-SelectToggle Fill Process (State, Country)

1. Scroll into view + focus toggle button
2. Dispatch PointerEvent sequence (pointerdown → pointerup → click)
3. Wait 300ms for `aside` overlay with `input.fab-MenuSearch__input` to appear
4. Fallback: native `.click()` if overlay didn't open
5. Fallback: Enter key press
6. Fallback: Space key press
7. Type search value into `input[aria-label="Search"]`
8. Wait 200ms for `div.fab-MenuOption` items
9. Click first matching option
10. Wait 200ms for close

---

## Resume Upload

- Handled by standard JAOS file upload pipeline
- Filtered out of LLM scan in `augmentScan`

---

## Honeypot Field — MUST NEVER FILL

| Field | id | Label | Treatment |
|-------|-----|-------|-----------|
| Preferred Name honeypot | `preferredName` | "Please leave this field blank" | **Filtered out in `augmentScan`** — MUST stay empty |

**This is a spam trap.** Filling it will likely block the application submission.

---

## augmentScan — Fields Removed Before LLM

| Filter | Reason |
|--------|--------|
| `aria-hidden="true"` elements | Hidden Fabric UI backing selects — not real inputs |
| Label contains "leave this field blank" | Honeypot trap |
| `isFileInput` | Resume handled separately |

---

## REQUIRED Fields — Needs Onboarding Collection

| Field | Profile Key Needed | Priority |
|-------|-------------------|----------|
| Work authorization (US) | `work_authorized_us` (bool) | HIGH |
| Needs sponsorship | `needs_sponsorship` (bool) | HIGH |
| Salary expectations | `salary_expectation` (text) | HIGH |

---

## Role-Specific Questions — LLM Handles

| Question Type | Examples |
|--------------|---------|
| Work authorization / sponsorship | "Are you authorized to work in the US?" (Yes/No) |
| Cover letter / intro | Long textarea |
| "How did you hear about us?" | Select or text |
| Start date | Date picker or text |
| Custom questions | Varies per company |

---

## Fields to NEVER Fill

| Field | Reason |
|-------|--------|
| `preferredName` (id) / "Please leave this field blank" | Anti-bot honeypot — CRITICAL |
| Hidden `<select>` with `aria-hidden="true"` | Fabric UI backing element, not real widget |
| File inputs | Resume upload pipeline handles separately |

---

## Summary: Onboarding Data Gaps

### Already Collected ✅
- First name, last name, email, phone
- LinkedIn URL, portfolio/website URL
- City, state, zip, country

### Must Collect (HIGH)
1. **Work authorization** (`work_authorized_us` bool)
2. **Needs sponsorship** (`needs_sponsorship` bool)
3. **Salary expectations** (`salary_expectation` text, e.g. "$150K–$180K USD")

### Should Collect (MEDIUM)
4. **Address line 1, 2** — not currently in onboarding
5. **Postal code** — not currently in onboarding
