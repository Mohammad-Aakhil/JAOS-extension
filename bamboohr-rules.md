# BambooHR ATS — DOM Rules & Field Reference

> Based on scan of cornelisnetworks.bamboohr.com/careers/202 (2026-03-11)
> Framework: **Fabric UI (MUI wrappers)** — NOT React-select, NOT Knockout/Oracle JET

---

## 1. Detection

| Signal | Selector / Pattern |
|--------|--------------------|
| URL | `*.bamboohr.com` (subdomains: `{company}.bamboohr.com`) |
| Form root | `.ApplicationForm` or `form[method="post"]` or first `<form>` with inputs |

---

## 2. Field Types

### 2a. Standard Text Inputs (majority of form)

```
<div data-fabric-component="TextField InputWrapper">
  <label for="firstName">First Name *</label>
  <div class="MuiFormControl-root ...">
    <input id="firstName" name="firstName" type="text"
           class="MuiInputBase-input fabric-8lkdiq-input css-aae3xl" />
  </div>
</div>
```

**Key patterns:**
- All text inputs use class `MuiInputBase-input fabric-*-input`
- Wrapped in `data-fabric-component="TextField InputWrapper"`
- `required` HTML attribute is NOT used — asterisk `*` in label text signals required
- IDs are stable for core fields: `firstName`, `lastName`, `email`, `phone`, `desiredPay`, `websiteUrl`, `linkedinUrl`
- Address fields use Fabric-generated IDs: `FabricTextField-326`, `FabricTextField-327`, etc. — NOT stable, use `name` attribute instead
- Address `name` attributes: `streetAddress.value`, `city.value`, `zip.value`

### 2b. Fabric Select Widget (State, Country)

```
<div data-fabric-component="Select">
  <button type="button" class="fab-SelectToggle fab-SelectToggle--width4 fab-SelectToggle--sizeMedium"
          aria-label="State –Select–">
    <div class="fab-SelectToggle__placeholder">–Select–</div>  ← EMPTY state
    <!-- OR when filled: -->
    <div class="fab-SelectToggle__content">New York</div>       ← FILLED state
    <div class="fab-SelectToggle__toggleButton">▼</div>
  </button>
  <select id="fab-select323" name="state.value"
          aria-hidden="true" required readonly tabindex="-1"
          style="border: none; height: 0px; opacity: 0; overflow: hidden; position: absolute; width: 0px;">
    <option value></option>  ← ALWAYS empty, NOT usable
  </select>
</div>
```

**When button opened (via Enter key) → overlay menu appears:**
```
<aside>
  <div data-fabric-component="Menu" class="fab-MenuVessel fab-MenuVessel--bottom">
    <div class="fab-MenuVessel__list">
      <div class="fab-MenuSearch">
        <input class="fab-MenuSearch__input" aria-label="Search" placeholder="Search..." />
      </div>
      <div class="fab-MenuList" role="menu" aria-activedescendant="...">
        <div class="fab-MenuOption" role="menuitem">Alabama</div>
        <div class="fab-MenuOption" role="menuitem">Alaska</div>
        ...50 US states + territories...
      </div>
    </div>
  </div>
</aside>
```

**Critical rules:**
- The hidden `<select>` is NEVER fillable — `aria-hidden="true"`, 0×0 size, readonly
- MUST interact with the visible `fab-SelectToggle` button instead
- Fill sequence: focus button → dispatch Enter keydown/keyup → wait 300ms → type in `fab-MenuSearch__input` → wait 500ms → click matching `fab-MenuOption`
- **`.click()` and PointerEvent do NOT open the dropdown** — Fabric UI listens for keyboard Enter on the toggle button
- Placeholder text uses en-dash: `–Select–` (U+2013), NOT hyphens `--Select--`
- When filled: `fab-SelectToggle__content` div appears with selected value
- When empty: `fab-SelectToggle__placeholder` div shows `–Select–`
- Country is usually pre-filled as "United States" with a clearable chip (`fab-SelectToggle--clearable`)
- State is a CASCADING dropdown — its aria-label includes the placeholder: `"State –Select–"`
- State options are FULL STATE NAMES (e.g., "New York"), NOT abbreviations ("NY")

### 2c. Honeypot / Spam Trap

```
<input id="preferredName" name="preferredName" type="text" />
```

- Label: "Please leave this field blank"
- NOT marked required, but visible (213×27px)
- MUST be left empty — filling it flags the application as bot/spam
- Always `id="preferredName"` on BambooHR portals

### 2d. Date Input

```
<input id="FabricTextField-330" type="text" placeholder="mm/dd/yyyy"
       class="MuiInputBase-input fabric-17j2up4-input MuiInputBase-inputAdornedEnd" />
```

- Text input with calendar icon adornment (`MuiInputBase-inputAdornedEnd`)
- Format: `MM/DD/YYYY` (from placeholder)
- Has a calendar icon button sibling (not fillable, just decoration)
- NOT a native `<input type="date">` — it's a text input that accepts date strings

### 2e. File Input (Resume)

- Hidden inside Fabric MUI wrapper with `data-fabric-component` classes
- The file input itself has no stable selectors — found via container traversal
- Resume upload is handled separately by content.js `findResumeFileInputs()` fallback path
- File inputs should be REMOVED from scan (augmentScan) — never sent to LLM

### 2f. Custom Questions

```
<input id="customQuestionAnswers.short_817" name="customQuestionAnswers.short_817" type="text" />
```

- All use `name="customQuestionAnswers.short_{id}"` or `customQuestionAnswers.long_{id}` (textarea)
- Numeric suffix `{id}` varies per company/job posting
- Label text is the full question (e.g., "Are you legally authorized to work in the United States?")
- Common questions: work authorization, visa sponsorship, referral source, "how did you hear"

### 2g. Readonly Fields (skip)

```
<input id="FabricTextField-48" class="... Mui-readOnly MuiInputBase-readOnly ..."
       readonly />
```

- "Link to This Job" is a readonly text input showing the job URL
- Class includes `Mui-readOnly` and `MuiInputBase-readOnly`
- Scanner already skips readonly non-select fields

---

## 3. Required Field Detection

BambooHR does NOT use the HTML `required` attribute on text inputs. Required fields are signaled by:
- Asterisk `*` in label text (e.g., "First Name *")
- The hidden backing `<select>` for State/Country DOES have `required` attribute

Required fields on this portal:
1. First Name *
2. Last Name *
3. Email *
4. Phone *
5. Address *
6. City *
7. State * (fab-SelectToggle — backing select has required)
8. ZIP *
9. Country * (fab-SelectToggle — backing select has required, pre-filled)
10. Resume * (file input — handled separately)
11. Desired Pay *
12. Work authorization * (custom question)
13. Visa sponsorship * (custom question)
14. How did you hear * (custom question)
15. Referral name * (custom question)

Optional:
- Date Available
- Website, Blog or Portfolio
- LinkedIn URL

---

## 4. Form Submission

- Single-page form (no multi-step / pagination)
- Submit button at bottom of form
- No CSRF token visible in DOM (may be in cookies or headers)

---

## 5. Known Quirks

| Quirk | Details |
|-------|---------|
| Honeypot `preferredName` | MUST be empty, or submission is flagged as spam |
| State is cascading | Options load only after Country is set. But since Country is pre-filled, State options should be available on page load |
| Hidden selects are NOT fillable | `aria-hidden="true"`, 0×0, readonly — use fab-SelectToggle button instead |
| No `required` on inputs | Asterisk in label only — scanner checks label text for `*` |
| State options are full names | "New York" not "NY" — must convert abbreviations to full names |
| Placeholder uses en-dash | `–Select–` (U+2013), not `--Select--` (hyphens) |
| fab-SelectToggle needs Enter key | `.click()` and PointerEvent do NOT open the dropdown — must dispatch `keydown`/`keyup` with `key: "Enter"` |
| `data-fabric-component` | Reliable parent wrapper identifier: `"TextField InputWrapper"`, `"Select"`, `"Section"`, `"LayoutBox"` |
