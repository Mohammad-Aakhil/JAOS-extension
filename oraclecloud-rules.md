# Oracle Cloud HCM (Recruiting) Fill Rules

> Built bottom-up: each field type verified individually via DevTools before composing into adapter.
> Portals tested: fa-*.ocs.oraclecloud.com (multiple job postings)
> AKA: Oracle Fusion Cloud HCM, Oracle Recruiting Cloud (successor to Taleo)

---

## Portal Layout

Oracle Cloud uses a **single scrollable page** with a **right sidebar navigation** listing all sections.
Sections vary per job posting but follow a consistent DOM pattern.

### Sidebar Navigation (right side)
Sections observed across portals (sorted by frequency):

| Section | Frequency | Notes |
|---------|-----------|-------|
| IMPORT YOUR PROFILE | Always | "Apply with Indeed" / "Apply with LinkedIn" buttons |
| CONTACT INFORMATION | Always | First section to fill |
| ADDRESS | Always | All location fields are dropdowns |
| WORK AND EDUCATION HISTORY | Always | Multi-entry: ADD EXPERIENCE / ADD EDUCATION buttons |
| SUPPORTING DOCUMENTS AND URLS | Always | Resume/CV + Cover Letter file uploads |
| DISABILITY INFORMATION | Always | Voluntary Self-ID of Disability (OFCCP) |
| DIVERSITY INFORMATION | Always | Gender, Ethnicity/Race |
| VETERAN INFORMATION | Always | VEVRAA veteran status |
| E SIGNATURE | Always | Final confirmation before submit |
| APPLICATION QUESTIONS | Common | Job-specific questions |
| EXTRA INFORMATION | Sometimes | Additional info fields |
| SKILLS | Sometimes | Skills entry |
| LICENSES AND CERTIFICATES | Sometimes | Credential entry |
| LANGUAGES | Sometimes | Language proficiency |

---

## Framework & Technology Stack

**CONFIRMED: Knockout.js + Oracle JET (NOT React)**

| Tech | Details |
|------|---------|
| **Knockout.js** | `data-bind` attributes everywhere, `<!-- ko if -->` template comments |
| **Oracle JET** | `oj-dialog`, `oj-progress-bar`, `oj-text-area` custom elements |
| **Web Components** | 38 custom elements (see below) |
| **React** | NOT present — no fiber, no React root |
| **CSS** | BEM-style: `input-row__control`, `input-row__label`, `input-row__validation` |

### Fill Strategy
Knockout.js uses `data-bind="value: element.value"` — observable bindings.
Set `.value` on the input + dispatch `input`/`change` events → Knockout picks it up automatically.
**No fiber bridge, no React hacks, no synthetic events needed.**

For Knockout-managed dropdowns (Oracle JET `oj-select-single`, custom comboboxes):
may need to trigger Knockout's `valueUpdate` binding or call `ko.dataFor(el).element.value(newVal)` directly.

### Key Custom Elements
```
name-form              — Contact info form wrapper
address-form-v2        — Address section wrapper
form-builder           — Dynamic form sections (Application Questions, etc.)
form-element-label     — Label wrapper with required star
apply-flow-section     — Each sidebar section container
apply-flow-block       — Content block within a section
apply-flow-navigation-train — Sidebar navigation
beautiful-timeline     — Work/Education history timeline
timeline-form-inline   — Inline form within timeline entries
resume-upload-button   — Resume upload widget
cover-letter-upload-button — Cover letter upload widget
indeed-import-handler  — "Apply with Indeed" integration
attachment-preuploaded — Pre-attached files from profile import
oj-dialog              — Oracle JET modal dialog
oj-progress-bar        — Oracle JET progress indicator
oj-text-area           — Oracle JET textarea
```

---

## Detection Pattern

**URL patterns** (from screenshots):
- `fa-*.ocs.oraclecloud.com/hcmUI/CandidateExperience/...`
- `*.fa.*.ocs.oraclecloud.com/...`

**DOM markers**:
- Custom element `<apply-flow-navigation-train>` (sidebar)
- Custom element `<name-form>` (contact section)
- Custom element `<address-form-v2>` (address section)
- Inputs with `class="input-row__control"` and `data-bind="value: element.value"`
- `<!-- ko if -->` comments in DOM (Knockout.js templating)

---

<!-- Template for each field:

## Field: [Field Name]
- **Section**: Which section this belongs to
- **Type**: text-input | dropdown-select | radio-group | checkbox-group | file-upload | multi-entry-button
- **Required**: yes | no | varies
- **DOM Pattern**: CSS selector / description
- **Fill Method**: How to set the value
- **Test Script**:
```js
// Paste in DevTools console
```
- **Status**: pending | verified | needs-work
- **Notes**: Quirks, edge cases

-->

## Complete Field Map (Verified via Console — Fanatics Portal)

**34 total visible inputs. Two CSS classes distinguish field types:**
- `input-row__control` = plain text/email/tel/url input → set `.value` + dispatch events
- `cx-select-input` = custom searchable dropdown → type text + pick from suggestion list

### Contact Information (inside `<name-form>`)
| # | name | id | type | class | required | label | notes |
|---|------|----|------|-------|----------|-------|-------|
| 0 | `lastName` | `lastName-26` | text | `input-row__control` | **yes** | Last Name | |
| 1 | `firstName` | `firstName-27` | text | `input-row__control` | no | First Name | |
| — | — | — | **pill buttons** | **custom** | no | Title | Doctor/Miss/Mr/Mrs/Ms — NOT `<input type="radio">`! Custom Knockout buttons. Need separate DOM inspection |
| 2 | `middleNames` | `middleNames-29` | text | `input-row__control` | no | Middle Name | |
| 3 | `knownAs` | `knownAs-30` | text | `input-row__control` | no | Preferred Name | Only in some portals |
| 4 | `email` | `email-31` | email | `input-row__control communication-channel__email-control` | no | Email Address | **Prefilled** from profile import |
| 5 | — | `af-checkbox-emailPreferredFlag-32` | checkbox | `input-row__hidden-control` | no | Use for communication | Checked by default |
| 6 | `phoneNumber` | `country-codes-dropdownphoneNumber` | text | `cx-select-input` | no | Phone Number (country code) | Dropdown, value="+1" |
| 7 | — | — | tel | `input-row__control phone-row__input` | **yes** | Country code (phone input) | Actual phone number text field |
| 8 | — | `af-checkbox-phonePreferredFlag-34` | checkbox | `input-row__hidden-control` | no | Use SMS for communication | |

### Address (inside `<address-form-v2>`)
| # | name | id | type | class | required | label | notes |
|---|------|----|------|-------|----------|-------|-------|
| 9 | `country` | `country-19` | text | `cx-select-input` | **yes** | Country | Dropdown, default "United States" |
| 10 | `addressLine1` | `addressLine1-20` | text | `cx-select-input` | **yes** | Address Line 1 | **Autocomplete dropdown** with suggestions |
| 11 | `addressLine2` | `addressLine2-21` | text | `input-row__control` | no | Address Line 2 | Plain text input |
| 12 | `city` | `city-22` | text | `cx-select-input` | **yes** | City | Dropdown |
| 13 | `region2` | `region2-23` | text | `cx-select-input` | **yes** | State | Dropdown. NOTE: `region2` = State |
| 14 | `postalCode` | `postalCode-24` | text | `cx-select-input` | **yes** | ZIP Code | Dropdown |
| 15 | `region1` | `region1-25` | text | `cx-select-input` | **yes** | County | Dropdown. NOTE: `region1` = County |

### Application Questions (portal-specific)
| # | name | id | type | class | required | label |
|---|------|----|------|-------|----------|-------|
| 16 | `300000010926928` | `300000010926928-16` | text | `cx-select-input` | **yes** | How did you hear about Fanatics? |
| 17 | `referrerName` | `referrerName-8` | text | `input-row__control` | no | Referrer Name |

### Supporting Documents and URLs
| # | name | id | type | class | required | label |
|---|------|----|------|-------|----------|-------|
| 18 | `siteLink-1` | `siteLink-1-7` | url | `input-row__control` | no | Link 1 |

*(Resume/Cover Letter uploads are custom elements: `<resume-upload-button>`, `<cover-letter-upload-button>` — not regular inputs)*

### Disability Information (radio group)
| # | name | value | label |
|---|------|-------|-------|
| 19 | `US-STANDARD-ORA_DISABILITY_STATUS-STANDARD-9` | `ORA_PER_YES_US` | Yes, I have a disability, or have had one in the past |
| 20 | `US-STANDARD-ORA_DISABILITY_STATUS-STANDARD-9` | `ORA_PER_NO_US` | No, I do not have a disability and have not had one in the past |
| 21 | `US-STANDARD-ORA_DISABILITY_STATUS-STANDARD-9` | `ORA_PER_NO_ANSWER_US` | I do not want to answer |

All radios: `class="input-row__hidden-control apply-flow-input-radio-control"`, parent: `input-row__control-container`

### Diversity Information (checkbox group + dropdowns)
**Ethnicity/Race checkboxes** (all `class="input-row__hidden-control"`):
| # | id | value | label |
|---|-----|-------|-------|
| 22 | `dq-option-4` | `4` | I am Hispanic or Latino |
| 23 | `dq-option-7` | `7` | American Indian or Alaska Native |
| 24 | `dq-option-5` | `5` | Asian |
| 25 | `dq-option-3` | `3` | Black or African American |
| 26 | `dq-option-6` | `6` | Native Hawaiian or other Pacific Islander |
| 27 | `dq-option-PREF_NO_ANSWER` | `PREF_NO_ANSWER` | Prefer not to answer |
| 28 | `dq-option-1` | `1` | White |

**Dropdowns:**
| # | name | class | required | label |
|---|------|-------|----------|-------|
| 29 | `US-STANDARD-ORA_GENDER-STANDARD` | `cx-select-input` | **yes** | Gender |
| 30 | `US-STANDARD-ORA_VETERAN_STATUS-STANDARD` | `cx-select-input` | no | Veteran Status |

### Consent & E-Signature
| # | id | type | label |
|---|----|------|-------|
| 31 | `job-alerts-checkbox` | checkbox | I agree to receive updates about new job opportunities |
| 32 | — | checkbox | I agree to receive marketing communications |
| 33 | `fullName-6` | text (`input-row__control`) | Full Name (E-Signature), **required** |

---

## TODO: Fields Needing More Inspection

- [x] **Title pill buttons** — VERIFIED. `<button aria-pressed>` inside `<ul class="cx-select-pills-container">`. Click to select.
- [x] **`cx-select-input` dropdown mechanics** — VERIFIED. `role="combobox"`, type to filter, options in `cx-select__options` modal, click to select.
- [x] **Address Line 1 autocomplete** — VERIFIED. Oracle Maps autocomplete (`oracle-maps-search-hint`), extra class `cx-select-input--auto-suggest`.
- [x] **Resume/Cover Letter upload elements** — VERIFIED. `input[type="file"]` inside custom elements, DataTransfer API + `change` event triggers Knockout's `onFileSelected`
- [x] **Work/Education ADD buttons** — VERIFIED. See Experience Form section below.
- [x] **Education form fields** — VERIFIED. See Education Form section below.

---

## Verified Rules

### DOM Structure Pattern (All Text Inputs)

Every text input follows this exact structure:
```html
<form-element-label>
  <label class="input-row__label input-row__label--required"
         data-bind="css: {'input-row__label--required': element.isRequired, 'input-row__label--disabled': element.isDisabled}"
         for="lastName-26"
         aria-labelledby="labelText-lastName-26 instructionsText-lastName-26">
    <span class="input-row_linebreak" data-bind="attr: {id: labelTextId}" id="labelText-lastName-26">
      Last Name
    </span>
    <!-- ko if : element.isRequired -->
    <span class="input-row__label--required-star" aria-hidden="true">*</span>
    <!-- /ko -->
  </label>
</form-element-label>
<div class="input-row__control-container">
  <input class="input-row__control"
         data-bind="value: element.value, valueUpdate: element.valueUpdateType(), attr: element.attributes, ..."
         id="lastName-26"
         name="lastName"
         autocomplete="family-name"
         aria-required="true"
         aria-describedby="lastName-26-error"
         aria-invalid="true">
  <div class="input-row__control-decorator"></div>
  <!-- ko if: isInvalid -->
  <p class="input-row__validation" role="alert" id="lastName-26-error">
    The Last Name field is required.
  </p>
  <!-- /ko -->
</div>
```

### Selector Cheat Sheet

| What | Selector |
|------|----------|
| All text inputs | `input.input-row__control` |
| Input by name | `input[name="lastName"]` |
| Input by id prefix | `input[id^="lastName"]` |
| Label for input | `label[for="<input.id>"]` or `span[id^="labelText-"]` |
| Required inputs | `input[aria-required="true"]` |
| Required labels | `label.input-row__label--required` |
| Validation errors | `p.input-row__validation[role="alert"]` |
| Name section | `name-form` (custom element) |
| Address section | `address-form-v2` (custom element) |
| Any section | `apply-flow-section` (custom element) |

### Field: Last Name
- **Section**: Contact Information (`<name-form>`)
- **Type**: text-input
- **Required**: yes
- **DOM Pattern**: `input.input-row__control[name="lastName"]` / `id="lastName-26"`
- **Autocomplete**: `family-name`
- **Fill Method**: Set `.value` + dispatch `input`/`change` events + `.blur()`. Knockout picks it up.
- **Test Script**:
```js
const el = document.querySelector('input[name="lastName"]');
el.focus(); el.value = 'Aqeel';
el.dispatchEvent(new Event('input', { bubbles: true }));
el.dispatchEvent(new Event('change', { bubbles: true }));
el.blur();
```
- **Status**: FILL VERIFIED
- **Notes**: ID has numeric suffix (`-26`) that may vary per portal. Use `name="lastName"` or `id^="lastName"` for reliable selection. Validation error clears on fill. Phone auto-formats (e.g., `7169364737` → `(716) 936-4737`).

### Field: First Name
- **Section**: Contact Information (`<name-form>`)
- **Type**: text-input
- **Required**: no
- **DOM Pattern**: `input.input-row__control[name="firstName"]` / `id="firstName-27"`
- **Fill Method**: Same as Last Name
- **Status**: FILL VERIFIED

### Field: Middle Name
- **Section**: Contact Information (`<name-form>`)
- **Type**: text-input
- **Required**: no
- **DOM Pattern**: `input.input-row__control[name="middleNames"]` / `id="middleNames-29"`
- **Fill Method**: Same as Last Name
- **Status**: FILL VERIFIED

### Field: Preferred Name
- **Section**: Contact Information (`<name-form>`)
- **Type**: text-input
- **Required**: no
- **DOM Pattern**: `input.input-row__control[name="knownAs"]` / `id="knownAs-30"`
- **Fill Method**: Same as Last Name
- **Status**: FILL VERIFIED
- **Notes**: Only present in some portals

### Field: Email Address
- **Section**: Contact Information (`<name-form>`)
- **Type**: email
- **Required**: no (but typically prefilled)
- **DOM Pattern**: `input.input-row__control[name="email"]` / `id="email-31"`
- **Extra class**: `communication-channel__email-control`
- **Fill Method**: SKIP if prefilled (check `.value.trim()` first)
- **Status**: FILL VERIFIED
- **Notes**: Prefilled from Indeed/LinkedIn profile import

### Field: Phone Number (Country Code)
- **Section**: Contact Information (`<name-form>`)
- **Type**: custom dropdown (`cx-select-input`)
- **DOM Pattern**: `input.cx-select-input[name="phoneNumber"]` / `id="country-codes-dropdownphoneNumber"`
- **Fill Method**: Same as cx-select-input universal pattern (see below)
- **Status**: FILL VERIFIED
- **Notes**: Default value "+1" (US). Skip if already correct.

### Field: Phone Number (Actual Number)
- **Section**: Contact Information (`<name-form>`)
- **Type**: tel input
- **Required**: yes
- **DOM Pattern**: `input.input-row__control.phone-row__input[type="tel"]` (no name attribute, no id)
- **Fill Method**: Same native setter as text inputs
- **Status**: FILL VERIFIED
- **Notes**: No `name` or `id` — select by class `phone-row__input`

### Field: Title (Pill Buttons)
- **Section**: Contact Information (`<name-form>`)
- **Type**: custom pill buttons (Knockout `cx-select-pills` component)
- **Required**: no
- **DOM Pattern**:
```html
<div class="input-row__control-container reset-z-index" data-qa="title">
  <!-- ko if: showSingleSelectPills -->
  <div data-bind="react: { component: 'cx-select-pills', props: {
    list: element.options(), isMultiselect: false, value: element.value(),
    valueObserver: element.value, optionKeys: element.optionKeys(),
    headerLabel: element.label() }}">
    <ul role="list" aria-label="Title" class="cx-select-pills-container">
      <li role="listitem">
        <button type="button" aria-pressed="false" class="cx-select-pill-section">
          <span class="cx-select-pill-name">Doctor</span>
        </button>
      </li>
      <li role="listitem">
        <button type="button" aria-pressed="false" class="cx-select-pill-section">
          <span class="cx-select-pill-name">Miss</span>
        </button>
      </li>
      <!-- ... Mr., Mrs., Ms. -->
    </ul>
  </div>
</div>
```
- **Key selectors**:
  - Container: `ul.cx-select-pills-container[aria-label="Title"]`
  - Each option: `button.cx-select-pill-section` with `aria-pressed="true|false"`
  - Option text: `span.cx-select-pill-name`
- **Fill Method**: Find button by text, `.click()` it. `aria-pressed` flips to `"true"`.
- **Test Script**:
```js
// Select "Mr." title
const pills = document.querySelectorAll('ul.cx-select-pills-container button.cx-select-pill-section');
for (const btn of pills) {
  if (btn.querySelector('.cx-select-pill-name')?.textContent.trim() === 'Mr.') {
    btn.click();
    console.log('Selected Mr., aria-pressed:', btn.getAttribute('aria-pressed'));
    break;
  }
}
```
- **Options vary per portal**: Doctor/Miss/Mr./Mrs./Ms. OR B.Sc./M.S.C./Miss/Mr./Mrs./Ms.
- **Status**: FILL VERIFIED
- **Notes**: Knockout binds `valueObserver: element.value` — clicking the button updates the Knockout observable automatically. `data-qa="title"` on container can be used for scoping.

### Field: E-Signature (Full Name)
- **Section**: E-Signature
- **Type**: text-input
- **Required**: yes
- **DOM Pattern**: `input.input-row__control[name="fullName"]` / `id="fullName-6"`
- **Fill Method**: Same as Last Name — fill with `${firstName} ${lastName}`
- **Status**: FILL VERIFIED

---

### Universal: cx-select-input Dropdown (9 fields use this)
- **Type**: custom searchable combobox (Knockout-bound)
- **Used by**: Country, Address Line 1, City, State, ZIP Code, County, Phone Country Code, Gender, Veteran Status, Application Questions
- **DOM Pattern**:
```html
<div class="cx-select-container">
  <div class="input-field-container">
    <div class="input-field-container__left">
      <span id="inputFieldLabel-country-19" class="input-field__label">Country</span>
      <input autocomplete="none" name="country" id="country-19"
             type="text" role="combobox"
             aria-autocomplete="list" aria-haspopup="grid"
             aria-controls="country-19-listbox"
             aria-expanded="false"
             aria-required="true"
             class="cx-select-input">
    </div>
    <div class="input-field-container__right">
      <!-- X clear button -->
      <button id="country-19-reset-button"
              aria-label="Remove value for the Country field."
              class="icon-clear focused-tooltip"></button>
      <!-- Dropdown arrow -->
      <button id="country-19-toggle-button" tabindex="-1"
              aria-label="Open the drop-down list for Country."
              aria-expanded="false"
              aria-controls="country-19-listbox"
              class="icon-dropdown-arrow"></button>
    </div>
  </div>
  <!-- Options modal (appears when expanded) -->
  <div id="country-19-cx-select__modal" class="cx-select__options position-bottom">
    <!-- list items here -->
  </div>
  <!-- Accessible status -->
  <div role="status" class="ui-helper-hidden-accessible">500 matches found</div>
</div>
```
- **Key selectors**:
  - Input: `input.cx-select-input[role="combobox"]`
  - By name: `input.cx-select-input[name="country"]`
  - Clear button: `button#[fieldId]-reset-button` or `button.icon-clear`
  - Toggle button: `button#[fieldId]-toggle-button` or `button.icon-dropdown-arrow`
  - **Listbox container**: `div#[fieldId]-listbox-container`
  - **Listbox grid**: `div[role="grid"]#[fieldId]-listbox`
  - **Option rows**: `div[role="row"]` > `div[role="gridcell"].cx-select__list-item`
  - **Option text**: `span.cx-select-list-item--content` (inside gridcell)
  - Label: `span.input-field__label` inside `input-field-container__left`
  - Status: `div[role="status"].ui-helper-hidden-accessible`
- **Fill Method**: Focus → clear → type search text → wait for listbox options → click matching gridcell
- **Listbox DOM structure** (verified):
```html
<div id="[fieldId]-listbox-container">
  <div role="grid" id="[fieldId]-listbox">
    <div role="row">
      <div role="gridcell" class="cx-select__list-item" id="[fieldId]-option-0">
        <div class="cx-select__list-item-container">
          <span class="cx-select-list-item--content">Dallas, Dallas, TX</span>
        </div>
      </div>
    </div>
    <!-- more rows... -->
  </div>
</div>
```
- **Test Script**:
```js
// Universal cx-select-input fill — example: fill City with "Dallas"
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const input = document.querySelector('input.cx-select-input[name="city"]');
  if (!input) { console.error('Input not found'); return; }

  // 1. Focus and clear
  input.focus();
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(300);

  // 2. Type search text character by character
  const searchText = 'Dallas';
  for (const char of searchText) {
    input.value += char;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(50);
  }
  await delay(800); // wait for dropdown to filter

  // 3. Find and click matching option in listbox
  const listbox = document.getElementById(input.id + '-listbox');
  if (!listbox) { console.error('Listbox not found'); return; }
  const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
  console.log(`Found ${items.length} options`);
  for (const item of items) {
    const text = item.querySelector('span.cx-select-list-item--content')?.textContent?.trim()
              || item.textContent.trim();
    if (text.toLowerCase().includes('dallas')) {
      console.log('Clicking:', text);
      item.click();
      break;
    }
  }
})();
```
- **Status**: FILL VERIFIED ✅
- **Notes**:
  - City options format: `"City, County, State"` (e.g., "Dallas, Dallas, TX")
  - `aria-expanded` toggles when dropdown opens/closes
  - Status div shows "X matches found"
  - Some fields have `aria-required="true"`, others don't
  - ID pattern: `[fieldId]` = `[fieldName]-[number]` → listbox at `[fieldId]-listbox`
  - **IMPORTANT**: Old doc referenced `#[fieldId]-cx-select__modal` — that's WRONG. The actual listbox is `#[fieldId]-listbox` with `role="grid"`
  - **City selection cascades**: Picking a city auto-fills State and County

---

### Universal: Address Line 1 (Oracle Maps Autocomplete)
- **Type**: cx-select-input with auto-suggest enhancement
- **DOM Pattern**: Same as cx-select-input but with extra class:
```html
<input name="addressLine1" id="addressLine1-20"
       type="text" role="combobox"
       aria-autocomplete="list"
       aria-describedby="oracle-maps-search-hint"
       aria-haspopup="grid"
       aria-controls="addressLine1-20-listbox"
       aria-expanded="true"
       aria-required="true"
       class="cx-select-input cx-select-input--auto-suggest">
```
- **Key differences from regular cx-select**:
  - Extra class: `cx-select-input--auto-suggest`
  - `aria-describedby="oracle-maps-search-hint"` — Oracle Maps API, NOT Google Places
  - Hint text below: "Enter your street name and other address details to see suggestions"
  - Options format: full addresses like "LA 1, ECHO, LOUISIANA"
  - Selecting an address **auto-fills City, State, ZIP, County** (cascading fill)
- **Fill Strategy**:
  - **Primary (cascade)**: Type partial address → wait for Oracle Maps suggestions → click best match → City, State, ZIP, County all auto-populate
  - **Fallback (individual)**: If Oracle Maps suggestions don't appear (timing-dependent, network API), fill Address Line 1 as plain text (just set `.value` + events), then fill City/State/ZIP/County individually via their cx-select dropdowns
- **Oracle Maps Timing Issue**: The autocomplete calls an external Oracle Maps API. Suggestions may take 1-2s to appear. The listbox container exists immediately but populates asynchronously. Use MutationObserver on the listbox or poll with retries.
- **Status**: FILL VERIFIED ✅ (keyboard events required — keydown/keypress/keyup, not just input event)
- **Notes**: This is the most impactful field to fill — selecting an address suggestion cascades to fill City, State, ZIP, and County automatically. If autocomplete fails, fall back to filling each field individually. The fallback path is more reliable for automation.
- **CRITICAL**: Must dispatch full keyboard event sequence (`keydown` → `keypress` → set value → `input` → `keyup`) per character. Oracle Maps API listens to keyboard events, NOT just `input` events. Plain `.value` + `input` event does NOT trigger the Maps lookup.

---

### Address Cascade Behavior (CRITICAL)
- Selecting an Oracle Maps suggestion fills **all 5 fields at once**: Address Line 1 + City + State + ZIP + County
- **Clearing ANY ONE of City/State/ZIP/County clears ALL FOUR** — they are a linked group
- **Never re-fill individual fields after a successful cascade** — it can nuke the others
- After cascade, `dependency-fields-loading` / `dependency-fields-loaded` messages appear in console
- Employer Country selection also cascades: shows "Employer State or Province" dropdown after picking a country

---

### Work and Education History

**Section container**: `<beautiful-timeline>` with year markers (2027, 2026, 2025...)

**Buttons** (Knockout data-bind click handlers):
```html
<button id="timeline-add-experience-button" type="button"
  class="work-and-education-timeline-add-button timeline-work-add-button apply-flow-profile-item-button apply-flow-profile-item-button--add"
  data-bind="click: addExperienceProfileItem">
  <span class="apply-flow-profile-item-button__label">Add Experience</span>
</button>

<button id="timeline-add-education-button" type="button"
  class="work-and-education-timeline-add-button timeline-education-add-button apply-flow-profile-item-button apply-flow-profile-item-button--add"
  data-bind="click: addEducationProfileItem">
  <span class="apply-flow-profile-item-button__label">Add Education</span>
</button>
```

**Key selectors**:
- Add Experience: `button#timeline-add-experience-button`
- Add Education: `button#timeline-add-education-button`
- Form appears inside: `<timeline-form-inline>`
- Cancel button: `button.cancel-btn` (type="submit")
- Save button: `button.save-btn` (type="submit") — text is "Add Experience" or "Add Education"

---

### Experience Form (inside `<timeline-form-inline>`)

Appears after clicking "ADD EXPERIENCE". All fields verified via seed script.

| # | Field | name | id pattern | type | required |
|---|-------|------|------------|------|----------|
| 0 | Employer Name | `employerName` | `employerName-49` | `input-row__control` | **yes** |
| 1 | Job Title | `jobTitle` | `jobTitle-50` | `input-row__control` | no |
| 2 | Start Date Month | `startDate` | `month-startDate-51` | `cx-select-input` | no |
| 3 | Start Date Year | `startDate` | `year-startDate-51` | `cx-select-input` | no |
| 4 | End Date Month | `endDate` | `month-endDate-52` | `cx-select-input` | no |
| 5 | End Date Year | `endDate` | `year-endDate-52` | `cx-select-input` | no |
| 6 | Employer Country | `countryCode` | `countryCode-53` | `cx-select-input` | no |
| 7 | Employer State | — | — | `cx-select-input` | no |
| 8 | Employer City | `employerCity` | `employerCity-54` | `input-row__control` | no |
| 9 | Responsibilities | `responsibilities` | `responsibilities-55` | `textarea` | no |

- **Date IDs use prefix**: `month-startDate-51`, `year-startDate-51` → listbox at `month-startDate-51-listbox`
- **Employer Country cascade**: Selecting a country shows "Employer State or Province" field dynamically
- **Textarea**: Has autoheight helper sibling (`input-row__control--helper`)
- **Status**: FILL VERIFIED ✅ (all 9 fields filled successfully via seed script)

---

### Education Form (inside `<timeline-form-inline>`)

Appears after clicking "ADD EDUCATION". **CRITICAL: Form structure varies per portal.**

#### Variant A — Fanatics Portal (text Degree, has dates)
| # | Field | name | id pattern | type | required |
|---|-------|------|------------|------|----------|
| 0 | Degree | `degreeName` | `degreeName-57` | `input-row__control` | **yes** |
| 1 | Major | `major` | `major-58` | `input-row__control` | no |
| 2 | Start Date Month | `startDate` | `month-startDate-59` | `cx-select-input` | no |
| 3 | Start Date Year | `startDate` | `year-startDate-59` | `cx-select-input` | no |
| 4 | End Date Month | `endDate` | `month-endDate-60` | `cx-select-input` | no |
| 5 | End Date Year | `endDate` | `year-endDate-60` | `cx-select-input` | no |
| 6 | Country | `countryCode` | `countryCode-61` | `cx-select-input` | no |
| 7 | City | `city` | `city-62` | `input-row__control` | no |

#### Variant B — HealthPartners Portal (dropdown Degree, no dates, has School/Status)
| # | Field | name | id pattern | type | required |
|---|-------|------|------------|------|----------|
| 0 | Degree | `contentItemId` | `contentItemId-47` | **cx-select-input** | **yes** |
| 1 | Major | `major` | `major-48` | `input-row__control` | no |
| 2 | School | `educationalEstablishment` | `educationalEstablishment-49` | **cx-select-input** | no |
| 3 | Country | `countryCode` | `countryCode-50` | `cx-select-input` | no |
| 4 | City | `city` | `city-51` | `input-row__control` | no |
| 5 | Minor | `minor` | `minor-52` | `input-row__control` | no |
| 6 | Comments | `comments` | `comments-53` | textarea | no |
| 7 | Status | — | — | **pill buttons** | no |

**Degree dropdown options (Variant B)**: Associate's Degree/College Diploma, Bachelor's Degree, Certificate Program, Doctorate Degree, High School Diploma/GED, Higher Education Degree, Master's Degree, Medical Degree/MD/DO, Non-Degree Program, Other

**Status pill options (Variant B)**: In Progress/Enrolled, Completed, Withdrew From Program

#### Adapter Detection Logic
```js
const isDropdownDegree = !!document.querySelector('input.cx-select-input[name="contentItemId"]');
const isTextDegree = !!document.querySelector('input.input-row__control[name="degreeName"]');
const hasDates = !!document.querySelector('input.cx-select-input[id^="month-startDate"]');
const hasSchool = !!document.querySelector('input.cx-select-input[name="educationalEstablishment"]');
const hasStatusPills = document.querySelectorAll('timeline-form-inline button.cx-select-pill-section').length > 0;
```

#### Common to both variants
- Same Country cascade behavior — selecting a country shows State field dynamically
- **State field**: `name="stateProvinceCode"`, cx-select-input
- **State options are 2-letter codes** (AK, AL, TX...), NOT full names. Must search "TX" not "Texas"
- **Adapter needs state name→code lookup** when user profile has full name
- **Fill order**: Country → wait for State cascade → fill State ("TX") → fill City
- **Status**: FILL VERIFIED on both portals ✅

---

### Supporting Documents and URLs

**Custom elements** (NOT regular file inputs):
- `<resume-upload-button>` — drag-and-drop or click "Upload Resume"
- `<cover-letter-upload-button>` — drag-and-drop or click "Upload Cover Letter"

**Resume upload DOM (verified)**:
```html
<resume-upload-button params="model: resumeUploadButtonViewModel">
  <div class="attachment-upload-button attachment-upload-button--waiting" role="application"
       data-bind="event: { dragover, dragenter, dragleave, drop: handleDrop }">
    <div class="attachment-upload-button__container font-family-secondary">
      <div class="attachment-upload-button__drag-and-drop">
        <!-- "Drop Resume Here" label -->
      </div>
      <div class="file-form-element">
        <input type="file" class="file-form-element__input upload-button" multiple
               id="attachment-upload-d-4" name="attachment-upload"
               accept=".txt, .rtf, .doc, .docx, .pdf, .odt, .htm, .html"
               data-bind="event: { change: element.onFileSelected }">
        <label class="file-form-element__label attachment-upload-button__label"
               for="attachment-upload-4">
          <span>Upload Resume</span>
        </label>
      </div>
    </div>
  </div>
</resume-upload-button>
```

**Key selectors**:
- Resume container: `resume-upload-button`
- Cover letter container: `cover-letter-upload-button`
- File input (resume): `resume-upload-button input[type="file"]`
- File input (cover letter): `cover-letter-upload-button input[type="file"]`
- Upload label: `label.file-form-element__label` (clickable, opens file dialog)
- State classes: `attachment-upload-button--waiting` (empty), check for `STATES.FILLED`

**Fill Method**: DataTransfer API — same as Greenhouse:
```js
const input = document.querySelector('resume-upload-button input[type="file"]');
const dt = new DataTransfer();
dt.items.add(resumeFile); // File object from extension
input.files = dt.files;
input.dispatchEvent(new Event('change', { bubbles: true }));
// Knockout's onFileSelected handler triggers upload
```

- **Status**: DOM VERIFIED ✅ (DataTransfer fill pending — needs actual resume file from extension)

---

### Disability Information (radio group)

| # | value | label | id |
|---|-------|-------|----|
| 0 | `ORA_PER_YES_US` | Yes, I have a disability... | `US-STANDARD-ORA_DISABILITY_STATUS-STANDARD-8-ORA_PER_YES_US` |
| 1 | `ORA_PER_NO_US` | No, I do not have a disability... | `US-STANDARD-ORA_DISABILITY_STATUS-STANDARD-8-ORA_PER_NO_US` |
| 2 | `ORA_PER_NO_ANSWER_US` | I do not want to answer | `US-STANDARD-ORA_DISABILITY_STATUS-STANDARD-8-ORA_PER_NO_ANSWER_US` |

- Radio `name`: `US-STANDARD-ORA_DISABILITY_STATUS-STANDARD-8` (suffix number varies per portal)
- **Fill Method**: `document.getElementById(radioId).click()`
- **Default for autofill**: "I do not want to answer" (`ORA_PER_NO_ANSWER_US`)
- **Status**: SEED SCRIPT READY (pending test)

---

### Diversity Information (checkbox group + dropdowns)

**Ethnicity/Race checkboxes** (multi-select):
| id | value | label |
|----|-------|-------|
| `dq-option-4` | `4` | I am Hispanic or Latino |
| `dq-option-7` | `7` | American Indian or Alaska Native |
| `dq-option-5` | `5` | Asian |
| `dq-option-3` | `3` | Black or African American |
| `dq-option-6` | `6` | Native Hawaiian or other Pacific Islander |
| `dq-option-PREF_NO_ANSWER` | `PREF_NO_ANSWER` | Prefer not to answer |
| `dq-option-1` | `1` | White |

- **Fill Method**: `document.getElementById(checkboxId).click()`
- **Default for autofill**: "Prefer not to answer"

**Gender** (cx-select dropdown, **required**):
- name: `US-STANDARD-ORA_GENDER-STANDARD`
- id: `US-STANDARD-ORA_GENDER-STANDARD-11` (suffix varies)
- **Options (Oracle Cloud)**: Female, Male, Nonbinary, Prefer not to Answer, X-Gender
- **Default for autofill**: "Prefer not to Answer" (search "Prefer") — safe default
- **Adapter can map profile gender** to matching option, fall back to "Prefer not to Answer"

**Veteran Status** (cx-select dropdown):
- name: `US-STANDARD-ORA_VETERAN_STATUS-STANDARD`
- id: `US-STANDARD-ORA_VETERAN_STATUS-STANDARD-12` (suffix varies)
- **Options (Oracle Cloud specific)**: "Not a Protected Veteran", "Declines to Self-Identify", "Protected Veteran"
- **Default for autofill**: "Not a Protected Veteran" (search "Not")

- **Status**: FILL VERIFIED ✅ (Disability, Ethnicity, Veteran, E-Signature all working. Gender needs profile value mapping.)

---

### Consent & E-Signature

**E-Signature** (text input, **required**):
- name: `fullName`, id: `fullName-6` (suffix varies)
- Fill with `${firstName} ${lastName}` from user profile
- Same fill method as all text inputs

**Consent checkboxes** (optional):
| id | label | default |
|----|-------|---------|
| `job-alerts-checkbox` | I agree to receive updates about new job opportunities | skip |
| (no id) | I agree to receive marketing communications | skip |

- **Adapter should NOT auto-check consent** — user preference
- **Status**: SEED SCRIPT READY (pending test)

---

## DOM Inspection Scripts

### Script 1: Full Page Structure Scanner
Paste in console on any Oracle Cloud application page to dump the complete field inventory.

```js
// ORACLE CLOUD — Full Page Field Scanner
// Dumps all form fields with their types, labels, containers, and attributes
(() => {
  const results = [];

  // 1. All input elements
  document.querySelectorAll('input').forEach(el => {
    if (!el.offsetParent && el.type !== 'hidden' && el.type !== 'file') return; // skip invisible (except hidden/file)
    const label = el.labels?.[0]?.textContent?.trim()
      || el.closest('[class*="field"], fieldset, [class*="form-group"], [class*="row"]')?.querySelector('label, legend, [class*="label"]')?.textContent?.trim()
      || el.getAttribute('aria-label')
      || el.placeholder
      || '';
    results.push({
      tag: 'INPUT',
      type: el.type,
      id: el.id,
      name: el.name,
      class: el.className.substring(0, 120),
      label: label.substring(0, 80),
      value: el.value.substring(0, 50),
      required: el.required || el.getAttribute('aria-required') === 'true',
      parent3: el.parentElement?.parentElement?.parentElement?.className?.substring(0, 80) || '',
      dataset: JSON.stringify(Object.fromEntries(Object.entries(el.dataset).slice(0, 5))),
    });
  });

  // 2. All select elements
  document.querySelectorAll('select').forEach(el => {
    const label = el.labels?.[0]?.textContent?.trim()
      || el.closest('[class*="field"], fieldset, [class*="form-group"], [class*="row"]')?.querySelector('label, legend, [class*="label"]')?.textContent?.trim()
      || el.getAttribute('aria-label')
      || '';
    results.push({
      tag: 'SELECT',
      id: el.id,
      name: el.name,
      class: el.className.substring(0, 120),
      label: label.substring(0, 80),
      value: el.value,
      optionCount: el.options?.length || 0,
      required: el.required || el.getAttribute('aria-required') === 'true',
    });
  });

  // 3. All textarea elements
  document.querySelectorAll('textarea').forEach(el => {
    const label = el.labels?.[0]?.textContent?.trim()
      || el.closest('[class*="field"], fieldset, [class*="form-group"], [class*="row"]')?.querySelector('label, legend, [class*="label"]')?.textContent?.trim()
      || '';
    results.push({
      tag: 'TEXTAREA',
      id: el.id,
      name: el.name,
      class: el.className.substring(0, 120),
      label: label.substring(0, 80),
      required: el.required || el.getAttribute('aria-required') === 'true',
    });
  });

  // 4. Custom dropdowns (combobox role, listbox, etc.)
  document.querySelectorAll('[role="combobox"], [role="listbox"], [role="option"]').forEach(el => {
    results.push({
      tag: el.tagName,
      role: el.getAttribute('role'),
      id: el.id,
      class: el.className.substring(0, 120),
      ariaLabel: el.getAttribute('aria-label')?.substring(0, 80) || '',
      ariaExpanded: el.getAttribute('aria-expanded'),
      text: el.textContent?.trim().substring(0, 80),
    });
  });

  // 5. Buttons (for multi-entry add buttons)
  document.querySelectorAll('button').forEach(el => {
    const txt = el.textContent?.trim();
    if (txt && (txt.includes('Add') || txt.includes('ADD') || txt.includes('Upload') || txt.includes('Submit'))) {
      results.push({
        tag: 'BUTTON',
        text: txt.substring(0, 80),
        class: el.className.substring(0, 120),
        id: el.id,
        type: el.type,
      });
    }
  });

  // 6. File inputs
  document.querySelectorAll('input[type="file"]').forEach(el => {
    results.push({
      tag: 'FILE-INPUT',
      id: el.id,
      name: el.name,
      accept: el.accept,
      class: el.className.substring(0, 120),
      parent: el.parentElement?.className?.substring(0, 80) || '',
    });
  });

  console.log('=== ORACLE CLOUD FIELD SCAN ===');
  console.log(`Total: ${results.length} elements`);
  console.table(results);
  console.log(JSON.stringify(results, null, 2));
})();
```

---

### Script 2: Contact Information Section Deep Dive
```js
// ORACLE CLOUD — Contact Information section detailed inspection
(() => {
  console.log('=== CONTACT INFORMATION ===');

  // Find all text inputs in the contact section
  const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="file"])');
  console.log(`\nTotal visible inputs: ${allInputs.length}`);

  allInputs.forEach((el, i) => {
    // Walk up to find the label
    let label = '';
    // Method 1: native label association
    if (el.labels?.length) label = el.labels[0].textContent.trim();
    // Method 2: preceding sibling or parent label
    if (!label) {
      let p = el.parentElement;
      for (let j = 0; j < 5 && p; j++) {
        const lbl = p.querySelector('label, [class*="label"], legend');
        if (lbl && !lbl.contains(el)) {
          label = lbl.textContent.trim();
          break;
        }
        p = p.parentElement;
      }
    }
    // Method 3: aria-label
    if (!label) label = el.getAttribute('aria-label') || '';
    // Method 4: placeholder
    if (!label) label = el.placeholder || '';

    console.log(`[${i}] ${el.type.padEnd(10)} | id="${el.id}" | name="${el.name}" | label="${label.substring(0,60)}" | required=${el.required || el.getAttribute('aria-required')} | value="${el.value.substring(0,30)}" | class="${el.className.substring(0,60)}"`);
  });

  // Radio buttons (Title field)
  console.log('\n--- RADIO BUTTONS ---');
  const radios = document.querySelectorAll('input[type="radio"]');
  radios.forEach((r, i) => {
    const lbl = r.labels?.[0]?.textContent?.trim()
      || r.nextElementSibling?.textContent?.trim()
      || r.parentElement?.textContent?.trim()
      || r.value;
    console.log(`[${i}] name="${r.name}" value="${r.value}" label="${lbl}" checked=${r.checked} | class="${r.className.substring(0,60)}" | parent="${r.parentElement?.className?.substring(0,60)}"`);
  });

  // Checkboxes
  console.log('\n--- CHECKBOXES ---');
  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((cb, i) => {
    const lbl = cb.labels?.[0]?.textContent?.trim()
      || cb.nextElementSibling?.textContent?.trim()
      || cb.parentElement?.textContent?.trim()
      || '';
    console.log(`[${i}] name="${cb.name}" id="${cb.id}" label="${lbl.substring(0,60)}" checked=${cb.checked} | class="${cb.className.substring(0,60)}"`);
  });
})();
```

---

### Script 3: Address Section Deep Dive
```js
// ORACLE CLOUD — Address section inspection (dropdowns are key)
(() => {
  console.log('=== ADDRESS SECTION ===');

  // Oracle Cloud uses custom dropdowns, not native <select>
  // Look for dropdown triggers (buttons/inputs with combobox role, expandable elements)

  // 1. Native selects
  const selects = document.querySelectorAll('select');
  console.log(`\nNative <select> count: ${selects.length}`);
  selects.forEach((s, i) => {
    const label = s.labels?.[0]?.textContent?.trim() || s.getAttribute('aria-label') || s.name || '';
    console.log(`[${i}] name="${s.name}" id="${s.id}" label="${label}" options=${s.options?.length} value="${s.value}" | class="${s.className.substring(0,60)}"`);
  });

  // 2. Custom comboboxes / ARIA dropdowns
  console.log('\n--- CUSTOM DROPDOWNS (role=combobox/listbox) ---');
  document.querySelectorAll('[role="combobox"]').forEach((el, i) => {
    const label = el.getAttribute('aria-label')
      || el.closest('[class*="field"], [class*="form-group"]')?.querySelector('label, [class*="label"]')?.textContent?.trim()
      || '';
    console.log(`[${i}] tag=${el.tagName} id="${el.id}" label="${label.substring(0,60)}" expanded=${el.getAttribute('aria-expanded')} text="${el.textContent?.trim().substring(0,40)}" | class="${el.className.substring(0,80)}"`);
  });

  // 3. Any clickable dropdown triggers (buttons/divs that look like selects)
  console.log('\n--- DROPDOWN TRIGGERS (elements with aria-haspopup or expandable) ---');
  document.querySelectorAll('[aria-haspopup], [aria-expanded]').forEach((el, i) => {
    const label = el.getAttribute('aria-label')
      || el.closest('[class*="field"], [class*="form-group"]')?.querySelector('label, [class*="label"]')?.textContent?.trim()
      || '';
    const text = el.textContent?.trim().substring(0, 60);
    console.log(`[${i}] tag=${el.tagName} role="${el.getAttribute('role')}" haspopup="${el.getAttribute('aria-haspopup')}" expanded="${el.getAttribute('aria-expanded')}" label="${label.substring(0,60)}" text="${text}" | class="${el.className.substring(0,80)}"`);
  });

  // 4. Inputs with autocomplete/suggestion behavior (Address Line 1)
  console.log('\n--- INPUTS WITH AUTOCOMPLETE HINTS ---');
  document.querySelectorAll('input[autocomplete], input[aria-autocomplete], input[list]').forEach((el, i) => {
    const label = el.labels?.[0]?.textContent?.trim() || el.getAttribute('aria-label') || el.name || '';
    console.log(`[${i}] id="${el.id}" name="${el.name}" label="${label}" autocomplete="${el.autocomplete}" aria-autocomplete="${el.getAttribute('aria-autocomplete')}" list="${el.getAttribute('list')}" | class="${el.className.substring(0,60)}"`);
  });
})();
```

---

### Script 4: Sidebar Section Navigator
```js
// ORACLE CLOUD — Map sidebar navigation sections
(() => {
  console.log('=== SIDEBAR SECTIONS ===');

  // Look for nav links / section anchors in the sidebar
  const sidebar = document.querySelector('[class*="sidebar"], [class*="nav"], [role="navigation"], aside')
    || document.querySelector('[class*="step"], [class*="progress"]');

  if (sidebar) {
    console.log('Sidebar found:', sidebar.tagName, sidebar.className.substring(0, 80));
    const links = sidebar.querySelectorAll('a, button, [role="tab"], [role="link"], li');
    links.forEach((l, i) => {
      console.log(`[${i}] tag=${l.tagName} text="${l.textContent.trim().substring(0,60)}" href="${l.href || ''}" class="${l.className.substring(0,60)}" aria-current="${l.getAttribute('aria-current') || ''}"`);
    });
  } else {
    console.log('No sidebar container found. Trying broader search...');
    // Look for the section list pattern from screenshots (all caps section names)
    const allLinks = document.querySelectorAll('a');
    const sectionLinks = [...allLinks].filter(a => {
      const t = a.textContent.trim();
      return t === t.toUpperCase() && t.length > 3 && t.length < 50;
    });
    console.log(`Found ${sectionLinks.length} potential section links:`);
    sectionLinks.forEach((l, i) => {
      console.log(`[${i}] "${l.textContent.trim()}" href="${l.href}" class="${l.className.substring(0,60)}"`);
    });
  }

  // Also check for section headings in the main content
  console.log('\n--- SECTION HEADINGS ---');
  document.querySelectorAll('h1, h2, h3, h4, [class*="section-title"], [class*="heading"]').forEach((h, i) => {
    const txt = h.textContent.trim();
    if (txt) console.log(`[${i}] ${h.tagName} "${txt.substring(0,80)}" class="${h.className.substring(0,60)}"`);
  });
})();
```

---

### Script 5: Framework Detection (React/Angular/jQuery/VDOM)
```js
// ORACLE CLOUD — Detect UI framework and key DOM patterns
(() => {
  console.log('=== FRAMEWORK DETECTION ===');

  // React
  const reactRoot = document.querySelector('[data-reactroot], #root, #__next');
  const hasFiber = !!document.querySelector('*').__reactFiber$;
  // Check any random element for fiber keys
  const testEl = document.querySelector('input') || document.querySelector('button');
  const fiberKey = testEl ? Object.keys(testEl).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) : null;
  console.log('React:', { reactRoot: !!reactRoot, hasFiber, fiberKey: fiberKey?.substring(0, 30) });

  // Angular
  const ngRoot = document.querySelector('[ng-app], [ng-controller], [_nghost], [ng-version]');
  const ngVersion = document.querySelector('[ng-version]')?.getAttribute('ng-version');
  console.log('Angular:', { found: !!ngRoot, version: ngVersion });

  // Vue
  const vueRoot = document.querySelector('[data-v-app], [__vue_app__]');
  console.log('Vue:', { found: !!vueRoot });

  // jQuery
  console.log('jQuery:', { found: typeof jQuery !== 'undefined', version: typeof jQuery !== 'undefined' ? jQuery.fn?.jquery : 'N/A' });

  // Oracle JET (Oracle's own JS framework)
  console.log('Oracle JET:', { found: typeof oj !== 'undefined' || !!document.querySelector('[class*="oj-"], oj-input-text, oj-select-single') });

  // Knockout.js (often used with Oracle JET)
  console.log('Knockout:', { found: typeof ko !== 'undefined' });

  // Oracle-specific custom elements
  console.log('\n--- ORACLE CUSTOM ELEMENTS ---');
  const customEls = new Set();
  document.querySelectorAll('*').forEach(el => {
    if (el.tagName.includes('-')) customEls.add(el.tagName.toLowerCase());
  });
  console.log('Custom elements found:', [...customEls].sort());

  // CSS framework clues
  console.log('\n--- CSS PATTERNS ---');
  const sampleClasses = new Set();
  document.querySelectorAll('input, select, button, [role="combobox"]').forEach(el => {
    el.className.split(/\s+/).forEach(c => { if (c) sampleClasses.add(c); });
  });
  const classArr = [...sampleClasses].sort();
  console.log(`Unique CSS classes on form elements (${classArr.length}):`, classArr.slice(0, 50));
})();
```

---

## Test URLs

*(Add Oracle Cloud job application URLs here as you find them)*

---

## Key Observations from Screenshots

1. **Title is radio buttons, NOT a dropdown** — options vary per portal (Doctor/Miss/Mr/Mrs/Ms vs B.Sc./M.S.C./Miss/Mr/Mrs/Ms)
2. **ALL address location fields are dropdowns** — City, State, County, Zip Code are NOT text inputs
3. **Address Line 1 has autocomplete suggestions** — hint text: "Enter your street name and other address details to see suggestions"
4. **Country dropdown has X clear button** — probably a searchable select
5. **Work/Education uses ADD buttons** — click to spawn sub-forms (like Workday multi-entry)
6. **File uploads use cloud icon drag-and-drop** — not standard file inputs
7. **Required fields marked with red asterisk (*)** — consistent pattern
8. **Two portal variants seen** — different sidebar section orders, slightly different field sets
