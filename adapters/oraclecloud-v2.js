/**
 * adapters/oraclecloud-v2.js — Oracle Cloud HCM Recruiting adapter (v2 architecture)
 *
 * Framework: Knockout.js + Oracle JET (NOT React — no fiber bridge needed)
 * Portal layout: Single scrollable page with right sidebar navigation
 *
 * This adapter handles:
 *  - Portal detection (hostname, DOM markers)
 *  - Form ready timing (MutationObserver for Knockout rendering)
 *  - cx-select-input filling (type-to-search → click from dropdown grid)
 *  - Oracle Maps address autocomplete (keyboard events + cascade awareness)
 *  - Work & Education multi-entry forms (Add button → fill → Save)
 *  - Portal variant detection (text Degree vs dropdown Degree, dates vs no dates)
 *  - Supporting documents (Resume + Cover Letter via DataTransfer)
 *  - EEO sections (Disability, Diversity, Veteran)
 *  - E-Signature
 *
 * This adapter does NOT:
 *  - Hardcode every field selector per portal (LLM mapper handles unknowns)
 *  - Handle Application Questions (portal-specific — LLM fills these)
 *
 * References:
 *  - oraclecloud-rules.md — complete field map + fill rules
 *  - oraclecloud-seed-scripts.md — verified seed test scripts
 *
 * Flow: detect → waitForFormReady → fillCustom (all sections sequentially)
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 = window.__jaosAtsAdaptersV2 || []);

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] CONSTANTS & LOOKUP TABLES
  // ════════════════════════════════════════════════════════════════════

  // [OracleCloud] US State name → 2-letter code lookup
  // Oracle Cloud State dropdowns use 2-letter codes (TX, CA, NY)
  const US_STATES = {
    'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
    'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
    'district of columbia': 'DC', 'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI',
    'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
    'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME',
    'maryland': 'MD', 'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN',
    'mississippi': 'MS', 'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE',
    'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM',
    'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
    'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI',
    'south carolina': 'SC', 'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX',
    'utah': 'UT', 'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA',
    'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  };

  // [OracleCloud] Default values for EEO sections (safe/neutral defaults)
  const EEO_DEFAULTS = {
    disability: 'ORA_PER_NO_ANSWER_US',          // "I do not want to answer"
    ethnicity: 'dq-option-PREF_NO_ANSWER',        // "Prefer not to answer"
    gender: 'Prefer',                              // Searches for "Prefer not to Answer"
    veteran: 'Not',                                // Searches for "Not a Protected Veteran"
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] DETECTION
  // ════════════════════════════════════════════════════════════════════

  // [OracleCloud] Simple detection: hostname has "oraclecloud" + URL has "hcm"
  // Covers all variants: fa-*.ocs.oraclecloud.com, *.fa.*.oraclecloud.com, etc.
  const detect = () => {
    const href = window.location.href.toLowerCase();
    if (href.includes('oraclecloud.com') && href.includes('/hcm')) return true;

    // Fallback: DOM markers (catches edge cases)
    if (document.querySelector('apply-flow-section') ||
        document.querySelector('apply-flow-navigation-train') ||
        document.querySelector('name-form')) return true;

    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] FORM ROOT DISCOVERY
  // ════════════════════════════════════════════════════════════════════

  const getFormRoot = () => {
    // [OracleCloud] Main application form container
    return document.querySelector('apply-flow-container')
      || document.querySelector('.apply-flow-main')
      || document.body;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: delay
  // ════════════════════════════════════════════════════════════════════

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Fill plain text input
  // Sets .value + dispatches input/change/blur events for Knockout binding
  // ════════════════════════════════════════════════════════════════════

  const fillText = (el, value) => {
    if (!el || !value) return false;
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    console.log(`[JAOS OracleCloud] FILLED text: ${el.name || el.id} = "${value}"`);
    return true;
  };

  // [OracleCloud] Fill text input by name attribute
  const fillTextByName = (name, value) => {
    const el = document.querySelector(`input[name="${name}"]`)
      || document.querySelector(`textarea[name="${name}"]`);
    if (!el) {
      console.log(`[JAOS OracleCloud] SKIP: ${name} not found`);
      return false;
    }
    return fillText(el, value);
  };

  // [OracleCloud] Fill text input by selector
  const fillTextBySelector = (selector, value) => {
    const el = document.querySelector(selector);
    if (!el) {
      console.log(`[JAOS OracleCloud] SKIP: ${selector} not found`);
      return false;
    }
    return fillText(el, value);
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Fill cx-select-input (custom combobox)
  // Type-to-search → wait for listbox → click first matching gridcell
  // Used by: Country, City, State, ZIP, County, Phone, Gender, Veteran, etc.
  // ════════════════════════════════════════════════════════════════════

  const fillCxSelect = async (nameOrId, searchText, byId = false) => {
    // [OracleCloud] Find the cx-select input by name or id prefix
    const input = byId
      ? document.querySelector(`input.cx-select-input[id^="${nameOrId}"]`)
      : document.querySelector(`input.cx-select-input[name="${nameOrId}"]`)
        || document.querySelector(`input.cx-select-input[name*="${nameOrId}"]`);

    if (!input) {
      console.log(`[JAOS OracleCloud] SKIP cx-select: ${nameOrId} not found`);
      return false;
    }

    // [OracleCloud] Focus and clear existing value
    input.focus();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(300);

    // [OracleCloud] Type search text char-by-char to trigger Knockout filtering
    for (const char of searchText) {
      input.value += char;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(50);
    }

    // [OracleCloud] Wait for listbox options to populate
    await delay(1000);

    // [OracleCloud] Find the listbox by convention: input.id + '-listbox'
    const listbox = document.getElementById(input.id + '-listbox');
    if (!listbox) {
      console.log(`[JAOS OracleCloud] cx-select listbox not found: ${input.id}`);
      return false;
    }

    // [OracleCloud] Click first matching gridcell option
    const items = listbox.querySelectorAll('div[role="gridcell"]');
    if (items.length > 0) {
      console.log(`[JAOS OracleCloud] cx-select ${nameOrId}: clicking "${items[0].textContent.trim()}"`);
      items[0].click();
      return true;
    }

    console.log(`[JAOS OracleCloud] cx-select ${nameOrId}: 0 results for "${searchText}"`);
    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Type with full keyboard events
  // Oracle Maps API requires keydown/keypress/keyup — not just input event
  // Used for: Address Line 1 autocomplete
  // ════════════════════════════════════════════════════════════════════

  const typeWithKeyboard = async (input, text) => {
    input.focus();
    input.value = '';
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
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Poll for Oracle Maps suggestions
  // Polls listbox up to maxAttempts × intervalMs for gridcell items
  // Returns true if a suggestion was clicked (cascade triggered)
  // ════════════════════════════════════════════════════════════════════

  const pollAndClickSuggestion = async (inputId, maxAttempts = 20, intervalMs = 500) => {
    for (let i = 0; i < maxAttempts; i++) {
      await delay(intervalMs);
      const listbox = document.getElementById(inputId + '-listbox');
      if (listbox) {
        const items = listbox.querySelectorAll('div[role="gridcell"]');
        if (items.length > 0) {
          console.log(`[JAOS OracleCloud] Address suggestion: clicking "${items[0].textContent.trim()}"`);
          items[0].click();
          return true;
        }
      }
    }
    console.warn('[JAOS OracleCloud] No Oracle Maps suggestions found after polling');
    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Convert state name to 2-letter code
  // Oracle Cloud State dropdowns use 2-letter codes (TX not Texas)
  // ════════════════════════════════════════════════════════════════════

  const toStateCode = (stateNameOrCode) => {
    if (!stateNameOrCode) return null;
    const normalized = stateNameOrCode.trim().toLowerCase();
    // Already a 2-letter code
    if (/^[A-Z]{2}$/i.test(stateNameOrCode.trim())) return stateNameOrCode.trim().toUpperCase();
    return US_STATES[normalized] || stateNameOrCode.trim();
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Wait for State field cascade
  // After selecting Country, State field appears dynamically
  // ════════════════════════════════════════════════════════════════════

  const waitForStateCascade = async (maxAttempts = 10, intervalMs = 300) => {
    for (let i = 0; i < maxAttempts; i++) {
      if (document.querySelector('input.cx-select-input[name="stateProvinceCode"]')) {
        console.log('[JAOS OracleCloud] State field appeared after cascade');
        return true;
      }
      await delay(intervalMs);
    }
    console.log('[JAOS OracleCloud] State field did not appear — may not be required');
    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Click pill button by text
  // Used for: Title (Mr./Mrs./Dr.), Education Status (Completed)
  // ════════════════════════════════════════════════════════════════════

  const clickPillByText = (containerSelector, text) => {
    const pills = document.querySelectorAll(`${containerSelector} button.cx-select-pill-section`);
    for (const btn of pills) {
      const pillText = btn.querySelector('.cx-select-pill-name')?.textContent?.trim();
      if (pillText && pillText.toLowerCase() === text.toLowerCase()) {
        btn.click();
        console.log(`[JAOS OracleCloud] Pill selected: "${pillText}"`);
        return true;
      }
    }
    console.log(`[JAOS OracleCloud] Pill "${text}" not found in ${containerSelector}`);
    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 1: CONTACT INFORMATION
  // Container: <name-form> inside apply-flow-section
  // Fields: lastName, firstName, middleNames, knownAs, email, phone, title
  // ════════════════════════════════════════════════════════════════════

  const fillContactInfo = (profile) => {
    console.log('[JAOS OracleCloud] === Section: Contact Information ===');

    // [OracleCloud] Last Name (required)
    fillTextByName('lastName', profile.lastName || profile.last_name || '');

    // [OracleCloud] First Name
    fillTextByName('firstName', profile.firstName || profile.first_name || '');

    // [OracleCloud] Middle Name (optional, not all portals have this)
    if (profile.middleName || profile.middle_name) {
      fillTextByName('middleNames', profile.middleName || profile.middle_name);
    }

    // [OracleCloud] Preferred Name (optional, not all portals)
    if (profile.preferredName || profile.known_as) {
      fillTextByName('knownAs', profile.preferredName || profile.known_as);
    }

    // [OracleCloud] Email — SKIP if prefilled (from Indeed/LinkedIn import)
    const emailEl = document.querySelector('input[name="email"]');
    if (emailEl && !emailEl.value.trim()) {
      fillText(emailEl, profile.email || '');
    } else {
      console.log('[JAOS OracleCloud] SKIP: email already prefilled');
    }

    // [OracleCloud] Phone Number (actual number, no name attr — use class)
    const phoneInput = document.querySelector('input.phone-row__input[type="tel"]');
    if (phoneInput && !phoneInput.value.trim()) {
      fillText(phoneInput, profile.phone || profile.phoneNumber || '');
    }

    // [OracleCloud] Title pill buttons (Mr./Mrs./Dr./Miss/Ms.)
    if (profile.title) {
      clickPillByText('ul.cx-select-pills-container[aria-label="Title"]', profile.title);
    }

    console.log('[JAOS OracleCloud] Contact Information done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 2: ADDRESS
  // Container: <address-form-v2> inside apply-flow-section
  // Strategy: Type address → poll Oracle Maps → click suggestion → cascade
  // Cascade fills: City, State, ZIP, County automatically
  // CRITICAL: Do NOT re-fill cascaded fields — it nukes the others
  // ════════════════════════════════════════════════════════════════════

  const fillAddress = async (profile) => {
    console.log('[JAOS OracleCloud] === Section: Address ===');

    const addressLine1 = profile.addressLine1 || profile.address_line_1 || profile.address || '';
    if (!addressLine1) {
      console.log('[JAOS OracleCloud] SKIP: no address data in profile');
      return;
    }

    // [OracleCloud] Clear existing Address Line 1 value first
    const addr1Input = document.querySelector('input.cx-select-input[name="addressLine1"]');
    if (!addr1Input) {
      console.log('[JAOS OracleCloud] SKIP: addressLine1 input not found');
      return;
    }

    const resetBtn = addr1Input
      .closest('.cx-select-container')
      ?.querySelector('button.icon-clear');
    if (resetBtn) {
      resetBtn.click();
      await delay(500);
    }

    // [OracleCloud] Type address with full keyboard events (Oracle Maps requires this)
    await typeWithKeyboard(addr1Input, addressLine1);

    // [OracleCloud] Poll for Oracle Maps suggestions and click first match
    console.log('[JAOS OracleCloud] Polling for Oracle Maps suggestions...');
    const cascaded = await pollAndClickSuggestion(addr1Input.id);

    if (cascaded) {
      // [OracleCloud] Wait for cascade to fill City/State/ZIP/County
      await delay(2000);

      // [OracleCloud] Check cascade results — only fill missing fields
      const cityVal = document.querySelector('input.cx-select-input[name="city"]')?.value;
      const stateVal = document.querySelector('input.cx-select-input[name="region2"]')?.value;

      console.log(`[JAOS OracleCloud] CASCADE result: City="${cityVal}", State="${stateVal}"`);

      if (cityVal && stateVal) {
        console.log('[JAOS OracleCloud] Cascade filled everything — NOT touching individual fields');
      } else {
        // [OracleCloud] Fill only what cascade missed
        if (!cityVal && (profile.city)) {
          await fillCxSelect('city', profile.city);
        }
        if (!stateVal && (profile.state)) {
          const stateCode = toStateCode(profile.state);
          await fillCxSelect('region2', stateCode);
        }
      }
    } else {
      // [OracleCloud] Fallback: Oracle Maps didn't respond — fill fields individually
      console.log('[JAOS OracleCloud] No suggestions — filling address fields individually');

      if (profile.city) await fillCxSelect('city', profile.city);
      if (profile.state) {
        const stateCode = toStateCode(profile.state);
        await fillCxSelect('region2', stateCode);
      }
      if (profile.zipCode || profile.zip_code || profile.postalCode) {
        await fillCxSelect('postalCode', profile.zipCode || profile.zip_code || profile.postalCode);
      }
    }

    // [OracleCloud] Address Line 2 — only fill if profile has data
    const addressLine2 = profile.addressLine2 || profile.address_line_2 || '';
    if (addressLine2) {
      fillTextBySelector('input[name="addressLine2"]', addressLine2);
    }

    console.log('[JAOS OracleCloud] Address done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 3: WORK EXPERIENCE
  // Container: <beautiful-timeline> → click "Add Experience" → <timeline-form-inline>
  // Fields: employerName, jobTitle, dates, country, state, city, responsibilities
  // Flexible: fills dates/responsibilities only if present on this portal
  // ════════════════════════════════════════════════════════════════════

  const fillWorkExperience = async (profile) => {
    console.log('[JAOS OracleCloud] === Section: Work Experience ===');

    // [OracleCloud] Get experience entries from profile
    const experiences = profile.experience_entries || profile.experiences || [];
    const firstExp = experiences[0];

    // [OracleCloud] Fallback to flat profile fields
    const employer = firstExp?.employer || firstExp?.company || profile.employer || profile.company || '';
    const jobTitle = firstExp?.title || firstExp?.job_title || profile.jobTitle || profile.job_title || '';

    if (!employer && !jobTitle) {
      console.log('[JAOS OracleCloud] SKIP: no work experience data in profile');
      return;
    }

    // [OracleCloud] Click "Add Experience" button to open the form
    const addExpBtn = document.getElementById('timeline-add-experience-button');
    if (!addExpBtn) {
      console.log('[JAOS OracleCloud] SKIP: Add Experience button not found');
      return;
    }
    addExpBtn.click();
    await delay(1000);

    // [OracleCloud] Employer Name (required)
    fillTextByName('employerName', employer);

    // [OracleCloud] Job Title
    fillTextByName('jobTitle', jobTitle);

    // [OracleCloud] Start/End Dates — only if cx-select date fields exist
    const hasDateFields = !!document.querySelector('input.cx-select-input[id^="month-startDate"]');
    if (hasDateFields) {
      console.log('[JAOS OracleCloud] Experience dates: FOUND');
      const startMonth = firstExp?.start_month || '';
      const startYear = firstExp?.start_year || '';
      const endMonth = firstExp?.end_month || '';
      const endYear = firstExp?.end_year || '';

      if (startMonth) { await fillCxSelect('month-startDate', startMonth, true); await delay(300); }
      if (startYear) { await fillCxSelect('year-startDate', startYear, true); await delay(300); }
      if (endMonth) { await fillCxSelect('month-endDate', endMonth, true); await delay(300); }
      if (endYear) { await fillCxSelect('year-endDate', endYear, true); await delay(300); }
    } else {
      console.log('[JAOS OracleCloud] Experience dates: NOT present on this portal');
    }

    // [OracleCloud] Employer Country → cascade → State → City
    const expCountry = firstExp?.country || profile.country || 'United States';
    await fillCxSelect('countryCode', expCountry);
    await delay(1000);

    // [OracleCloud] Wait for State field to cascade after Country selection
    const stateAppeared = await waitForStateCascade();
    if (stateAppeared) {
      const expState = firstExp?.state || profile.state || '';
      if (expState) {
        const stateCode = toStateCode(expState);
        await fillCxSelect('stateProvinceCode', stateCode);
        await delay(300);
      }
    }

    // [OracleCloud] Employer City (fill AFTER State to avoid cascade wipe)
    const expCity = firstExp?.city || '';
    if (expCity) fillTextByName('employerCity', expCity);

    // [OracleCloud] Responsibilities textarea (optional, not all portals)
    const responsibilities = firstExp?.description || firstExp?.responsibilities || '';
    if (responsibilities) {
      const textarea = document.querySelector('textarea[name="responsibilities"]');
      if (textarea) {
        fillText(textarea, responsibilities);
      }
    }

    // [OracleCloud] Click Save button to save the entry
    const saveBtn = document.querySelector('button.save-btn');
    if (saveBtn) {
      saveBtn.click();
      await delay(1500);
      console.log('[JAOS OracleCloud] Experience entry saved');
    }

    console.log('[JAOS OracleCloud] Work Experience done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 4: EDUCATION
  // Container: <beautiful-timeline> → click "Add Education" → <timeline-form-inline>
  // CRITICAL: Form structure varies per portal (Variant A vs B)
  //   Variant A (Fanatics): text Degree, has dates, no School/Status
  //   Variant B (HealthPartners): dropdown Degree, no dates, has School/Status
  // Adapter auto-detects and handles both
  // ════════════════════════════════════════════════════════════════════

  const fillEducation = async (profile) => {
    console.log('[JAOS OracleCloud] === Section: Education ===');

    // [OracleCloud] Get education entries from profile
    const educations = profile.education_entries || profile.educations || [];
    const firstEdu = educations[0];

    // [OracleCloud] Fallback to flat profile fields
    const degree = firstEdu?.degree || profile.degree || '';
    const major = firstEdu?.major || firstEdu?.field_of_study || profile.major || '';

    if (!degree && !major) {
      console.log('[JAOS OracleCloud] SKIP: no education data in profile');
      return;
    }

    // [OracleCloud] Click "Add Education" button to open the form
    const addEduBtn = document.getElementById('timeline-add-education-button');
    if (!addEduBtn) {
      console.log('[JAOS OracleCloud] SKIP: Add Education button not found');
      return;
    }
    addEduBtn.click();
    await delay(1000);

    // ── [OracleCloud] Degree: auto-detect text vs cx-select dropdown ──
    const degreeCx = document.querySelector('input.cx-select-input[name="contentItemId"]');
    const degreeTxt = document.querySelector('input.input-row__control[name="degreeName"]');

    if (degreeCx) {
      // [OracleCloud] Variant B: Degree is a cx-select dropdown
      // Options: Associate's, Bachelor's, Certificate, Doctorate, High School/GED, etc.
      console.log('[JAOS OracleCloud] Degree: DROPDOWN detected (Variant B)');
      await fillCxSelect('contentItemId', degree);
    } else if (degreeTxt) {
      // [OracleCloud] Variant A: Degree is a plain text input
      console.log('[JAOS OracleCloud] Degree: TEXT INPUT detected (Variant A)');
      fillTextByName('degreeName', degree);
    }
    await delay(300);

    // [OracleCloud] Major / Field of Study
    fillTextByName('major', major);

    // [OracleCloud] School (cx-select — only some portals have this)
    const schoolInput = document.querySelector('input.cx-select-input[name="educationalEstablishment"]');
    if (schoolInput) {
      const school = firstEdu?.school || firstEdu?.institution || profile.school || '';
      if (school) {
        const picked = await fillCxSelect('educationalEstablishment', school);
        if (!picked) console.log('[JAOS OracleCloud] School: no match — user fills manually');
      }
      await delay(300);
    }

    // [OracleCloud] Minor (text — only some portals)
    const minor = firstEdu?.minor || '';
    if (minor) fillTextByName('minor', minor);

    // [OracleCloud] Comments (textarea — only some portals)
    const comments = firstEdu?.comments || '';
    if (comments) fillTextByName('comments', comments);

    // [OracleCloud] Start/End Dates — only if cx-select date fields exist
    const hasDateFields = !!document.querySelector('input.cx-select-input[id^="month-startDate"]');
    if (hasDateFields) {
      console.log('[JAOS OracleCloud] Education dates: FOUND');
      const startMonth = firstEdu?.start_month || '';
      const startYear = firstEdu?.start_year || '';
      const endMonth = firstEdu?.end_month || '';
      const endYear = firstEdu?.end_year || '';

      if (startMonth) { await fillCxSelect('month-startDate', startMonth, true); await delay(300); }
      if (startYear) { await fillCxSelect('year-startDate', startYear, true); await delay(300); }
      if (endMonth) { await fillCxSelect('month-endDate', endMonth, true); await delay(300); }
      if (endYear) { await fillCxSelect('year-endDate', endYear, true); await delay(300); }
    } else {
      console.log('[JAOS OracleCloud] Education dates: NOT present on this portal');
    }

    // [OracleCloud] Country → cascade → State → City
    const eduCountry = firstEdu?.country || profile.country || 'United States';
    await fillCxSelect('countryCode', eduCountry);
    await delay(1000);

    const stateAppeared = await waitForStateCascade();
    if (stateAppeared) {
      const eduState = firstEdu?.state || '';
      if (eduState) {
        const stateCode = toStateCode(eduState);
        await fillCxSelect('stateProvinceCode', stateCode);
        await delay(300);
      }
    }

    // [OracleCloud] City (fill AFTER State to avoid cascade wipe)
    const eduCity = firstEdu?.city || '';
    if (eduCity) fillTextByName('city', eduCity);

    // [OracleCloud] Status pills (only some portals: In Progress/Enrolled, Completed, Withdrew)
    const statusPills = document.querySelectorAll('timeline-form-inline button.cx-select-pill-section');
    if (statusPills.length > 0) {
      const status = firstEdu?.status || 'Completed';
      clickPillByText('timeline-form-inline', status);
    }

    // [OracleCloud] Click Save button to save the entry
    const saveBtn = document.querySelector('button.save-btn');
    if (saveBtn) {
      saveBtn.click();
      await delay(1500);
      console.log('[JAOS OracleCloud] Education entry saved');
    }

    console.log('[JAOS OracleCloud] Education done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 5: SUPPORTING DOCUMENTS
  // Custom elements: <resume-upload-button>, <cover-letter-upload-button>
  // Upload via DataTransfer API + Knockout's onFileSelected handler
  // ════════════════════════════════════════════════════════════════════

  const fillDocuments = async (profile, resumeFile, coverLetterFile) => {
    console.log('[JAOS OracleCloud] === Section: Supporting Documents ===');

    // [OracleCloud] Resume upload
    if (resumeFile) {
      const resumeInput = document.querySelector('resume-upload-button input[type="file"]');
      if (resumeInput) {
        const dt = new DataTransfer();
        dt.items.add(resumeFile);
        resumeInput.files = dt.files;
        resumeInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[JAOS OracleCloud] Resume uploaded: ${resumeFile.name}`);
      } else {
        console.log('[JAOS OracleCloud] SKIP: resume file input not found');
      }
      await delay(500);
    }

    // [OracleCloud] Cover Letter upload
    if (coverLetterFile) {
      const coverInput = document.querySelector('cover-letter-upload-button input[type="file"]');
      if (coverInput) {
        const dt = new DataTransfer();
        dt.items.add(coverLetterFile);
        coverInput.files = dt.files;
        coverInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log(`[JAOS OracleCloud] Cover Letter uploaded: ${coverLetterFile.name}`);
      } else {
        // [OracleCloud] Fallback: find second file input that isn't the resume one
        const resumeInput = document.querySelector('resume-upload-button input[type="file"]');
        const allInputs = document.querySelectorAll('input[type="file"][name="attachment-upload"]');
        for (const inp of allInputs) {
          if (inp === resumeInput) continue;
          const dt = new DataTransfer();
          dt.items.add(coverLetterFile);
          inp.files = dt.files;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`[JAOS OracleCloud] Cover Letter uploaded (fallback): ${coverLetterFile.name}`);
          break;
        }
      }
    }

    // [OracleCloud] URL links (LinkedIn, GitHub, Portfolio)
    const urls = profile.urls || profile.links || {};
    const urlInputs = document.querySelectorAll('input[name^="siteLink"]');
    const urlValues = [
      urls.linkedin || profile.linkedin || '',
      urls.github || profile.github || '',
      urls.portfolio || profile.website || '',
    ].filter(Boolean);

    urlInputs.forEach((input, i) => {
      if (urlValues[i] && !input.value.trim()) {
        fillText(input, urlValues[i]);
      }
    });

    console.log('[JAOS OracleCloud] Supporting Documents done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 6: DISABILITY INFORMATION
  // Radio group with 3 options — click by value attribute
  // Default: "I do not want to answer" (ORA_PER_NO_ANSWER_US)
  // ════════════════════════════════════════════════════════════════════

  const fillDisability = (profile) => {
    console.log('[JAOS OracleCloud] === Section: Disability Information ===');

    // [OracleCloud] Map profile disability value, or use safe default
    const disabilityValue = profile.disability || EEO_DEFAULTS.disability;

    const radios = document.querySelectorAll('input[type="radio"]');
    for (const radio of radios) {
      if (radio.value === disabilityValue) {
        radio.click();
        console.log(`[JAOS OracleCloud] Disability selected: ${disabilityValue}`);
        return;
      }
    }
    console.log('[JAOS OracleCloud] SKIP: disability radio not found');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 7: DIVERSITY INFORMATION
  // Ethnicity: checkbox group (multi-select)
  // Gender: cx-select dropdown (Female, Male, Nonbinary, Prefer not to Answer, X-Gender)
  // ════════════════════════════════════════════════════════════════════

  // [OracleCloud] Find ethnicity checkbox by its visible LABEL TEXT, not hardcoded ID
  // DOM: input[id^="dq-option"] → label[for=id] → span.apply-flow-input-checkbox__label
  // IDs like dq-option-5 come from Oracle's lookupCode — may vary per portal
  // Label text ("Asian", "White", etc.) is the reliable anchor
  const findEthnicityCheckboxByLabel = (searchText) => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"][id^="dq-option"]');
    const searchLower = searchText.toLowerCase();

    for (const cb of checkboxes) {
      // Read label via label[for] → span.apply-flow-input-checkbox__label
      const lbl = document.querySelector(`label[for="${cb.id}"]`);
      const labelText = (
        lbl?.querySelector('span.apply-flow-input-checkbox__label')?.textContent?.trim()
        || lbl?.textContent?.trim()
        || ''
      ).toLowerCase();

      if (!labelText) continue;

      // Exact match first
      if (labelText === searchLower) return cb;

      // Partial match — "asian" matches "Asian", "black" matches "Black or African American"
      if (labelText.includes(searchLower) || searchLower.includes(labelText)) return cb;
    }
    return null;
  };

  const fillDiversity = async (profile) => {
    console.log('[JAOS OracleCloud] === Section: Diversity Information ===');

    // ── [OracleCloud] Ethnicity/Race checkboxes ──
    // Strategy 1: Try "Prefer not to answer" by label text (some portals have it)
    const prefNoCb = findEthnicityCheckboxByLabel('prefer not to answer');
    if (prefNoCb) {
      if (!prefNoCb.checked) prefNoCb.click();
      console.log('[JAOS OracleCloud] Ethnicity: "Prefer not to answer" checked');
    } else {
      // Strategy 2: No "Prefer not to answer" — match profile ethnicity by label text
      const profileEthnicity = profile.ethnicity || profile.race || '';
      if (profileEthnicity) {
        const cb = findEthnicityCheckboxByLabel(profileEthnicity);
        if (cb && !cb.checked) {
          cb.click();
          const lbl = document.querySelector(`label[for="${cb.id}"]`);
          const labelText = lbl?.querySelector('span.apply-flow-input-checkbox__label')?.textContent?.trim() || cb.id;
          console.log(`[JAOS OracleCloud] Ethnicity: "${profileEthnicity}" → "${labelText}" checked`);
        } else if (!cb) {
          console.log(`[JAOS OracleCloud] Ethnicity: "${profileEthnicity}" — no matching checkbox found`);
        }
      } else {
        console.log('[JAOS OracleCloud] No ethnicity in profile — leaving blank (voluntary)');
      }
    }

    await delay(300);

    // ── [OracleCloud] Gender cx-select dropdown ──
    // Options vary per portal: Female, Male, Nonbinary, Prefer not to Answer, X-Gender
    const genderSearch = profile.gender || EEO_DEFAULTS.gender;
    await fillCxSelect('GENDER', genderSearch);

    console.log('[JAOS OracleCloud] Diversity Information done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 8: VETERAN INFORMATION
  // cx-select dropdown: Not a Protected Veteran, Declines to Self-Identify, Protected Veteran
  // ════════════════════════════════════════════════════════════════════

  const fillVeteran = async (profile) => {
    console.log('[JAOS OracleCloud] === Section: Veteran Information ===');

    // [OracleCloud] Map profile veteran status, or use safe default
    const veteranSearch = profile.veteranStatus || profile.veteran_status || EEO_DEFAULTS.veteran;
    await fillCxSelect('VETERAN', veteranSearch);

    console.log('[JAOS OracleCloud] Veteran Information done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 9: E-SIGNATURE
  // Plain text input — full name as electronic signature (required)
  // ════════════════════════════════════════════════════════════════════

  const fillESignature = (profile) => {
    console.log('[JAOS OracleCloud] === Section: E-Signature ===');

    const firstName = profile.firstName || profile.first_name || '';
    const lastName = profile.lastName || profile.last_name || '';
    const fullName = profile.fullName || profile.full_name || `${firstName} ${lastName}`.trim();

    if (fullName) {
      fillTextByName('fullName', fullName);
    }

    console.log('[JAOS OracleCloud] E-Signature done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] MAIN FILL ORCHESTRATOR
  // Runs all sections sequentially (single scrollable page)
  // ════════════════════════════════════════════════════════════════════

  const fillCustom = async (ctx) => {
    const { profile } = ctx;
    const resumeFile = ctx.resumeFile || null;
    const coverLetterFile = ctx.coverLetterFile || null;

    console.log('[JAOS OracleCloud] ═══ STARTING FULL PAGE AUTOFILL ═══');

    // [OracleCloud] Section 1: Contact Information
    fillContactInfo(profile);
    await delay(500);

    // [OracleCloud] Section 2: Address (async — Oracle Maps polling)
    await fillAddress(profile);
    await delay(500);

    // [OracleCloud] Section 3: Work Experience (async — multi-entry)
    await fillWorkExperience(profile);
    await delay(500);

    // [OracleCloud] Section 4: Education (async — multi-entry + variant detection)
    await fillEducation(profile);
    await delay(500);

    // [OracleCloud] Section 5: Supporting Documents (resume + cover letter)
    await fillDocuments(profile, resumeFile, coverLetterFile);
    await delay(300);

    // [OracleCloud] Section 6: Disability Information
    fillDisability(profile);
    await delay(300);

    // [OracleCloud] Section 7: Diversity Information (Ethnicity + Gender)
    await fillDiversity(profile);
    await delay(300);

    // [OracleCloud] Section 8: Veteran Information
    await fillVeteran(profile);
    await delay(300);

    // [OracleCloud] Section 9: E-Signature
    fillESignature(profile);

    console.log('[JAOS OracleCloud] ═══ FULL PAGE AUTOFILL COMPLETE ═══');
    console.log('[JAOS OracleCloud] Review all sections, then submit!');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] FLOW DEFINITION
  // Oracle Cloud uses a single scrollable page (not multi-step)
  // One big flow entry that runs fillCustom
  // ════════════════════════════════════════════════════════════════════

  const getFlow = () => {
    return [
      {
        id: 'application',
        label: 'Oracle Cloud Application',

        // [OracleCloud] Wait for Knockout rendering to complete
        waitFor: async (ctx) => {
          const { waitForElement, waitForDomStable } = ctx.utils;

          // Wait for the main form container
          try {
            await waitForElement('name-form, address-form-v2, apply-flow-section', document, 10000);
          } catch (_e) {
            // Form might already be loaded
          }

          // Wait for Knockout bindings to finish rendering
          await waitForDomStable(500, 5000);
        },

        // [OracleCloud] action runs BEFORE scan → LLM → fill pipeline
        // We fill ALL fields here using our custom logic (cx-select, keyboard events, etc.)
        // After this, the scanner finds fields already filled → LLM skips them → no generic fill
        action: async (ctx) => {
          await fillCustom(ctx);
        },

        getFormRoot: () => getFormRoot(),

        // [OracleCloud] After custom fill, scan finds filled fields → LLM skips
        // But filter out noise so progress reporting is clean
        augmentScan: async (ctx, scanResult) => {
          // [OracleCloud] Filter out non-fillable elements
          scanResult.fields = scanResult.fields.filter((f) => {
            if (f.isFileInput) return false;
            if (f.element?.classList?.contains('input-row__hidden-control') &&
                f.element?.type === 'checkbox') return false;
            return true;
          });
          // [OracleCloud] Remove widgets inside import profile section (LinkedIn/Indeed buttons)
          scanResult.widgets = scanResult.widgets.filter((w) => {
            const el = w.element;
            if (!el) return true;
            // Skip anything inside the import profile section
            if (el.closest('.apply-flow-profile-import') ||
                el.closest('[class*="import-profile"]') ||
                el.closest('[class*="profile-import"]')) return false;
            return true;
          });
        },

        // [OracleCloud] Post-fill: trigger Knockout validation
        afterFill: async (ctx) => {
          const active = document.activeElement;
          if (active && active !== document.body) {
            active.blur();
          }
          await ctx.utils.waitForDomStable(300, 2000);
        },
      },
    ];
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] REGISTER ADAPTER
  // ════════════════════════════════════════════════════════════════════

  // [OracleCloud] Prevent duplicate registration
  if (registry.some((a) => a.name === 'oraclecloud')) return;

  registry.push({
    name: 'oraclecloud',
    detect,
    getFormRoot,
    getFlow,

    // [OracleCloud] Overwrite prefilled fields except email (preserved from import)
    shouldOverwrite: (field) => {
      const name = field.name || field.element?.name || '';
      if (name === 'email') return false;
      return true;
    },
  });

  console.log('[JAOS OracleCloud] Adapter registered (v2)');
})();
