# Ashby ATS — DOM Rules & Field Reference

> Based on scan of 3 portals (2026-03-18) + 3 manual framework analyses
> Framework: React 18+ (createRoot, Vite bundle, CSS Modules)
> Portals scanned: Steadily, Tabz, Tabs (+ earlier manual: Netic, Antithesis, Jack & Jill)

---

## 1. Detection

```javascript
// PRIMARY: hostname — 100% reliable across all 6 tested portals
/jobs\.ashbyhq\.com$/i.test(location.hostname)

// SECONDARY: embedded Ashby forms on custom domains
document.querySelector('.ashby-application-form, [class*="ashby-application"]')
document.querySelector('[data-testid="application-form"]')

// TERTIARY: "Powered by Ashby" footer
document.querySelector('footer')?.textContent?.includes('Ashby')
```

## 2. Page Structure

**Single-page application** — NOT multi-step. All fields render on one page.

- **Tabs**: "Overview" | "Application" — must be on Application tab
  - Active tab: `._active_oj0x8_57` class
  - Tab container: `._tabs_oj0x8_30`
- **Form root**: `div#form[role="tabpanel"]` (no `<form>` tag exists)
- **Section container**: `.ashby-application-form-section-container` / `._section_oj0x8_87`
- **Field wrapper**: `.ashby-application-form-field-entry` / `._fieldEntry_17tft_29`
- **Submit button**: `.ashby-application-form-submit-button` / `._submitButton_oj0x8_408`
- **Autofill pane**: `.ashby-application-form-autofill-pane` — Ashby's OWN resume autofill (ignore)

### URL Structure
```
https://jobs.ashbyhq.com/{company}/{job-uuid}                 → overview
https://jobs.ashbyhq.com/{company}/{job-uuid}/application     → application form
```
Navigating to `/application` path or clicking Application tab shows the form.

## 3. Field Registry

### Standard Fields (consistent `_systemfield_` prefix)

| Field | ID / Name | Type | Required | Portals | Placeholder |
|-------|-----------|------|----------|---------|-------------|
| Name | `_systemfield_name` | text | Always (3/3) | ALL | "Type here..." |
| Email | `_systemfield_email` | email | Always (3/3) | ALL | "hello@example.com..." |
| Phone | `_systemfield_phone` | tel | Sometimes (1/3) | Steadily | "1-415-555-1234..." |
| Resume | file input in `.ashby-application-form-field-entry` | file | Always (3/3) | ALL | — |

### Custom Fields (company-specific, variable names)

| Field | Type | Widget | Required | Portals | Example Labels |
|-------|------|--------|----------|---------|----------------|
| Compensation | text | `<input>` | 1/3 | Tabz | "What are your compensation expectations?" |
| LinkedIn URL | text | `<input>` | 1/3 | Tabs | "Linkedin Profile URL" |
| Referral details | textarea | `<textarea>` | 0/3 | Steadily | "If yes, please give the name..." |
| Years of experience | combobox | `[role="combobox"]` | 1/3 | Tabs | "How many years of experience..." |
| Yes/No questions | button-group | `<button>` pair | varies | ALL | See section below |

### Yes/No Button Groups (NOT radio inputs!)

Ashby uses `<button>` elements for Yes/No questions — NOT `<input type="radio">`.

**DOM pattern:**
```html
<div class="_container_nh65k_29 _fieldEntry_17tft_29">
  <label class="_heading_101oc_53 _required_101oc_92">
    Are you able to commute to the NYC office?*
  </label>
  <div class="_yesNoContainer_...">
    <button class="_container_pjyt6_1 _option_y2cw4_33" type="submit">Yes</button>
    <button class="_container_pjyt6_1 _option_y2cw4_33" type="submit">No</button>
  </div>
</div>
```

**Selection state**: Selected button gets `_selected_y2cw4_*` class (CSS Module hash).

**Common Yes/No questions seen:**
| Question Pattern | Default Answer | Portals |
|-----------------|----------------|---------|
| "Were you referred to {company}?" | No | Steadily |
| "Are you able to be physically in office?" | Yes | Steadily |
| "How comfortable working 50-60 hrs/week?" | (radio group, not Yes/No) | Steadily |
| "Are you able to commute to the {city} office?" | Yes | Tabz, Tabs |
| "Do you currently have your CPA?" | (skip — job-specific) | Tabz |
| "Will you require sponsorship for visa?" | No | Tabs |
| "Is your US work authorization under OPT/F1/H1-B?" | Yes | Steadily |

### Autofill Resume Pane (SKIP — not our resume upload)

Ashby has its own "Autofill from resume" feature:
- Container: `.ashby-application-form-autofill-pane` / `._autofillPane_oj0x8_445`
- Hidden file input inside `._root_xd2v0_1.ashby-application-form-autofill-input-root`
- This is Ashby's native feature — our adapter should IGNORE this input
- Our resume upload targets the `file` input INSIDE `.ashby-application-form-field-entry` under the "Resume*" label

## 4. Option Registry

### Comfort Level Radio Group (Steadily only)
| Value | Seen On |
|-------|---------|
| Very Comfortable | Steadily |
| Comfortable | Steadily |
| Somewhat Uncomfortable | Steadily |
| Very Uncomfortable | Steadily |

**Note**: This is a radio-style group but rendered as `<input type="radio">` with label text, NOT button-group. It's inside a fieldset with legend text.

### Combobox Options (Tabs — years of experience)
- Widget: `[role="combobox"]` with placeholder "Start typing..."
- Options not captured in scan — likely numeric values or range options
- Fill strategy: click to open → type value → select from dropdown

## 5. Required vs Optional Classification

| Priority | Fields |
|----------|--------|
| **MUST FILL** (100%) | Name, Email, Resume |
| **SHOULD FILL** (33-66%) | Phone, LinkedIn URL, Yes/No questions (varies by company) |
| **OPTIONAL** (<33%) | Compensation, Referral details, Comfort level radio |
| **SKIP** | Autofill resume pane file input, reCAPTCHA iframe |

## 6. Custom Widget Patterns

### Text Inputs
```html
<input placeholder="Type here..." name="_systemfield_name" required
       id="_systemfield_name" type="text"
       class="_input_1wkz4_28 _input_17tft_33" value="">
```
- Selector by ID: `#_systemfield_name`, `#_systemfield_email`, `#_systemfield_phone`
- CSS class `_input_1wkz4_28` is stable (shared across all portals)
- Fill: set `.value` + `_valueTracker` reset + input/change events

### File Upload (Resume)
```html
<div class="_fieldEntry_17tft_29 ashby-application-form-field-entry">
  <label class="_heading_101oc_53 _required_101oc_92">Resume</label>
  <div class="_container_1fd3o_29">
    <button class="_button_8wvgw_29 _secondary_8wvgw_114">Upload File</button>
    <input type="file" accept=".pdf,.doc,.docx,.odt,.rtf" style="...hidden...">
  </div>
</div>
```
- File input is visually hidden (clip: rect) behind styled button
- Upload via DataTransfer API on the hidden `<input type="file">`
- Accepted types: pdf, doc, docx, odt, rtf

### Combobox (Search Select)
```html
<div role="combobox" aria-expanded="false" class="_container_nh65k_29">
  <input placeholder="Start typing..." class="_input_1wkz4_28">
</div>
```
- Fill: focus → type value → wait for dropdown → click option
- aria-expanded toggles on focus

### Yes/No Button Groups
- NOT form inputs — `<button type="submit">`
- Click the correct button directly
- Selected state: check for `_selected_` in classList or `aria-pressed="true"`

## 7. Known Quirks

1. **No `<form>` tag** — Ashby renders everything in `div#form[role="tabpanel"]`
2. **CSS Module hashes change per build** — never use hashed classes (`_section_oj0x8_87`) as selectors. Use stable `ashby-*` class names.
3. **React fiber** — available on `#root` children but key hash changes per build. Discover at runtime via `Object.keys(el).find(k => k.startsWith('__reactFiber$'))`
4. **Autofill pane file input** — 1×1px hidden input at top of form. Filter it out by checking parent class `ashby-application-form-autofill-input-root`
5. **reCAPTCHA** — invisible reCAPTCHA (same key `6LeFb_YU...` across all portals), fires on submit
6. **Submit button type="submit"** — Yes/No buttons ALSO have `type="submit"`. Clicking them does NOT submit the form (Ashby handles via React onClick). But automated clicks must NOT accidentally submit.
7. **Tab navigation** — if form isn't visible, need to click the "Application" tab first. Check for `._active_oj0x8_57` on the Application tab.

## 8. Out-of-Scope Fields

| Field | Reason |
|-------|--------|
| Autofill resume pane input | Ashby's own feature, not our upload |
| reCAPTCHA iframe | Handled by Ashby on submit |
| "How comfortable are you working 50-60 hours?" | Radio group — too job-specific |
| "Do you currently have your CPA?" | Job-specific qualification check |

## 9. LLM Prompt Hints

### Label → Profile Field Mapping
```
Name → full_name (or first_name + " " + last_name)
Email → email
Phone → phone
Resume → (file upload, not LLM)
LinkedIn Profile URL → linkedin
Compensation expectations → desired_salary or "Open to discussion"
```

### Yes/No Question Defaults
```
"referred" → "No"
"commute to office" / "physically in office" / "able to be onsite" → "Yes"
"work authorization" / "OPT" / "H1-B" / "visa" → depends on profile.work_authorization
"require sponsorship" → "No" (default) or profile.needs_sponsorship
```

### Date Format
Not seen in 3 portals. If dates appear, expect MM/DD/YYYY or YYYY-MM-DD.

### URL Fields
- LinkedIn: `linkedin` profile field
- GitHub: `github` profile field
- Portfolio: `portfolio` or `website` profile field
- Pattern: if label contains "linkedin" → linkedin, if "github" → github

### Combobox Fill Strategy
1. Click the combobox to open dropdown
2. Type the value character by character
3. Wait for filtered options to appear
4. Click the matching option
5. If no match, leave typed value (some comboboxes accept free text)
