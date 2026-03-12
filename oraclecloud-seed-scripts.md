# Oracle Cloud HCM — Seed Test Scripts & Research Report

> **Date**: March 9, 2026
> **Researcher**: Mohammad Aqeel (JAOS Project)
> **Portal tested**: fa-*.ocs.oraclecloud.com (Staff Engineer - Client Services)
> **Framework**: Knockout.js + Oracle JET (NOT React)
> **Status**: ALL SECTIONS VERIFIED

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Key Findings & Fixes](#key-findings--fixes)
3. [Section 1: Contact Information](#section-1-contact-information)
4. [Section 2: Address](#section-2-address)
5. [Section 3: Work Experience](#section-3-work-experience)
6. [Section 4: Education](#section-4-education)
7. [Section 5: Supporting Documents (Resume & Cover Letter)](#section-5-supporting-documents-resume--cover-letter)
8. [Section 6: Disability Information](#section-6-disability-information)
9. [Section 7: Diversity Information (Ethnicity + Gender)](#section-7-diversity-information-ethnicity--gender)
10. [Section 8: Veteran Information](#section-8-veteran-information)
11. [Section 9: E-Signature](#section-9-e-signature)
12. [Section 10: Full Page Autofill (All Sections Combined)](#section-10-full-page-autofill-all-sections-combined)
13. [Appendix: DOM Inspection Scripts](#appendix-dom-inspection-scripts)

---

## Executive Summary

Oracle Cloud HCM Recruiting uses **Knockout.js + Oracle JET** — a completely different tech stack from React-based ATS platforms (Greenhouse, Lever). This means:

- **No fiber bridge needed** — Knockout uses `data-bind` observables
- **Two input types**: `input-row__control` (plain text) and `cx-select-input` (custom searchable combobox)
- **cx-select-input** is used for 9+ fields — requires type-to-search → click from dropdown grid
- **Oracle Maps API** powers Address Line 1 autocomplete — cascades to fill City, State, ZIP, County
- **All seed scripts verified** via DevTools console on a live Oracle Cloud portal

### Two Fill Strategies

| Input Class | Strategy | Events |
|-------------|----------|--------|
| `input-row__control` | Set `.value` + dispatch `input`/`change` + `.blur()` | Knockout picks up value |
| `cx-select-input` | Focus → type search text → wait for listbox → click matching gridcell | Knockout observables update on selection |

---

## Key Findings & Fixes

These are bugs/quirks discovered during live testing and how we fixed them:

### Fix 1: Address Line 1 — Oracle Maps Requires Keyboard Events
- **Problem**: Setting `.value` + dispatching `input` event did NOT trigger Oracle Maps autocomplete suggestions
- **Root Cause**: Oracle Maps API listens to `keydown`/`keypress`/`keyup` keyboard events, not just `input` events
- **Fix**: Dispatch full keyboard event sequence per character: `keydown` → `keypress` → set value → `input` → `keyup`
- **Impact**: Without this fix, address autocomplete never fires and City/State/ZIP/County cascade fails

### Fix 2: Address Cascade Trap — Clearing One Clears All
- **Problem**: After Oracle Maps fills City/State/ZIP/County, clearing ANY ONE of them clears ALL FOUR
- **Root Cause**: Oracle internally links these 4 fields as a dependent group
- **Fix**: NEVER individually re-fill address fields after a successful cascade. If cascade fails, fill all individually from scratch
- **Impact**: Critical adapter rule — touching any cascaded field nukes the others

### Fix 3: Education State — Uses 2-Letter Codes, NOT Full Names
- **Problem**: Searching "Texas" in the State dropdown returned "No results found"
- **Root Cause**: Oracle Cloud State options are 2-letter codes (TX, CA, NY...), not full names
- **Fix**: Search "TX" instead of "Texas". Adapter needs a US_STATES name→code lookup table
- **Impact**: Without the lookup, every state field fill fails

### Fix 4: Education City — Country Cascade Wipes Values
- **Problem**: After filling Education Country, City field was empty
- **Root Cause**: Selecting a Country dynamically adds the State field, which re-renders the form and can wipe previously filled values
- **Fix**: Fill order must be: Country → wait for State field to appear → fill State → then fill City
- **Impact**: Wrong fill order = lost data

### Fix 5: Gender — 5 Options, Not 2
- **Problem**: Initially assumed only Male/Female available
- **Actual Options**: Female, Male, Nonbinary, Prefer not to Answer, X-Gender (all 5 on same portal)
- **Fix**: Default to "Prefer not to Answer" (search "Prefer") as safe autofill default
- **Impact**: Adapter must store all 5 options as Oracle Cloud-specific values

---

## Section 1: Contact Information

**Container**: `<name-form>` custom element

### Fields

| Field | Selector | Type | Required |
|-------|----------|------|----------|
| Last Name | `input[name="lastName"]` | text | YES |
| First Name | `input[name="firstName"]` | text | no |
| Title | `ul.cx-select-pills-container button` | pill buttons | no |
| Middle Name | `input[name="middleNames"]` | text | no |
| Preferred Name | `input[name="knownAs"]` | text | no |
| Email | `input[name="email"]` | email | no (prefilled) |
| Phone Country Code | `input.cx-select-input[name="phoneNumber"]` | cx-select | no |
| Phone Number | `input.phone-row__input[type="tel"]` | tel | YES |

### Seed Script: Contact Information

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] Section 1: Contact Information
// ═══════════════════════════════════════════════════════════
(() => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Helper: fill plain text input
  function fillText(selector, value) {
    const el = document.querySelector(selector);
    if (!el) { console.warn('NOT FOUND:', selector); return false; }
    if (el.value.trim() && selector.includes('email')) {
      console.log('SKIP (prefilled):', selector, '=', el.value);
      return true;
    }
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    console.log('FILLED:', selector, '=', value);
    return true;
  }

  // Helper: click pill button by text
  function clickPill(containerLabel, pillText) {
    const pills = document.querySelectorAll(
      `ul.cx-select-pills-container[aria-label="${containerLabel}"] button.cx-select-pill-section`
    );
    for (const btn of pills) {
      if (btn.querySelector('.cx-select-pill-name')?.textContent.trim() === pillText) {
        btn.click();
        console.log('PILL SELECTED:', pillText, 'aria-pressed:', btn.getAttribute('aria-pressed'));
        return true;
      }
    }
    console.warn('PILL NOT FOUND:', pillText);
    return false;
  }

  // Fill contact fields
  fillText('input[name="lastName"]', 'Aqeel');
  fillText('input[name="firstName"]', 'Mohammad');
  clickPill('Title', 'Mr.');
  fillText('input[name="middleNames"]', '');
  // fillText('input[name="knownAs"]', 'Aqeel');  // Uncomment if "Preferred Name" exists
  fillText('input[name="email"]', 'mohammadaqeel@example.com');  // Skips if prefilled
  fillText('input.phone-row__input[type="tel"]', '7169364737');

  console.log('✅ Contact Information filled');
})();
```

**Status**: VERIFIED — All fields fill correctly. Phone auto-formats to `(716) 936-4737`.

---

## Section 2: Address

**Container**: `<address-form-v2>` custom element

### Fields

| Field | Selector | Type | Required |
|-------|----------|------|----------|
| Country | `input.cx-select-input[name="country"]` | cx-select | YES |
| Address Line 1 | `input.cx-select-input[name="addressLine1"]` | cx-select (Oracle Maps) | YES |
| Address Line 2 | `input[name="addressLine2"]` | text | no |
| City | `input.cx-select-input[name="city"]` | cx-select | YES (cascaded) |
| State | `input.cx-select-input[name="region2"]` | cx-select | YES (cascaded) |
| ZIP Code | `input.cx-select-input[name="postalCode"]` | cx-select | YES (cascaded) |
| County | `input.cx-select-input[name="region1"]` | cx-select | YES (cascaded) |

### Seed Script: Address (with Oracle Maps Cascade + Keyboard Events)

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] Section 2: Address (Oracle Maps Autocomplete)
// CRITICAL: Uses keyboard events for Oracle Maps API trigger
// ═══════════════════════════════════════════════════════════
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Helper: fill cx-select-input with search + click
  async function fillCxSelect(name, searchText, pickFirst = true) {
    const input = document.querySelector(`input.cx-select-input[name="${name}"]`);
    if (!input) { console.warn('NOT FOUND:', name); return false; }

    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(300);

    for (const char of searchText) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
    }
    await delay(1000);

    const listbox = document.getElementById(input.id + '-listbox');
    if (!listbox) { console.warn('LISTBOX NOT FOUND for:', name); return false; }
    const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
    console.log(`${name}: ${items.length} options found`);

    if (items.length > 0 && pickFirst) {
      const text = items[0].querySelector('span.cx-select-list-item--content')?.textContent?.trim()
                || items[0].textContent.trim();
      console.log(`${name}: clicking "${text}"`);
      items[0].click();
      return true;
    }
    return false;
  }

  // Helper: type with FULL keyboard events (required for Oracle Maps)
  async function typeWithKeyboard(input, text) {
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(200);

    for (const char of text) {
      const keyOpts = { key: char, code: `Key${char.toUpperCase()}`, bubbles: true };
      input.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
      input.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
      await delay(80);
    }
  }

  // Step 1: Country (usually pre-set to "United States")
  const countryInput = document.querySelector('input.cx-select-input[name="country"]');
  if (countryInput && !countryInput.value.includes('United States')) {
    await fillCxSelect('country', 'United States');
    await delay(500);
  } else {
    console.log('Country already set:', countryInput?.value);
  }

  // Step 2: Address Line 1 (Oracle Maps autocomplete — needs keyboard events!)
  const addr1 = document.querySelector('input.cx-select-input[name="addressLine1"]');
  if (addr1) {
    await typeWithKeyboard(addr1, '1600 Pennsylvania Ave NW');
    console.log('Waiting for Oracle Maps suggestions...');
    await delay(2000);

    // Click first suggestion — this cascades to fill City, State, ZIP, County
    const listbox = document.getElementById(addr1.id + '-listbox');
    if (listbox) {
      const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
      if (items.length > 0) {
        const text = items[0].querySelector('span.cx-select-list-item--content')?.textContent?.trim();
        console.log('Oracle Maps suggestion:', text);
        items[0].click();
        console.log('✅ Address cascade triggered — City, State, ZIP, County should auto-fill');
        await delay(1500); // Wait for cascade
      } else {
        console.warn('No Oracle Maps suggestions — falling back to individual field fill');
      }
    }
  }

  // Step 3: Address Line 2 (plain text, optional)
  const addr2 = document.querySelector('input[name="addressLine2"]');
  if (addr2) {
    addr2.focus();
    addr2.value = 'Suite 100';
    addr2.dispatchEvent(new Event('input', { bubbles: true }));
    addr2.dispatchEvent(new Event('change', { bubbles: true }));
    addr2.blur();
    console.log('Address Line 2 filled');
  }

  // Verify cascade results
  await delay(500);
  const city = document.querySelector('input.cx-select-input[name="city"]');
  const state = document.querySelector('input.cx-select-input[name="region2"]');
  const zip = document.querySelector('input.cx-select-input[name="postalCode"]');
  const county = document.querySelector('input.cx-select-input[name="region1"]');
  console.log('CASCADE RESULTS:');
  console.log('  City:', city?.value || 'EMPTY');
  console.log('  State:', state?.value || 'EMPTY');
  console.log('  ZIP:', zip?.value || 'EMPTY');
  console.log('  County:', county?.value || 'EMPTY');

  console.log('✅ Address section filled');
})();
```

**Status**: VERIFIED — Oracle Maps cascade fills all 5 fields from a single address selection.

**CRITICAL RULES**:
1. Must use `keydown`/`keypress`/`keyup` keyboard events — plain `input` event does NOT trigger Oracle Maps
2. After cascade, NEVER re-fill individual fields — clearing one clears all four

---

## Section 3: Work Experience

**Container**: `<timeline-form-inline>` (inside `<beautiful-timeline>`)
**Trigger**: Click `button#timeline-add-experience-button`

### Fields

| Field | Selector | Type | Required |
|-------|----------|------|----------|
| Employer Name | `input[name="employerName"]` | text | YES |
| Job Title | `input[name="jobTitle"]` | text | no |
| Start Date Month | `input[id^="month-startDate"]` | cx-select | no |
| Start Date Year | `input[id^="year-startDate"]` | cx-select | no |
| End Date Month | `input[id^="month-endDate"]` | cx-select | no |
| End Date Year | `input[id^="year-endDate"]` | cx-select | no |
| Employer Country | `input.cx-select-input[name="countryCode"]` | cx-select | no |
| Employer State | (appears after Country cascade) | cx-select | no |
| Employer City | `input[name="employerCity"]` | text | no |
| Responsibilities | `textarea[name="responsibilities"]` | textarea | no |

### Seed Script: Work Experience

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] Section 3: Work Experience
// NOTE: Click "ADD EXPERIENCE" button first, then run this
// ═══════════════════════════════════════════════════════════
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Helper: fill plain text input
  function fillText(selector, value) {
    const el = document.querySelector(selector);
    if (!el) { console.warn('NOT FOUND:', selector); return; }
    el.focus(); el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    console.log('FILLED:', selector);
  }

  // Helper: fill cx-select by ID prefix
  async function fillCxSelectById(idPrefix, searchText) {
    const input = document.querySelector(`input.cx-select-input[id^="${idPrefix}"]`);
    if (!input) { console.warn('NOT FOUND: id^=' + idPrefix); return; }

    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(300);

    for (const char of searchText) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
    }
    await delay(800);

    const listbox = document.getElementById(input.id + '-listbox');
    if (!listbox) { console.warn('LISTBOX NOT FOUND:', input.id); return; }
    const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
    if (items.length > 0) {
      const text = items[0].textContent.trim();
      console.log(`${idPrefix}: clicking "${text}" (${items.length} options)`);
      items[0].click();
    } else {
      console.warn(`${idPrefix}: 0 options for "${searchText}"`);
    }
  }

  // Helper: fill cx-select by name
  async function fillCxSelectByName(name, searchText) {
    const input = document.querySelector(`input.cx-select-input[name="${name}"]`);
    if (!input) { console.warn('NOT FOUND: name=' + name); return; }

    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(300);

    for (const char of searchText) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
    }
    await delay(800);

    const listbox = document.getElementById(input.id + '-listbox');
    if (!listbox) { console.warn('LISTBOX NOT FOUND:', input.id); return; }
    const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
    if (items.length > 0) {
      console.log(`${name}: clicking "${items[0].textContent.trim()}"`);
      items[0].click();
    }
  }

  // 1. Employer Name (text)
  fillText('input[name="employerName"]', 'IgniteLegends Technologies');

  // 2. Job Title (text)
  fillText('input[name="jobTitle"]', 'Full Stack Developer');

  // 3. Start Date (Month + Year)
  await fillCxSelectById('month-startDate', 'June');
  await delay(300);
  await fillCxSelectById('year-startDate', '2024');
  await delay(300);

  // 4. End Date (Month + Year)
  await fillCxSelectById('month-endDate', 'March');
  await delay(300);
  await fillCxSelectById('year-endDate', '2026');
  await delay(300);

  // 5. Employer Country
  await fillCxSelectByName('countryCode', 'United States');
  await delay(1000); // Wait for State cascade

  // 6. Employer State (appears after Country — search by 2-letter code or full name depending on field)
  const stateInput = document.querySelector('input.cx-select-input[name="stateProvinceCode"]');
  if (stateInput) {
    await fillCxSelectByName('stateProvinceCode', 'TX');
    await delay(300);
  }

  // 7. Employer City (text)
  fillText('input[name="employerCity"]', 'Dallas');

  // 8. Responsibilities (textarea)
  const textarea = document.querySelector('textarea[name="responsibilities"]');
  if (textarea) {
    textarea.focus();
    textarea.value = 'Built full-stack web applications using Next.js, FastAPI, and PostgreSQL. Led development of AI-powered job application automation platform.';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.blur();
    console.log('FILLED: responsibilities');
  }

  console.log('✅ Work Experience filled — click "Add Experience" button to save');
})();
```

**Status**: VERIFIED — All 9 fields (including date dropdowns and country cascade) fill correctly.

---

## Section 4: Education

**Container**: `<timeline-form-inline>` (inside `<beautiful-timeline>`)
**Trigger**: Click `button#timeline-add-education-button`

### Fields

| Field | Selector | Type | Required |
|-------|----------|------|----------|
| Degree | `input[name="degreeName"]` | text | YES |
| Major | `input[name="major"]` | text | no |
| Start Date Month | `input[id^="month-startDate"]` | cx-select | no |
| Start Date Year | `input[id^="year-startDate"]` | cx-select | no |
| End Date Month | `input[id^="month-endDate"]` | cx-select | no |
| End Date Year | `input[id^="year-endDate"]` | cx-select | no |
| Country | `input.cx-select-input[name="countryCode"]` | cx-select | no |
| State | `input.cx-select-input[name="stateProvinceCode"]` | cx-select | no (cascaded) |
| City | `input[name="city"]` | text | no |

### Seed Script: Education (with State Cascade Wait)

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] Section 4: Education
// NOTE: Click "ADD EDUCATION" button first, then run this
// CRITICAL: Fill order = Country → wait → State → City
// ═══════════════════════════════════════════════════════════
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Helper: fill plain text input
  function fillText(selector, value) {
    const el = document.querySelector(selector);
    if (!el) { console.warn('NOT FOUND:', selector); return; }
    el.focus(); el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    console.log('FILLED:', selector);
  }

  // Helper: fill cx-select by ID prefix
  async function fillCxSelectById(idPrefix, searchText) {
    const input = document.querySelector(`input.cx-select-input[id^="${idPrefix}"]`);
    if (!input) { console.warn('NOT FOUND: id^=' + idPrefix); return; }
    input.focus(); input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(300);
    for (const char of searchText) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
    }
    await delay(800);
    const listbox = document.getElementById(input.id + '-listbox');
    if (!listbox) { console.warn('LISTBOX NOT FOUND:', input.id); return; }
    const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
    if (items.length > 0) {
      console.log(`${idPrefix}: clicking "${items[0].textContent.trim()}"`);
      items[0].click();
    } else {
      console.warn(`${idPrefix}: 0 options for "${searchText}"`);
    }
  }

  // Helper: fill cx-select by name
  async function fillCxSelectByName(name, searchText) {
    const input = document.querySelector(`input.cx-select-input[name="${name}"]`);
    if (!input) { console.warn('NOT FOUND: name=' + name); return; }
    input.focus(); input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(300);
    for (const char of searchText) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
    }
    await delay(800);
    const listbox = document.getElementById(input.id + '-listbox');
    if (!listbox) { console.warn('LISTBOX NOT FOUND:', input.id); return; }
    const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
    if (items.length > 0) {
      console.log(`${name}: clicking "${items[0].textContent.trim()}"`);
      items[0].click();
    } else {
      console.warn(`${name}: 0 options for "${searchText}"`);
    }
  }

  // 1. Degree (text, REQUIRED)
  fillText('input[name="degreeName"]', 'Bachelor of Technology');

  // 2. Major (text)
  fillText('input[name="major"]', 'Computer Science');

  // 3. Start Date
  await fillCxSelectById('month-startDate', 'August');
  await delay(300);
  await fillCxSelectById('year-startDate', '2021');
  await delay(300);

  // 4. End Date
  await fillCxSelectById('month-endDate', 'May');
  await delay(300);
  await fillCxSelectById('year-endDate', '2025');
  await delay(300);

  // 5. Country (triggers State cascade)
  await fillCxSelectByName('countryCode', 'United States');

  // 6. Wait for State field to appear (cascade renders it dynamically)
  console.log('Waiting for State field to appear after Country cascade...');
  for (let i = 0; i < 20; i++) {
    const stateInput = document.querySelector('input.cx-select-input[name="stateProvinceCode"]');
    if (stateInput) {
      console.log('State field appeared!');
      break;
    }
    await delay(300);
  }

  // 7. State (2-LETTER CODE — "TX" not "Texas"!)
  await fillCxSelectByName('stateProvinceCode', 'TX');
  await delay(500);

  // 8. City (text — fill AFTER State to avoid cascade wipe)
  fillText('input[name="city"]', 'Dallas');

  console.log('✅ Education filled — click "Add Education" button to save');
})();
```

**Status**: VERIFIED — All fields fill correctly including State cascade with 2-letter code lookup.

**CRITICAL RULES**:
1. State dropdown uses 2-letter codes (TX, CA, NY) — NOT full names
2. Must wait for State field to appear after Country selection cascade
3. Fill City LAST — after State — to avoid cascade wipe

---

## Section 5: Supporting Documents (Resume & Cover Letter)

**Custom elements**: `<resume-upload-button>`, `<cover-letter-upload-button>`

### DOM Structure

```
resume-upload-button
  └── div.attachment-upload-button
      └── div.file-form-element
          ├── input[type="file"]#attachment-upload-d-4
          │   accept=".txt, .rtf, .doc, .docx, .pdf, .odt, .htm, .html"
          │   data-bind="event: { change: element.onFileSelected }"
          └── label.file-form-element__label → "Upload Resume"
```

### Seed Script: Resume & Cover Letter Upload

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] Section 5: Resume & Cover Letter Upload
// Uses DataTransfer API + Knockout's onFileSelected handler
// ═══════════════════════════════════════════════════════════
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Create dummy test PDF files
  const resumeBlob = new Blob(
    ['%PDF-1.4 dummy resume content for JAOS seed test'],
    { type: 'application/pdf' }
  );
  const resumeFile = new File([resumeBlob], 'Aqeel_Resume.pdf', {
    type: 'application/pdf',
    lastModified: Date.now()
  });

  const coverBlob = new Blob(
    ['%PDF-1.4 dummy cover letter content for JAOS seed test'],
    { type: 'application/pdf' }
  );
  const coverFile = new File([coverBlob], 'Aqeel_CoverLetter.pdf', {
    type: 'application/pdf',
    lastModified: Date.now()
  });

  // Helper: upload file to input via DataTransfer API
  async function uploadToInput(fileInput, file, label) {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`✅ ${label} uploaded: ${file.name}`);
  }

  // Resume upload
  const resumeInput = document.querySelector('resume-upload-button input[type="file"]');
  if (resumeInput) {
    await uploadToInput(resumeInput, resumeFile, 'Resume');
  } else {
    console.warn('❌ Resume file input not found');
  }

  await delay(500);

  // Cover Letter upload
  const coverInput = document.querySelector('cover-letter-upload-button input[type="file"]');
  if (coverInput) {
    await uploadToInput(coverInput, coverFile, 'Cover Letter');
  } else {
    // Fallback: find second file input near "Cover Letter" label
    const allInputs = document.querySelectorAll('input[type="file"][name="attachment-upload"]');
    let found = false;
    for (const inp of allInputs) {
      if (inp === resumeInput) continue;
      const parent = inp.closest('[class*="upload"]') || inp.parentElement;
      const label = parent?.querySelector('label, span');
      if (label && /cover.?letter/i.test(label.textContent)) {
        await uploadToInput(inp, coverFile, 'Cover Letter');
        found = true;
        break;
      }
    }
    if (!found) {
      // Last resort: any file input that isn't the resume one
      for (const inp of allInputs) {
        if (inp !== resumeInput) {
          await uploadToInput(inp, coverFile, 'Cover Letter (fallback)');
          found = true;
          break;
        }
      }
      if (!found) console.warn('❌ Cover Letter file input not found');
    }
  }

  console.log('✅ Supporting Documents uploaded');
})();
```

**Status**: VERIFIED — Both resume and cover letter upload successfully via DataTransfer API.

---

## Section 6: Disability Information

**Type**: Radio button group (3 options)

### Options

| Value | Label | Recommended |
|-------|-------|-------------|
| `ORA_PER_YES_US` | Yes, I have a disability, or have had one in the past | |
| `ORA_PER_NO_US` | No, I do not have a disability and have not had one in the past | |
| `ORA_PER_NO_ANSWER_US` | I do not want to answer | DEFAULT |

### Seed Script: Disability

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] Section 6: Disability Information
// Radio group — click the "I do not want to answer" option
// ═══════════════════════════════════════════════════════════
(() => {
  // Find radio by value (suffix number varies per portal, so search by value)
  const radios = document.querySelectorAll('input[type="radio"]');
  for (const radio of radios) {
    if (radio.value === 'ORA_PER_NO_ANSWER_US') {
      radio.click();
      console.log('✅ Disability: "I do not want to answer" selected');
      return;
    }
  }
  console.warn('❌ Disability radio not found');
})();
```

**Status**: VERIFIED

---

## Section 7: Diversity Information (Ethnicity + Gender)

### Ethnicity/Race — Checkbox Group

| ID | Label |
|----|-------|
| `dq-option-4` | I am Hispanic or Latino |
| `dq-option-7` | American Indian or Alaska Native |
| `dq-option-5` | Asian |
| `dq-option-3` | Black or African American |
| `dq-option-6` | Native Hawaiian or other Pacific Islander |
| `dq-option-PREF_NO_ANSWER` | Prefer not to answer |
| `dq-option-1` | White |

### Gender — cx-select Dropdown (REQUIRED)

**Options (Oracle Cloud specific)**: Female, Male, Nonbinary, Prefer not to Answer, X-Gender

### Seed Script: Diversity (Ethnicity + Gender)

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] Section 7: Diversity Information
// Ethnicity checkbox + Gender cx-select dropdown
// ═══════════════════════════════════════════════════════════
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // --- Ethnicity: "Prefer not to answer" ---
  const ethnicityCheckbox = document.getElementById('dq-option-PREF_NO_ANSWER');
  if (ethnicityCheckbox) {
    if (!ethnicityCheckbox.checked) ethnicityCheckbox.click();
    console.log('✅ Ethnicity: "Prefer not to answer" checked');
  } else {
    console.warn('❌ Ethnicity checkbox not found');
  }

  await delay(300);

  // --- Gender: "Prefer not to Answer" (cx-select dropdown) ---
  // [OracleCloud] Gender options: Female, Male, Nonbinary, Prefer not to Answer, X-Gender
  const genderInput = document.querySelector('input.cx-select-input[name*="GENDER"]');
  if (genderInput) {
    genderInput.focus();
    genderInput.value = '';
    genderInput.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(300);

    // Type "Prefer" to filter to "Prefer not to Answer"
    const searchText = 'Prefer';
    for (const char of searchText) {
      genderInput.value += char;
      genderInput.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
    }
    await delay(800);

    const listbox = document.getElementById(genderInput.id + '-listbox');
    if (listbox) {
      const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
      console.log(`Gender: ${items.length} options for "Prefer"`);
      if (items.length > 0) {
        items[0].click();
        console.log('✅ Gender: "Prefer not to Answer" selected');
      }
    }
  } else {
    console.warn('❌ Gender dropdown not found');
  }

  console.log('✅ Diversity Information filled');
})();
```

**Status**: VERIFIED — Both ethnicity and gender fill correctly. Gender uses "Prefer" search to find "Prefer not to Answer".

---

## Section 8: Veteran Information

**Type**: cx-select dropdown

**Options (Oracle Cloud specific)**: Not a Protected Veteran, Declines to Self-Identify, Protected Veteran

### Seed Script: Veteran Status

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] Section 8: Veteran Information
// cx-select dropdown — "Not a Protected Veteran"
// ═══════════════════════════════════════════════════════════
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  const vetInput = document.querySelector('input.cx-select-input[name*="VETERAN"]');
  if (!vetInput) { console.warn('❌ Veteran dropdown not found'); return; }

  vetInput.focus();
  vetInput.value = '';
  vetInput.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(300);

  const searchText = 'Not';
  for (const char of searchText) {
    vetInput.value += char;
    vetInput.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(50);
  }
  await delay(800);

  const listbox = document.getElementById(vetInput.id + '-listbox');
  if (listbox) {
    const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
    console.log(`Veteran: ${items.length} options for "Not"`);
    if (items.length > 0) {
      items[0].click();
      console.log('✅ Veteran: "Not a Protected Veteran" selected');
    }
  }
})();
```

**Status**: VERIFIED

---

## Section 9: E-Signature

**Type**: Plain text input (required)

### Seed Script: E-Signature

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] Section 9: E-Signature
// Plain text input — full name as electronic signature
// ═══════════════════════════════════════════════════════════
(() => {
  const el = document.querySelector('input[name="fullName"]');
  if (!el) { console.warn('❌ E-Signature input not found'); return; }

  el.focus();
  el.value = 'Mohammad Aqeel';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
  console.log('✅ E-Signature filled: Mohammad Aqeel');
})();
```

**Status**: VERIFIED

---

## Portal Variant Discovery (2026-03-10)

**Same ATS, different portals have different form structures.** The adapter MUST detect and handle both variants.

### Verified Portal Variants

| Feature | Fanatics (Portal A) | HealthPartners (Portal B) |
|---------|---------------------|---------------------------|
| **Degree** | `input[name="degreeName"]` — plain text | `input[name="contentItemId"]` — cx-select dropdown |
| **Degree Options** | N/A (free text) | Associate's, Bachelor's, Certificate, Doctorate, High School/GED, Higher Ed, Master's, Medical/MD/DO, Non-Degree, Other |
| **Dates** | `month-startDate-*`, `year-startDate-*` — cx-select | NOT PRESENT |
| **School** | NOT PRESENT | `input[name="educationalEstablishment"]` — cx-select (US school database) |
| **Minor** | NOT PRESENT | `input[name="minor"]` — text |
| **Comments** | NOT PRESENT | `textarea[name="comments"]` — textarea |
| **Status** | NOT PRESENT | Pill buttons: In Progress/Enrolled, Completed, Withdrew From Program |
| **Responsibilities** | `textarea[name="responsibilities"]` — textarea | NOT PRESENT |

### Detection Strategy

```js
// Degree: text or dropdown?
const isDropdown = !!document.querySelector('input.cx-select-input[name="contentItemId"]');
const isText = !!document.querySelector('input.input-row__control[name="degreeName"]');

// Dates present?
const hasDates = !!document.querySelector('input.cx-select-input[id^="month-startDate"]');

// School present?
const hasSchool = !!document.querySelector('input.cx-select-input[name="educationalEstablishment"]');

// Status pills present?
const hasStatus = document.querySelectorAll('timeline-form-inline button.cx-select-pill-section').length > 0;
```

---

## Section 10: Full Page Autofill v3 (All Sections Combined)

Master script with all fixes applied:
- **Address**: Polling for Oracle Maps suggestions + cascade-aware (don't touch cascaded fields)
- **Education**: Smart Degree detection (text vs dropdown), optional School/Dates/Status
- **Work Experience**: Flexible — fills dates/responsibilities only if present
- **Address Line 2**: Only fills if user profile has data (commented out for seed test)

> Tested on both Fanatics and HealthPartners portals — works on both.

```js
// ═══════════════════════════════════════════════════════════
// [OracleCloud] FULL PAGE AUTOFILL v3 — Multi-Portal Compatible
// Handles: text vs dropdown Degree, optional dates, Oracle Maps
// polling, cascade awareness, flexible Work + Education
// ═══════════════════════════════════════════════════════════
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // ───── HELPERS ─────
  function fillText(selector, value) {
    const el = document.querySelector(selector);
    if (!el) { console.log('SKIP:', selector); return; }
    if (el.value.trim() && selector.includes('email')) { console.log('SKIP prefilled:', selector); return; }
    el.focus(); el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
  }

  function fillTextByName(name, value) {
    const el = document.querySelector(`input[name="${name}"]`)
            || document.querySelector(`textarea[name="${name}"]`);
    if (!el) { console.log('SKIP:', name); return false; }
    el.focus(); el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    console.log('FILLED:', name);
    return true;
  }

  async function fillCxSelect(nameOrId, searchText, byId = false) {
    const input = byId
      ? document.querySelector(`input.cx-select-input[id^="${nameOrId}"]`)
      : document.querySelector(`input.cx-select-input[name="${nameOrId}"]`)
        || document.querySelector(`input.cx-select-input[name*="${nameOrId}"]`);
    if (!input) { console.log('SKIP cx-select:', nameOrId); return false; }
    input.focus(); input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(300);
    for (const char of searchText) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
    }
    await delay(1000);
    const listbox = document.getElementById(input.id + '-listbox');
    if (!listbox) return false;
    const items = listbox.querySelectorAll('div[role="gridcell"]');
    if (items.length > 0) {
      console.log(`${nameOrId}: clicking "${items[0].textContent.trim()}"`);
      items[0].click();
      return true;
    }
    console.log(`${nameOrId}: 0 results for "${searchText}"`);
    return false;
  }

  async function typeWithKeyboard(input, text) {
    input.focus(); input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(200);
    for (const char of text) {
      const opts = { key: char, code: `Key${char.toUpperCase()}`, bubbles: true };
      input.dispatchEvent(new KeyboardEvent('keydown', opts));
      input.dispatchEvent(new KeyboardEvent('keypress', opts));
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', opts));
      await delay(80);
    }
  }

  console.log('═══ STARTING FULL PAGE AUTOFILL v3 ═══');

  // ───── 1. CONTACT INFORMATION ─────
  console.log('\n📋 Section 1: Contact Information');
  fillText('input[name="lastName"]', 'Aqeel');
  fillText('input[name="firstName"]', 'Mohammad');
  fillText('input.phone-row__input[type="tel"]', '7169364737');
  fillText('input[name="email"]', 'mohammadaqeel@example.com');
  const pills = document.querySelectorAll('ul.cx-select-pills-container[aria-label="Title"] button.cx-select-pill-section');
  for (const btn of pills) {
    if (btn.querySelector('.cx-select-pill-name')?.textContent.trim() === 'Mr.') { btn.click(); break; }
  }
  console.log('✅ Contact Information done');

  // ───── 2. ADDRESS (Oracle Maps cascade + polling) ─────
  console.log('\n📋 Section 2: Address');
  const resetBtn = document.querySelector('input.cx-select-input[name="addressLine1"]')
    ?.closest('.cx-select-container')?.querySelector('button.icon-clear');
  if (resetBtn) { resetBtn.click(); await delay(500); }

  const addr1 = document.querySelector('input.cx-select-input[name="addressLine1"]');
  if (addr1) {
    await typeWithKeyboard(addr1, '1600 Pennsylvania Ave NW');
    console.log('Polling for Oracle Maps suggestions...');
    let cascaded = false;
    for (let i = 0; i < 20; i++) {
      await delay(500);
      const listbox = document.getElementById(addr1.id + '-listbox');
      if (listbox) {
        const items = listbox.querySelectorAll('div[role="gridcell"]');
        if (items.length > 0) {
          console.log(`Clicking: "${items[0].textContent.trim()}"`);
          items[0].click();
          cascaded = true;
          break;
        }
      }
    }
    if (cascaded) {
      await delay(2000);
      const city = document.querySelector('input.cx-select-input[name="city"]')?.value;
      const state = document.querySelector('input.cx-select-input[name="region2"]')?.value;
      console.log(`CASCADE: City=${city}, State=${state}`);
      if (city && state) {
        console.log('Cascade filled everything — NOT touching individual fields');
      } else {
        if (!city) await fillCxSelect('city', 'Washington');
        if (!state) await fillCxSelect('region2', 'DC');
      }
    } else {
      console.warn('No suggestions — fill address fields manually');
    }
  }
  // Address Line 2 — only if user profile has data
  // fillText('input[name="addressLine2"]', profileData.addressLine2);
  console.log('✅ Address done');

  // ───── 3. WORK EXPERIENCE (flexible — fills what exists) ─────
  console.log('\n📋 Section 3: Work Experience');
  const addExpBtn = document.getElementById('timeline-add-experience-button');
  if (addExpBtn) {
    addExpBtn.click();
    await delay(1000);

    fillTextByName('employerName', 'IgniteLegends Technologies');
    fillTextByName('jobTitle', 'Full Stack Developer');

    // Dates (only if present)
    if (document.querySelector('input.cx-select-input[id^="month-startDate"]')) {
      console.log('Experience dates: FOUND');
      await fillCxSelect('month-startDate', 'June', true); await delay(300);
      await fillCxSelect('year-startDate', '2024', true); await delay(300);
      await fillCxSelect('month-endDate', 'March', true); await delay(300);
      await fillCxSelect('year-endDate', '2026', true); await delay(300);
    } else {
      console.log('Experience dates: NOT present');
    }

    // Country + State cascade
    await fillCxSelect('countryCode', 'United States');
    await delay(1000);
    for (let i = 0; i < 10; i++) {
      if (document.querySelector('input.cx-select-input[name="stateProvinceCode"]')) break;
      await delay(300);
    }
    await fillCxSelect('stateProvinceCode', 'TX'); await delay(300);
    fillTextByName('employerCity', 'Dallas');

    // Responsibilities (only if present)
    const textarea = document.querySelector('textarea[name="responsibilities"]');
    if (textarea) {
      textarea.focus();
      textarea.value = 'Built full-stack web apps using Next.js, FastAPI, and PostgreSQL.';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      textarea.blur();
    }

    const saveBtn = document.querySelector('button.save-btn');
    if (saveBtn) { saveBtn.click(); await delay(1500); }
  }
  console.log('✅ Work Experience done');

  // ───── 4. EDUCATION (smart — handles both portal variants) ─────
  console.log('\n📋 Section 4: Education');
  const addEduBtn = document.getElementById('timeline-add-education-button');
  if (addEduBtn) {
    addEduBtn.click();
    await delay(1000);

    // Degree: auto-detect text vs cx-select dropdown
    const degreeCx = document.querySelector('input.cx-select-input[name="contentItemId"]');
    const degreeTxt = document.querySelector('input.input-row__control[name="degreeName"]');
    if (degreeCx) {
      console.log('Degree: DROPDOWN detected');
      await fillCxSelect('contentItemId', 'Bachelor');
    } else if (degreeTxt) {
      console.log('Degree: TEXT INPUT detected');
      fillTextByName('degreeName', 'Bachelor of Technology');
    }
    await delay(300);

    fillTextByName('major', 'Computer Science');

    // School (cx-select — only some portals, try US school)
    const schoolInput = document.querySelector('input.cx-select-input[name="educationalEstablishment"]');
    if (schoolInput) {
      const picked = await fillCxSelect('educationalEstablishment', 'University of Texas');
      if (!picked) console.log('School: no match — user fills manually');
    }
    await delay(300);

    // Dates (only if present)
    if (document.querySelector('input.cx-select-input[id^="month-startDate"]')) {
      console.log('Education dates: FOUND');
      await fillCxSelect('month-startDate', 'August', true); await delay(300);
      await fillCxSelect('year-startDate', '2021', true); await delay(300);
      await fillCxSelect('month-endDate', 'May', true); await delay(300);
      await fillCxSelect('year-endDate', '2025', true); await delay(300);
    } else {
      console.log('Education dates: NOT present');
    }

    // Country + State cascade
    await fillCxSelect('countryCode', 'United States');
    await delay(1000);
    for (let i = 0; i < 10; i++) {
      if (document.querySelector('input.cx-select-input[name="stateProvinceCode"]')) break;
      await delay(300);
    }
    await fillCxSelect('stateProvinceCode', 'TX'); await delay(300);
    fillTextByName('city', 'Dallas');

    // Status pills (only some portals)
    const statusPills = document.querySelectorAll('timeline-form-inline button.cx-select-pill-section');
    for (const btn of statusPills) {
      if (btn.querySelector('.cx-select-pill-name')?.textContent.trim() === 'Completed') {
        btn.click(); console.log('Status: Completed'); break;
      }
    }

    const saveBtn = document.querySelector('button.save-btn');
    if (saveBtn) { saveBtn.click(); await delay(1500); }
  }
  console.log('✅ Education done');

  // ───── 5. SUPPORTING DOCUMENTS ─────
  console.log('\n📋 Section 5: Supporting Documents');
  const resumeBlob = new Blob(['%PDF-1.4 JAOS test resume'], { type: 'application/pdf' });
  const resumeFile = new File([resumeBlob], 'Aqeel_Resume.pdf', { type: 'application/pdf' });
  const coverBlob = new Blob(['%PDF-1.4 JAOS test cover letter'], { type: 'application/pdf' });
  const coverFile = new File([coverBlob], 'Aqeel_CoverLetter.pdf', { type: 'application/pdf' });

  const resumeInput = document.querySelector('resume-upload-button input[type="file"]');
  if (resumeInput) {
    const dt = new DataTransfer(); dt.items.add(resumeFile);
    resumeInput.files = dt.files;
    resumeInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await delay(500);
  const coverInput = document.querySelector('cover-letter-upload-button input[type="file"]');
  if (coverInput) {
    const dt = new DataTransfer(); dt.items.add(coverFile);
    coverInput.files = dt.files;
    coverInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  console.log('✅ Documents uploaded');

  // ───── 6. DISABILITY ─────
  console.log('\n📋 Section 6: Disability');
  for (const r of document.querySelectorAll('input[type="radio"]')) {
    if (r.value === 'ORA_PER_NO_ANSWER_US') { r.click(); break; }
  }
  console.log('✅ Disability done');

  // ───── 7. DIVERSITY (Ethnicity + Gender) ─────
  console.log('\n📋 Section 7: Diversity');
  const ethCb = document.getElementById('dq-option-PREF_NO_ANSWER');
  if (ethCb && !ethCb.checked) ethCb.click();
  await delay(300);
  // [OracleCloud] Gender options: Female, Male, Nonbinary, Prefer not to Answer, X-Gender
  await fillCxSelect('GENDER', 'Prefer');
  console.log('✅ Diversity done');

  // ───── 8. VETERAN ─────
  console.log('\n📋 Section 8: Veteran');
  await fillCxSelect('VETERAN', 'Not');
  console.log('✅ Veteran done');

  // ───── 9. E-SIGNATURE ─────
  console.log('\n📋 Section 9: E-Signature');
  fillText('input[name="fullName"]', 'Mohammad Aqeel');
  console.log('✅ E-Signature done');

  console.log('\n═══════════════════════════════════════');
  console.log('✅ FULL PAGE AUTOFILL v3 COMPLETE');
  console.log('Review Work + Education, then submit!');
  console.log('═══════════════════════════════════════');
})();
```


---

## Section 11: Application Questions (Pills + Dropdowns + Pagination)

> **Date verified**: March 11, 2026
> **Portal tested**: eofe.fa.us2.oraclecloud.com (BNY — Vice President, Application Development Manager II)
> **Form type**: Multi-step (4 pages with NEXT button)

### Field Types Discovered

| Type | Count (BNY) | Example |
|------|-------------|---------|
| Yes/No pills | 14 | "Are you eligible to work...", "Require sponsorship..." |
| Multi-select pill | 1 | "Do any of the following apply to you?" → "None of these apply to me" |
| Sexual orientation pill | 1 | Options: Straight/Heterosexual, Gay, Lesbian, ..., Prefer Not to Say |
| Salary cx-select | 2 | Compensation expectations, minimum salary requirement |
| Currency cx-select | 1 | Salary Expectation in Local Currency (US Dollar, Euro, ...) |

### Seed Script: All Application Questions

```js
// ═══ Oracle Cloud — Application Questions (All Pills + Dropdowns) ═══
// Verified on BNY portal — 16 pills + 3 dropdowns + NEXT button
(async () => {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  const clickPill = (ariaSubstr, pillText) => {
    for (const ul of document.querySelectorAll('ul.cx-select-pills-container')) {
      const label = (ul.getAttribute('aria-label') || '').toLowerCase();
      if (!label.includes(ariaSubstr.toLowerCase())) continue;
      for (const btn of ul.querySelectorAll('button.cx-select-pill-section')) {
        const txt = btn.querySelector('.cx-select-pill-name')?.textContent?.trim();
        if (txt === pillText && btn.getAttribute('aria-pressed') !== 'true') {
          btn.click();
          console.log(`✅ "${ariaSubstr.substring(0, 50)}" → ${pillText}`);
          return true;
        } else if (txt === pillText) return true;
      }
    }
    return false;
  };

  async function fillCxSelect(nameOrId, searchText) {
    const input = document.querySelector(`input.cx-select-input[name*="${nameOrId}"]`);
    if (!input) return false;
    input.focus(); input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(300);
    for (const char of searchText) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
    }
    for (let i = 0; i < 30; i++) {
      await delay(200);
      const lb = document.getElementById(input.id + '-listbox');
      if (lb) {
        const items = lb.querySelectorAll('div[role="gridcell"]');
        if (items.length > 0) { items[0].click(); return true; }
      }
    }
    return false;
  }

  // ── Yes/No Pills ──
  clickPill('referred by a bny', 'No');                            await delay(150);
  clickPill('eligible to work', 'Yes');                            await delay(150);
  clickPill('require sponsorship', 'No');                          await delay(150);
  clickPill('suspended or barred', 'No');                          await delay(150);
  clickPill('license or professional certification', 'No');        await delay(150);
  clickPill('covered fund', 'No');                                 await delay(150);
  clickPill('public accounting firm', 'No');                       await delay(150);
  clickPill('accommodation during the recruitment', 'No');         await delay(150);
  clickPill('previously been employed by company', 'No');          await delay(150);
  clickPill('financial regulatory agencies', 'No');                await delay(150);
  clickPill('contributions to any of the following', 'No');        await delay(150);
  clickPill('relatives or members of your household', 'No');       await delay(150);
  clickPill('close personal associates serving', 'No');            await delay(150);

  // ── Multi-select pill ──
  clickPill('do any of the following apply', 'None of these apply to me');
  await delay(150);

  // ── Sexual orientation ──
  const sexUl = [...document.querySelectorAll('ul.cx-select-pills-container')]
    .find(ul => (ul.getAttribute('aria-label') || '').toLowerCase().includes('sexual orientation'));
  if (sexUl) {
    const opts = [...sexUl.querySelectorAll('button .cx-select-pill-name')].map(s => s.textContent.trim());
    const decline = opts.find(o => /prefer not/i.test(o));
    if (decline) clickPill('sexual orientation', decline);
  }

  // ── Salary/Compensation dropdowns ──
  // Search profile salary or pick first option
  await fillCxSelect('compensation', '1');   await delay(500);
  await fillCxSelect('salary', '1');         await delay(500);

  // ── Currency dropdown — default US Dollar ──
  // Find by toggle button aria-label
  for (const btn of document.querySelectorAll('button.icon-dropdown-arrow')) {
    if ((btn.getAttribute('aria-label') || '').toLowerCase().includes('local currency')) {
      const input = btn.closest('.cx-select-container')?.querySelector('input.cx-select-input');
      if (input && !input.value.trim()) {
        input.focus(); input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(300);
        for (const c of 'US Dollar') {
          input.value += c;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await delay(50);
        }
        for (let i = 0; i < 30; i++) {
          await delay(200);
          const lb = document.getElementById(input.id + '-listbox');
          if (lb) {
            const items = lb.querySelectorAll('div[role="gridcell"]');
            if (items.length > 0) { items[0].click(); break; }
          }
        }
      }
      break;
    }
  }

  // ── Log final state ──
  console.log('\n📋 All pill states:');
  for (const ul of document.querySelectorAll('ul.cx-select-pills-container')) {
    const label = (ul.getAttribute('aria-label') || '').substring(0, 60);
    const sel = ul.querySelector('button[aria-pressed="true"] .cx-select-pill-name');
    console.log(`  • "${label}..." → ${sel?.textContent?.trim() || 'NONE'}`);
  }

  // ── Click NEXT if multi-step ──
  const nextBtn = document.querySelector('button[data-qa="applyFlowPaginationNextButton"]');
  if (nextBtn && !nextBtn.disabled) {
    console.log('\n🔄 Clicking NEXT...');
    nextBtn.click();
  }

  console.log('\n═══ Application Questions done ═══');
})();
```

**Status**: FILL VERIFIED ✅ (all 16 pills + 2/3 dropdowns filled, currency needs "US Dollar" search text not "1")

---

## Appendix: DOM Inspection Scripts

### Script A: Full Page Field Scanner

Run this on any Oracle Cloud application to dump all form fields:

```js
// [OracleCloud] Full Page Field Scanner — dumps all inputs, selects, textareas
(() => {
  const results = [];

  document.querySelectorAll('input').forEach(el => {
    if (!el.offsetParent && el.type !== 'hidden' && el.type !== 'file') return;
    const label = el.labels?.[0]?.textContent?.trim()
      || el.closest('[class*="field"], [class*="row"]')?.querySelector('label, [class*="label"]')?.textContent?.trim()
      || el.getAttribute('aria-label') || el.placeholder || '';
    results.push({
      tag: 'INPUT', type: el.type, id: el.id, name: el.name,
      class: el.className.substring(0, 80),
      label: label.substring(0, 60),
      value: el.value.substring(0, 40),
      required: el.required || el.getAttribute('aria-required') === 'true',
    });
  });

  document.querySelectorAll('textarea').forEach(el => {
    results.push({
      tag: 'TEXTAREA', id: el.id, name: el.name,
      class: el.className.substring(0, 80),
      required: el.required,
    });
  });

  console.table(results);
  console.log(`Total: ${results.length} fields`);
})();
```

### Script B: cx-select Options Inspector

Inspect available options for any cx-select dropdown:

```js
// [OracleCloud] cx-select Options Inspector
// Usage: paste and change the name below
((fieldName) => {
  const input = document.querySelector(`input.cx-select-input[name*="${fieldName}"]`);
  if (!input) { console.error('Not found:', fieldName); return; }

  // Open dropdown
  input.focus();
  const toggle = document.getElementById(input.id + '-toggle-button');
  if (toggle) toggle.click();

  setTimeout(() => {
    const listbox = document.getElementById(input.id + '-listbox');
    if (!listbox) { console.error('No listbox'); return; }
    const items = listbox.querySelectorAll('div[role="gridcell"].cx-select__list-item');
    const options = [...items].map((item, i) => ({
      index: i,
      text: item.querySelector('span.cx-select-list-item--content')?.textContent?.trim()
            || item.textContent.trim(),
      id: item.id,
    }));
    console.table(options);
    console.log(`${options.length} options for "${fieldName}"`);
  }, 1000);
})('GENDER');  // <-- Change this to inspect other fields
```

### Script C: Section Navigator

List all sections and their completion status:

```js
// [OracleCloud] Section Navigator — list all sidebar sections
(() => {
  const sections = document.querySelectorAll('apply-flow-navigation-train li, [class*="navigation"] li');
  const results = [];
  sections.forEach((li, i) => {
    const text = li.textContent.trim().replace(/\s+/g, ' ');
    const isActive = li.classList.contains('active') || li.querySelector('[aria-current]');
    results.push({ index: i, section: text, active: !!isActive });
  });
  console.table(results);
})();
```

---

## US State Code Lookup (Required for Adapter)

Oracle Cloud State dropdowns use **2-letter codes**. The adapter needs this mapping:

```js
// [OracleCloud] US State name → code lookup
const US_STATES = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};
```

---

> **Next Step**: Build `adapters/oraclecloud-v2.js` using these verified patterns and the V2 engine architecture.
