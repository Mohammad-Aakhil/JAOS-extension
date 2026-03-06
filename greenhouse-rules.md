# Greenhouse Fill Rules

> Built bottom-up: each field type verified individually via DevTools before composing into adapter.
> Portal tested: job-boards.greenhouse.io (mthree Recruiting Portal)

---

<!-- Template for each field:

## Field: [Field Name]
- **Type**: text-input | react-select | native-select | checkbox | file-upload | textarea | multi-select
- **DOM Pattern**: CSS selector / description
- **Fill Method**: How to set the value
- **Test Script**:
```js
// Paste in DevTools console
```
- **Status**: verified | needs-work
- **Notes**: Quirks, edge cases

-->

## Fields to Document

- [x] First Name (text input)
- [x] Last Name (text input)
- [x] Email (prefilled — skip)
- [x] Country Code (intl-tel-input dropdown)
- [x] Phone (text input)
- [x] School (react-select — FIBER onChange)
- [x] Degree (react-select — FIBER onChange)
- [x] Discipline (react-select — FIBER onChange)
- [ ] Start/End date year (number input — skip?)
- [x] Resume/CV (file upload)
- [x] Gender Identity (EEO — react-select, FIBER onChange)
- [ ] Racial/Ethnic Background (EEO — may be multi-checkbox, TBD)
- [ ] Sexual Orientation (EEO — TBD)
- [ ] Transgender (EEO — TBD)
- [x] Disability Status (EEO — react-select, FIBER onChange)
- [x] Veteran Status (EEO — react-select, FIBER onChange)
- [x] Hispanic/Latino (EEO — react-select, FIBER onChange)
- [ ] Consent checkbox (react-select single-option or checkbox — TBD)
- [ ] Demographic consent checkbox

---

## Verified Rules

### Field: First Name
- **Type**: text-input
- **DOM Pattern**: `input#first_name` (standard Greenhouse id)
- **Fill Method**: Set `.value` via native setter + reset `_valueTracker` + dispatch `input`/`change` events
- **Test Script**:
```js
const el = document.querySelector('input#first_name');
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
const tracker = el._valueTracker; if (tracker) tracker.setValue('');
setter.call(el, 'Mohammad');
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
```
- **Status**: verified
- **Notes**: Skip if already has a value (prefilled from Greenhouse profile)

---

### Field: Last Name
- **Type**: text-input
- **DOM Pattern**: `input#last_name`
- **Fill Method**: Same as First Name
- **Test Script**:
```js
const el = document.querySelector('input#last_name');
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
const tracker = el._valueTracker; if (tracker) tracker.setValue('');
setter.call(el, 'Aqeel');
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
```
- **Status**: verified
- **Notes**: Skip if already has a value

---

### Field: Email
- **Type**: text-input
- **DOM Pattern**: `input#email` or `input[type="email"]`
- **Fill Method**: Fill if empty (native setter + `_valueTracker` reset), skip if already has a value (may be prefilled from Greenhouse profile)
- **Test Script**:
```js
const el = document.querySelector('input#email') || document.querySelector('input[type="email"]');
if (el.value.trim()) { console.log('⏭️ Email: already has value — skipping'); }
else {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const tracker = el._valueTracker; if (tracker) tracker.setValue('');
  setter.call(el, 'aakhilmohammad65@gmail.com');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```
- **Status**: verified
- **Notes**: Sometimes prefilled from Greenhouse profile, sometimes empty. Always check `.value.trim()` before filling — never overwrite a prefilled email.

---

### Field: Country Code (Phone)
- **Type**: intl-tel-input dropdown
- **DOM Pattern**:
  - Container: `div.iti`
  - Trigger: `button.iti__selected-country` (click to open)
  - Search: `input.iti__search-input` (type to filter)
  - List: `ul.iti__country-list` with `li.iti__country[data-dial-code][data-country-code]`
- **Fill Method**: Click trigger → type dial code (e.g. `+1`) in search input → dispatch `input` event → press Enter via `keydown`
- **Test Script**:
```js
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const btn = document.querySelector('button.iti__selected-country');
  btn.click();
  await delay(300);
  const search = document.querySelector('input.iti__search-input');
  search.focus();
  search.value = '+1';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(300);
  search.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
})();
```
- **Status**: verified
- **Notes**: Flag updates to US flag, `+1` shown. `data-dial-code` attribute on `<li>` can be used for direct lookup if search fails. Default may already be US — check before filling.

---

### Field: Phone
- **Type**: text-input
- **DOM Pattern**: `input[name="phone"], input[type="tel"]` (inside `.phone-input__phone` container, sibling of `.iti`)
- **Fill Method**: Same native setter pattern as First/Last Name
- **Test Script**:
```js
const el = document.querySelector('.phone-input__phone input[type="tel"]:not(.iti__search-input)')
        || document.querySelector('input[name="phone"]');
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
const tracker = el._valueTracker; if (tracker) tracker.setValue('');
setter.call(el, '7169364737');
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
```
- **Status**: verified
- **Notes**: The `.iti` container has its own `input[type="tel"]` for search — use `:not(.iti__search-input)` to avoid it. Phone number is digits only (no formatting needed, Greenhouse formats it).

---

### Field: Resume/CV
- **Type**: file-upload
- **DOM Pattern**: `input[type="file"]#resume` (hidden, inside `.file-upload__wrapper`)
- **Fill Method**: DataTransfer API — create `File` object, set via `DataTransfer.items.add()`, assign to `.files`, dispatch `change` event
- **Test Script**:
```js
(async () => {
  const fileInput = document.querySelector('input[type="file"]#resume') || document.querySelector('input[type="file"][accept*=".pdf"]');
  if (!fileInput) { console.error('❌ No file input found'); return; }
  const content = new Uint8Array([37,80,68,70]); // %PDF header
  const file = new File([content], 'Mohammad_Aqeel_Resume.pdf', { type: 'application/pdf' });
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  fileInput.dispatchEvent(new Event('input', { bubbles: true }));
  console.log('✅ Resume: file attached —', fileInput.files[0].name);
})();
```
- **Status**: verified
- **Notes**: Hidden `<input type="file">` with `accept=".pdf,.doc,.docx,.txt,.rtf"`. No need to click "Attach" button — set files directly via DataTransfer. UI updates to show filename with X to remove. In production, use the actual resume blob from backend instead of dummy content.

---

### Field: React-Select Dropdowns (Universal — Education, Application Questions, EEO)
- **Type**: react-select (Remix/emotion CSS, fully controlled)
- **DOM Pattern**:
  - Container: `div.select-shell.remix-css-b62m3t-container`
  - Control: `div.select__control.remix-css-13cymwt-control`
  - Input: `input.select__input` with `role="combobox"`
  - Label: `label.select__label` (label text used for field identification)
  - Selected value: `div.select__single-value`
  - Placeholder: `div.select__placeholder`
- **Fill Method**: **React Fiber `stateNode.selectOption()`** — walk the fiber tree from the input element, collect `options` from inner fiber (~level 3), then find the Select class component's `stateNode` which has `selectOption(option)` method. Falls back to parent `onChange` at level > optionsLevel.
- **Key lesson**: The `onChange` at level 3 is `handleInputChange` (text input handler, expects events). Calling it with `{label, value}` causes TypeError. The correct approach is `stateNode.selectOption(match)` which is react-select's own internal selection method.
- **Test Script**:
```js
// Test on first unfilled react-select dropdown
const container = document.querySelector('[class*="-container"]:has([class*="__control"])');
const input = container.querySelector('input[role="combobox"]');
const fk = Object.keys(input).find(k => k.startsWith('__reactFiber$'));
let fiber = input[fk], opts = null, inst = null;
for (let i = 0; i < 30 && fiber; i++) {
  const p = fiber.memoizedProps || {};
  if (p.options && Array.isArray(p.options) && !opts) opts = p.options;
  if (fiber.stateNode?.selectOption && !inst) { inst = fiber.stateNode; console.log('selectOption found at level', i); }
  fiber = fiber.return;
}
if (inst && opts) { inst.selectOption(opts[0]); console.log('Selected:', opts[0].label); }
else console.log('No selectOption found, inst:', !!inst, 'opts:', !!opts);
```
- **Status**: verified (stateNode approach)
- **Notes**: BREAKTHROUGH — bypasses React-Select's controlled state entirely. Three strategies in order: (1) `stateNode.selectOption(match)` — uses react-select's own class method, handles state/menu/focus; (2) parent `onChange` at level ABOVE options (level ~16) — accepts `{label, value}` objects; (3) click→menu fallback. Tested on bamboohr17 Greenhouse page. Option matching is fuzzy (includes). School field has 244 options (async-loaded). Education fields (School/Degree/Discipline) use same pattern — IDs: `school--0`, `degree--0`, `discipline--0`.

---

### Field: Application Question Text Inputs (Generic)
- **Type**: text-input
- **DOM Pattern**: `input.input.input__single-line` with `aria-label="[Field Name]"` inside `div.text-input-wrapper > div.input-wrapper`. IDs are dynamic (`question_NNNNN`) — use `aria-label` for matching.
- **Fill Method**: Same native setter + `_valueTracker` reset pattern. Match by `aria-label` attribute.
- **Test Script**:
```js
function fillText(ariaLabel, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  const el = document.querySelector(`input[aria-label="${ariaLabel}"]`);
  if (!el) return;
  if (el.value.trim()) return; // skip prefilled
  const tracker = el._valueTracker; if (tracker) tracker.setValue('');
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
// Example fields (vary per job posting):
fillText('Street Address', '123 Main St');
fillText('City', 'Buffalo');
fillText('Zip Code', '14260');
fillText('Desired Salary', '80000');
fillText('LinkedIn Profile', 'https://linkedin.com/in/mohammadaqeel');
fillText('Website, Blog, or Portfolio', 'https://github.com/mohammadaqeel');
```
- **Status**: verified
- **Notes**: Tested on `job-boards.greenhouse.io/bamboohr17`. Application questions are inside `div.application--questions`. Field names vary per job posting — LLM mapper matches `aria-label` text to profile fields. React-Select dropdowns in this section now fillable via fiber onChange method.

---

### Field: Start/End Date Year (Education)
- **Type**: number-input
- **DOM Pattern**: Number inputs with up/down spinner, labels "Start date year" / "End date year"
- **Fill Method**: **SKIP** — low priority for autofill, user can quickly type 4 digits
- **Status**: skip
- **Notes**: Standard number input with increment/decrement arrows. Could be filled with native setter if needed in future.

---

### Field: EEO / Voluntary Self-Identification Dropdowns
- **Type**: react-select (same as Education/Application Question dropdowns)
- **DOM Pattern**: Inside `div.eeoc__container_body` → `div.eeoc_question_wrapper` → `div.select` → `div.select__container` → same `select-shell remix-css-b62m3t-container` pattern. Labels via `label.select__label` (e.g., `id="gender-label"`).
- **Fill Method**: Same React Fiber parent onChange as universal React-Select rule above.
- **Fields & Decline Options** (phrasing varies per field!):
  | Field | Decline Option Text |
  |-------|-------------------|
  | Gender | "Decline To Self Identify" |
  | Are you Hispanic/Latino? | "Decline To Self Identify" |
  | Veteran Status | "I don't wish to answer" |
  | Disability Status | "I do not want to answer" |
- **Fill Strategy**: Try these search strings in order: `"decline to self"` → `"do not wish"` → `"don't wish"` → `"do not want"` → `"prefer not"`. First match wins.
- **Test Script**:
```js
// Fill all unfilled EEO React-Select dropdowns
(() => {
  function fillReactSelect(inputEl, targetValue) {
    const fiberKey = Object.keys(inputEl).find(k => k.startsWith('__reactFiber$'));
    let fiber = inputEl[fiberKey];
    let options = null, parentFn = null;
    for (let i = 0; i < 30 && fiber; i++) {
      const props = fiber.memoizedProps || {};
      if (props.options && !options) options = props.options;
      if (typeof props.onChange === 'function' && i > 5 && options) {
        parentFn = props.onChange;
        break;
      }
      fiber = fiber.return;
    }
    if (!options || !parentFn) return false;
    const val = targetValue.toLowerCase();
    const target = options.find(o => String(o.label || '').toLowerCase().includes(val));
    if (!target) return false;
    parentFn(target);
    return target.label;
  }

  const declinePhrases = ["decline to self", "do not wish", "don't wish", "do not want", "prefer not"];
  const allInputs = document.querySelectorAll('.eeoc__container_body input.select__input[role="combobox"]');
  allInputs.forEach(input => {
    let container = input.closest('.select-shell') || input.closest('[class*="container"]');
    let label = container ? container.querySelector('.select__label') : null;
    let labelText = label ? label.textContent.trim() : 'unknown';
    let singleValue = container ? container.querySelector('.select__single-value') : null;
    if (singleValue && singleValue.textContent.trim()) {
      console.log(`⏭️ ${labelText}: already "${singleValue.textContent.trim()}"`);
      return;
    }
    for (const phrase of declinePhrases) {
      const result = fillReactSelect(input, phrase);
      if (result) { console.log(`✅ ${labelText}: "${result}"`); return; }
    }
    console.log(`❌ ${labelText}: no decline option found`);
  });
})();
```
- **Status**: verified (Gender + Hispanic filled; Veteran + Disability need broader phrasing)
- **Notes**: EEO fields are inside `div.eeoc__container_body` — can scope selector to avoid re-filling application question dropdowns. Each company may customize option labels, so the multi-phrase fallback is essential. There may also be a "Race & Ethnicity" multi-checkbox section (not a dropdown) — documented separately when encountered.

---

### Field: Consent Checkbox
- **Type**: react-select (single option) or checkbox — varies per posting
- **DOM Pattern**: TBD — need to verify on a page that has it
- **Fill Method**: For react-select with 1 option: select `options[0]`. For checkbox: set `.checked = true` + dispatch `change`.
- **Status**: needs-verification
- **Notes**: Some consent fields are React-Select with only `["I agree"]` as the single option — the decline search won't match, need `options[0]` fallback.

---

---

## Resume Upload Pipeline (2026-03-06)

### Problem
Greenhouse pre-attaches resume from user's Greenhouse profile ("Autofill with MyGreenhouse" or auto-login).
The JAOS extension must replace this with the user's JAOS-selected resume.

### Greenhouse Resume DOM Structure
```html
<div role="group" aria-labelledby="upload-label-resume" class="file-upload" data-allow-s3="false">
  <div id="upload-label-resume" class="label upload-label">
    "Resume/CV" <span class="required">*</span>
  </div>
  <div class="file-upload__wrapper">
    <!-- When file attached (from profile): -->
    <div class="file-upload_filename">
      <svg class="svg-icon">...</svg>
      <p class="body body__secondary">filename.docx</p>
      <button type="button" class="icon-button icon-button--sm" aria-label="Remove file">
        <svg class="svg-icon">...</svg>
      </button>
    </div>
    <!-- When no file (after removal): -->
    <div class="button-container">
      <div class="secondary-button">
        <button class="btn btn--pill">Attach</button>
        <label class="visually-hidden" for="resume">Attach</label>
        <input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf">
      </div>
      <!-- Dropbox, Google Drive, Enter manually buttons -->
    </div>
  </div>
</div>
```

### Pipeline Steps
1. **Disable "Autofill with MyGreenhouse" button** (in `greenhouse.js fillCustom()`)
   - Selector: `.application--header--autofill-with-greenhouse button`
   - Prevents profile data from overwriting JAOS-filled fields
2. **Remove existing profile resume** (`removeExistingResumeAttachment()` in `content.js`)
   - Find `[aria-label*="Remove"]` buttons near resume containers (`aria-labelledby` contains "resume")
   - Fallback: find "Resume/CV" label, walk up parents until filename (.docx/.pdf) found, click remove
3. **Wait 800ms** for Greenhouse React to re-render (shows Attach/Dropbox/etc. buttons)
4. **Find hidden file input** (`findResumeFileInputs()`)
   - Primary: `input[type="file"]` inside `[class*="file-upload"]` or `[role="group"]` with resume text
   - Also matches by: `aria-labelledby` containing "resume", or `input.id === "resume"`
   - The `<input id="resume" class="visually-hidden">` is behind the "Attach" button — no need to click Attach
5. **Inject file via DataTransfer** (`injectFileIntoInput()`)
   - Creates `File` from base64 data fetched from JAOS backend
   - Sets `input.files = dt.files` + dispatches `input`/`change` events
   - Also dispatches `dragenter`/`dragover`/`drop` on nearest wrapper for dropzone UIs

### Key Selectors
| Element | Selector |
|---------|----------|
| Resume upload container | `div.file-upload[aria-labelledby="upload-label-resume"]` |
| Remove file button | `button[aria-label="Remove file"]` (class: `icon-button icon-button--sm`) |
| Hidden file input | `input#resume.visually-hidden[type="file"]` |
| Greenhouse autofill btn | `.application--header--autofill-with-greenhouse button` |

### Status: VERIFIED (2026-03-06)
- Profile resume removed successfully
- JAOS resume uploaded correctly
- Console logs confirm full pipeline

---

## Cover Letter Upload — Deferred (Low ROI)

### Decision: Don't implement now
- Most job postings don't require cover letters
- Cover letters should be tailored per job (static upload is useless)
- Proper implementation requires: backend LLM generation endpoint + PDF rendering + panel toggle
- Greenhouse has Cover Letter file upload with same DOM pattern as Resume (separate `file-upload` container)
- When ready: `POST /api/v1/cover-letter/generate` → PDF → same DataTransfer upload pipeline

---

## Location (City) Typeahead — Deferred (Low ROI)

### Decision: Don't implement
- Greenhouse fills location from user profile automatically
- Field is a network-dependent typeahead (type → API call → results appear → pick one)
- Location matching is ambiguous ("Dallas" = TX, OR, GA)
- Usually optional, not required
- Fragile: depends on Greenhouse's autocomplete API timing

---

## Education Fields — Handled by Greenhouse Profile (No Extension Work Needed)

### Status: Resolved without implementation
- Education fields (School, Degree, Discipline, Start/End Year) are populated by Greenhouse from the user's Greenhouse profile
- When user clicks "Autofill with MyGreenhouse" or has a logged-in session, Greenhouse auto-fills education data
- Our extension previously couldn't fill these reliably (react-select typeaheads with async-loaded options)
- **Now solved for free** — Greenhouse profile does the heavy lifting, JAOS handles everything else
- **Requirement for users**: Complete the Education section in their Greenhouse profile for this to work
- This reduces our extension's scope and avoids fragile typeahead interactions for education fields

---

## Dropdown Selecting Raw Console Script

--------------------------------------------------------------

(() => {
  const all = document.querySelectorAll('[class*="-container"]:has([class*="__control"])');
  for (const c of all) {
    // Check if already filled
    const sv = c.querySelector('[class*="single-value"], [class*="singleValue"]');
    if (sv && sv.textContent.trim()) continue;
    // Check label text
    const lbl = c.querySelector('[class*="label"], label') || c.closest('[class*="field"]')?.querySelector('label');
    const txt = lbl?.textContent || '';
    console.log('Found unfilled dropdown, label:', txt.substring(0, 60));
    // Fill it
    const input = c.querySelector('input[role="combobox"]');
    if (!input) continue;
    const fk = Object.keys(input).find(k => k.startsWith('__reactFiber$'));
    let fiber = input[fk], opts = null, inst = null;
    for (let i = 0; i < 30 && fiber; i++) {
      const p = fiber.memoizedProps || {};
      if (p.options && Array.isArray(p.options) && !opts) opts = p.options;
      if (fiber.stateNode?.selectOption && !inst) inst = fiber.stateNode;
      fiber = fiber.return;
    }
    console.log('opts:', opts?.map(o => o.label), 'inst:', !!inst);
    if (inst && opts) {
      const pick = opts.find(o => /yes/i.test(o.label)) || opts[0];
      inst.selectOption(pick);
      console.log('Selected:', pick.label);
    }
  }
})();

--------------------------------------------------------------

---

## Test URLs

- https://job-boards.greenhouse.io/mthreerecruitingportal/jobs/4651219006?gh_src=my.greenhouse.search
- https://job-boards.eu.greenhouse.io/moniepoint/jobs/4791652101
- https://job-boards.greenhouse.io/capstoneintegratedsolutions/jobs/4917664007?gh_src=my.greenhouse.search
- https://job-boards.greenhouse.io/ocrolusinc/jobs/5745522004?gh_src=my.greenhouse.search