# Lever ATS — DOM Rules & Field Reference

> Based on scan of jobs.lever.co (2026-03-16), multiple portals (LUUM, AppZen, Brooks)
> Framework: jQuery 3.6.1 — NO React, NO custom widgets

---

## 1. Detection

| Signal | Selector / Pattern |
|---|---|
| URL | `jobs.lever.co` (hostname) |
| Form root | `#application-form` |
| Fallback | `form[action*="lever.co"]` |
| Lever-specific | `input[name="origin"]` (hidden), `input[name="urls[LinkedIn]"]` |

---

## 2. Page Structure

Single-page form. All sections visible at once (no tabs/steps).

```
form#application-form  (method=POST, enctype=multipart/form-data)
  ├── section.page-centered.application-form  — "Submit your application"
  │     └── ul > li.application-question  (per-field)
  ├── section.page-centered.application-form  — "Links"
  ├── section[data-qa="additional-cards"]     — "HR Questions" / custom cards
  ├── section.page-centered.application-form  — "Additional information"
  ├── section#countrySurvey                   — "Demographic Survey" (EEO)
  ├── div.eeo-section                         — "U.S. Equal Employment Opportunity"
  └── section.page-centered.application-form  — Consent checkboxes
```

Each field lives inside:
```html
<li class="application-question">
  <label>
    <div class="application-label">Field Label <span class="required">✱</span></div>
    <div class="application-field">
      <input type="text" name="fieldName" />
    </div>
  </label>
</li>
```

---

## 3. Field Types

### 3a. Text Inputs (name, email, phone, org, location)
```html
<div class="application-field">
  <input type="text" data-qa="name-input" name="name" required />
</div>
```
- Fill: standard `value` + `input`/`change` events
- `data-qa` attributes: `name-input`, `email-input`, `phone-input`, `org-input`, `location-input`

### 3b. URL Inputs
```html
<div class="application-field">
  <input type="text" name="urls[LinkedIn]" required />
</div>
```
- Naming pattern: `urls[LinkedIn]`, `urls[GitHub]`, `urls[Twitter]`, `urls[Portfolio]`, `urls[Other]`, `urls[Github]`
- Note: some portals use `urls[Github]` (lowercase 'h'), others `urls[GitHub]`
- **Pre-fill by name match**, not LLM — deterministic mapping to profile URLs

### 3c. Location Autocomplete
```html
<div class="application-field">
  <input class="location-input" id="location-input" name="location" maxlength="100" />
  <input id="selected-location" type="hidden" name="selectedLocation" value="" />
  <div class="dropdown-container" style="display:none">
    <div class="dropdown-results cursor-pointer"></div>
    <div class="dropdown-no-results" style="display:none">No location found...</div>
    <div class="dropdown-loading-results" style="display:none">
      <svg class="icon-loading-spinner" />
      <span>Loading</span>
    </div>
  </div>
</div>
```
- **CRITICAL**: Lever's jQuery + `debounce.min.js` only responds to **char-by-char KeyboardEvent + InputEvent**
- `dispatchEvent(new Event("input"))` does NOT trigger the search
- `document.execCommand("insertText")` does NOT trigger the search
- `$(input).val("x").trigger("input")` does NOT trigger the search (ISOLATED world, no jQuery access)
- **ONLY char-by-char typing works**: `keydown` → `value += ch` → `InputEvent("input")` → `keyup` per character
- After results appear: `ArrowDown` to highlight → `Enter` to select
- Selected value written to hidden `#selected-location` as JSON: `{"name":"Buffalo, NY, USA","id":"..."}`
- **Use city name only** (split on comma) — "Buffalo, NY" → type "Buffalo"

### 3d. Custom Question Cards (radios, checkboxes, textareas)
```html
<!-- Radio: yes/no question -->
<div class="application-field full-width required-field">
  <ul data-qa="multiple-choice">
    <li><label>
      <input type="radio" name="cards[UUID][field0]" value="Yes" required />
      <span class="application-answer-alternative">Yes</span>
    </label></li>
    <li><label>
      <input type="radio" name="cards[UUID][field0]" value="No" required />
      <span class="application-answer-alternative">No</span>
    </label></li>
  </ul>
</div>

<!-- Checkbox: acknowledgment -->
<div class="application-field full-width required-field">
  <ul data-qa="checkboxes">
    <li><label>
      <input type="checkbox" name="cards[UUID][field9]"
             value="By checking this box, I acknowledge..." required />
      <span class="application-answer-alternative">By checking this box...</span>
    </label></li>
  </ul>
</div>

<!-- Textarea: open-ended -->
<div class="application-field">
  <textarea class="card-field-input" name="cards[UUID][fieldN]"></textarea>
</div>
```
- **Label issue**: Card textareas have NO `<label>` — question text is in ancestor `li` or sibling div
- Walk up DOM: `el.closest("li")` → find `.application-question-label` or `.card-field-label` or `h5` or `p`
- Acknowledgment checkboxes: auto-check in `afterFill` (match `value*="acknowledge"` or `value*="I have read"`)
- Multiple cards can exist — each has a different UUID

### 3e. EEO Selects (Lever-native, NOT custom cards)
```html
<div class="application-dropdown">
  <select name="eeo[gender]">
    <option value="">Select ...</option>
    <option value="Male">Male</option>
    <option value="Female">Female</option>
    <option value="Decline to self-identify">Decline to self-identify</option>
  </select>
</div>
```
- Names: `eeo[gender]`, `eeo[race]`, `eeo[veteran]`
- **SKIP these** — filter in augmentScan by `name.startsWith("eeo[")`

### 3f. Survey Demographics (radio/checkbox groups)
```html
<div class="application-field full-width">
  <ul data-qa="multiple-choice">
    <li><label><input type="radio" name="surveysResponses[UUID][responses][field0]" value="21-29" />
      <span class="application-answer-alternative">21-29</span></label></li>
    ...
  </ul>
</div>
```
- Names: `surveysResponses[UUID][responses][fieldN]`
- **SKIP these** — filter in augmentScan by `name.startsWith("surveysResponses[")`
- Contains: age ranges, race/ethnicity checkboxes, veteran status radios, gender radios

### 3g. Consent Checkboxes
```html
<input type="checkbox" name="consent[store]" required />
<input type="checkbox" name="consent[marketing]" />
```
- `consent[store]` = required (data retention) — **auto-check in afterFill**
- `consent[marketing]` = optional (future contact) — **auto-check in afterFill**
- Filter from scan with `name.startsWith("consent[")`

### 3h. Resume File Input
```html
<a class="postings-btn template-btn-utility visible-resume-upload">
  <input class="application-file-input invisible-resume-upload"
         id="resume-upload-input" name="resume" type="file" />
  <span class="filename">RESUME.pdf</span>
  <span class="default-label">ATTACH RESUME/CV</span>
</a>
```
- ID: `#resume-upload-input`
- After upload, `<span class="filename">` shows file name
- Success indicator: `span.resume-upload-success` with `display:inline`
- Handled by content.js resume pipeline, NOT adapter

### 3i. hCaptcha
- iframes from `newassets.hcaptcha.com`
- Hidden submit button: `#hcaptchaSubmitBtn`
- **Cannot fill** — skip entirely

---

## 4. augmentScan Filter Rules

Remove from scan (don't send to LLM):
| Pattern | Reason |
|---|---|
| `name.startsWith("surveysResponses[")` | Demographic survey (EEO) |
| `name.startsWith("eeo[")` | EEO selects (gender/race/veteran) |
| `name.startsWith("consent[")` | Consent checkboxes (handled in afterFill) |
| `name === "h-captcha-response"` | hCaptcha |
| `el.type === "file"` | Resume upload |
| `el.type === "hidden"` | Hidden tracking inputs |

Pre-fill without LLM:
| Pattern | Profile key |
|---|---|
| `name === "urls[LinkedIn]"` | `profile.linkedin` |
| `name === "urls[GitHub]"` or `"urls[Github]"` | `profile.github` |
| `name === "urls[Portfolio]"` | `profile.portfolio` |
| `name === "urls[Twitter]"` | `profile.twitter` |
| `name === "urls[Other]"` | `profile.website` |

---

## 5. afterFill Actions

1. **Location autocomplete** — if `#selected-location` is empty, fill via char-by-char typing + ArrowDown/Enter
2. **Consent checkboxes** — auto-check `consent[store]` and `consent[marketing]`
3. **Acknowledgment checkboxes** — auto-check any `input[type="checkbox"][value*="acknowledge"]`
4. **EEO selects** — `eeo[gender]`, `eeo[race]`, `eeo[veteran]` → set to "Decline to self-identify"
5. **Survey demographics** — for any radio group or checkbox with a "Decline" option, select it; skip groups without a decline option (age ranges, etc.)

---

## 6. Known Variations Across Portals

| Feature | LUUM | AppZen | Brooks |
|---|---|---|---|
| Location required | Yes | No | No |
| Custom cards | 1 (right to work) | 2 (HR questions + AI proficiency) | 1 (general app questions) |
| EEO selects | No | Yes (`eeo[gender/race/veteran]`) | No |
| Survey demographics | Yes (radios/checkboxes) | Yes (radios/checkboxes) | Yes |
| Consent checkboxes | `store` + `marketing` | `marketing` only | None |
| URL fields | LinkedIn, Twitter, GitHub, Portfolio, Other | LinkedIn, Github | LinkedIn |
| Acknowledgment checkbox | No | Yes (`cards[...][field9]`) | No |
| Apply with LinkedIn button | No | Yes (`.awli-button`) | No |
| Privacy cookie banner | No | Yes (`.cc-btn.cc-dismiss`) | No |

---

## 7. Submit Button

```html
<button type="button" id="btn-submit" class="postings-btn template-btn-submit hex-color">
  Submit application
</button>
```
- **Do NOT auto-submit** — user must click manually
