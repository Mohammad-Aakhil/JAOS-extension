/**
 * adapters/oraclecloud-v2.js — Oracle Cloud HCM Recruiting adapter (v2 architecture)
 *
 * Framework: Knockout.js + Oracle JET (NOT React — no fiber bridge needed)
 * Portal layout: Single scrollable page OR multi-step paginated (NEXT button)
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
 *
 * References:
 *  - oraclecloud-rules.md — complete field map + fill rules
 *  - oraclecloud-seed-scripts.md — verified seed test scripts
 *
 * Flow: detect → waitForFormReady → fillCustom (page-aware: detect sections → fill → NEXT → repeat)
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

  // [OracleCloud] Canadian Province name → 2-letter code lookup
  const CA_PROVINCES = {
    'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB',
    'new brunswick': 'NB', 'newfoundland and labrador': 'NL',
    'northwest territories': 'NT', 'nova scotia': 'NS', 'nunavut': 'NU',
    'ontario': 'ON', 'prince edward island': 'PE', 'quebec': 'QC',
    'saskatchewan': 'SK', 'yukon': 'YT',
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
  // [OracleCloud] LOG LEVEL CONTROL
  // Set to 'verbose' for full debug output, 'info' for section-level,
  // 'warn' (default) for warnings only, 'error' for errors only
  // ════════════════════════════════════════════════════════════════════

  const LOG_LEVEL = 'warn'; // 'verbose' | 'info' | 'warn' | 'error'
  const _LEVELS = { verbose: 0, info: 1, warn: 2, error: 3 };
  const _lvl = _LEVELS[LOG_LEVEL] ?? 2;

  const log = (...args) => { if (_lvl <= 1) log('', ...args); };
  const logVerbose = (...args) => { if (_lvl <= 0) log('', ...args); };
  const logWarn = (...args) => { if (_lvl <= 2) logWarn('', ...args); };
  const logError = (...args) => { if (_lvl <= 3) console.error('[JAOS OracleCloud]', ...args); };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: delay
  // ════════════════════════════════════════════════════════════════════

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Visibility check
  // On multi-step portals, Oracle renders ALL sections in DOM but
  // CSS-hides non-active pages. querySelector finds hidden elements.
  // This checks if an element is actually visible to the user.
  // ════════════════════════════════════════════════════════════════════

  const isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    // Zero-size elements are hidden (display:none, visibility:hidden, or off-screen)
    if (rect.width === 0 && rect.height === 0) return false;
    // Check computed style for common hiding methods
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  };

  // [OracleCloud] Find element by selector, but only if visible
  const findVisible = (selector) => {
    const els = document.querySelectorAll(selector);
    for (const el of els) {
      if (isVisible(el)) return el;
    }
    return null;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Scroll to element
  // Smooth scroll so the user can watch fields being filled
  // ════════════════════════════════════════════════════════════════════

  const scrollToEl = (el) => {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Human-like typing
  // Types value char-by-char with randomized delay (40-80ms per char)
  // Dispatches input event per keystroke for Knockout to track
  // ════════════════════════════════════════════════════════════════════

  const typeHumanLike = async (el, value) => {
    if (!el || !value) return false;
    scrollToEl(el);
    await delay(150);
    el.focus();
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    for (const char of value) {
      el.value += char;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(30 + Math.random() * 40); // 30-70ms per char
    }

    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    logVerbose(`TYPED: ${el.name || el.id} = "${value}"`);
    return true;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Fill plain text input (instant, for short values)
  // Sets .value + dispatches input/change/blur events for Knockout binding
  // ════════════════════════════════════════════════════════════════════

  const fillText = (el, value) => {
    if (!el || !value) return false;
    scrollToEl(el);
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    logVerbose(`FILLED text: ${el.name || el.id} = "${value}"`);
    return true;
  };

  // [OracleCloud] Fill text input by name attribute (human-like typing)
  const fillTextByName = async (name, value) => {
    const el = document.querySelector(`input[name="${name}"]`)
      || document.querySelector(`textarea[name="${name}"]`);
    if (!el) {
      logVerbose(`SKIP: ${name} not found`);
      return false;
    }
    return await typeHumanLike(el, value);
  };

  // [OracleCloud] Fill text input by selector (human-like typing)
  const fillTextBySelector = async (selector, value) => {
    const el = document.querySelector(selector);
    if (!el) {
      logVerbose(`SKIP: ${selector} not found`);
      return false;
    }
    return await typeHumanLike(el, value);
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
      logVerbose(` SKIP cx-select: ${nameOrId} not found`);
      return false;
    }

    // [OracleCloud] Scroll to element so user can watch
    scrollToEl(input);
    await delay(200);

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

    // [OracleCloud] Poll for listbox options (no fixed timeout — exits as soon as options appear)
    const listboxId = input.id + '-listbox';
    let listbox = null;
    let items = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      await delay(200);
      listbox = document.getElementById(listboxId);
      if (listbox) {
        items = listbox.querySelectorAll('div[role="gridcell"]');
        if (items.length > 0) break;
      }
    }

    if (items.length > 0) {
      logVerbose(` cx-select ${nameOrId}: clicking "${items[0].textContent.trim()}"`);
      items[0].click();
      return true;
    }

    logWarn(` cx-select ${nameOrId}: 0 results for "${searchText}"`);
    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Generate fuzzy fallback search candidates
  // Used when exact cx-select search fails — tries partial matches
  // ════════════════════════════════════════════════════════════════════

  const DEGREE_ALIASES = {
    "bachelor's": ['Bachelor', 'Bachelors', 'Bachelor of Science', 'BS', 'BA', 'BSc'],
    "master's": ['Master', 'Masters', 'Master of Science', 'MS', 'MA', 'MBA', 'MSc'],
    "associate's": ['Associate', 'Associates', 'Associate of Science', 'AS', 'AA'],
    "doctorate": ['Doctor', 'PhD', 'Doctor of Philosophy', 'Doctoral'],
    "phd": ['Doctorate', 'Doctor of Philosophy', 'Doctoral'],
    "mba": ['Master of Business Administration', "Master's"],
    "b.s.": ['Bachelor of Science', 'BS', 'BSc', "Bachelor's"],
    "b.a.": ['Bachelor of Arts', 'BA', "Bachelor's"],
    "m.s.": ['Master of Science', 'MS', 'MSc', "Master's"],
    "m.a.": ['Master of Arts', 'MA', "Master's"],
    "bs": ['Bachelor of Science', "Bachelor's", 'BSc'],
    "ba": ['Bachelor of Arts', "Bachelor's"],
    "ms": ['Master of Science', "Master's", 'MSc'],
    "ma": ['Master of Arts', "Master's"],
  };

  const generateFuzzyFallbacks = (text) => {
    const candidates = [];
    if (!text) return candidates;

    // First word only: "University of Texas" → "University"
    const firstWord = text.split(/\s+/)[0];
    if (firstWord !== text && firstWord.length >= 3) candidates.push(firstWord);

    // Without parenthetical: "Bachelor of Science (B.S.)" → "Bachelor of Science"
    const noParens = text.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (noParens !== text && noParens.length >= 3) candidates.push(noParens);

    // Without punctuation: "B.S." → "BS"
    const noPunct = text.replace(/[.,'"]/g, '').trim();
    if (noPunct !== text && noPunct.length >= 2) candidates.push(noPunct);

    // Degree abbreviation ↔ full name
    const lower = text.toLowerCase();
    for (const [key, alts] of Object.entries(DEGREE_ALIASES)) {
      if (key === lower) { candidates.push(...alts); break; }
      for (const alt of alts) {
        if (alt.toLowerCase() === lower) { candidates.push(key.charAt(0).toUpperCase() + key.slice(1)); break; }
      }
    }

    // Deduplicate, exclude original
    return [...new Set(candidates)].filter(c => c.toLowerCase() !== text.toLowerCase());
  };

  // [OracleCloud] Retry cx-select with fuzzy fallback candidates
  const fillCxSelectWithRetry = async (nameOrId, searchText, byId = false) => {
    // Attempt 1: exact search text
    let filled = await fillCxSelect(nameOrId, searchText, byId);
    if (filled) return true;

    // Generate and try fallback candidates
    const candidates = generateFuzzyFallbacks(searchText);
    for (const candidate of candidates) {
      filled = await fillCxSelect(nameOrId, candidate, byId);
      if (filled) {
        logVerbose(`cx-select ${nameOrId}: fuzzy match "${candidate}" (original: "${searchText}")`);
        return true;
      }
    }

    logWarn(`cx-select ${nameOrId}: all candidates failed for "${searchText}"`);
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

  const pollAndClickSuggestion = async (inputId, maxAttempts = 12, intervalMs = 200) => {
    for (let i = 0; i < maxAttempts; i++) {
      await delay(intervalMs);
      const listbox = document.getElementById(inputId + '-listbox');
      if (listbox) {
        const items = listbox.querySelectorAll('div[role="gridcell"]');
        if (items.length > 0) {
          logVerbose(` Address suggestion: clicking "${items[0].textContent.trim()}"`);
          items[0].click();
          return true;
        }
      }
    }
    logWarn(' No Oracle Maps suggestions found after polling');
    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Convert state name to 2-letter code
  // Oracle Cloud State dropdowns use 2-letter codes (TX not Texas)
  // ════════════════════════════════════════════════════════════════════

  const toStateCode = (stateNameOrCode, country) => {
    if (!stateNameOrCode) return null;
    const normalized = stateNameOrCode.trim().toLowerCase();
    // Already a 2-letter code
    if (/^[A-Z]{2}$/i.test(stateNameOrCode.trim())) return stateNameOrCode.trim().toUpperCase();
    // Country-aware lookup
    const countryLower = (country || '').toLowerCase();
    if (countryLower.includes('canada')) {
      return CA_PROVINCES[normalized] || stateNameOrCode.trim();
    }
    // Default: US lookup, fallback to raw value for international
    return US_STATES[normalized] || stateNameOrCode.trim();
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Wait for State field cascade
  // After selecting Country, State field appears dynamically
  // ════════════════════════════════════════════════════════════════════

  const waitForStateCascade = async (maxAttempts = 10, intervalMs = 300) => {
    for (let i = 0; i < maxAttempts; i++) {
      if (document.querySelector('input.cx-select-input[name="stateProvinceCode"]')) {
        logVerbose('State field appeared after cascade');
        return true;
      }
      await delay(intervalMs);
    }
    logVerbose('State field did not appear — may not be required');
    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Click pill button by text
  // Used for: Title (Mr./Mrs./Dr.), Education Status (Completed)
  // ════════════════════════════════════════════════════════════════════

  const clickPillByText = (containerSelector, text) => {
    const container = document.querySelector(containerSelector);
    if (container) scrollToEl(container);
    const pills = document.querySelectorAll(`${containerSelector} button.cx-select-pill-section`);
    for (const btn of pills) {
      const pillText = btn.querySelector('.cx-select-pill-name')?.textContent?.trim();
      if (pillText && pillText.toLowerCase() === text.toLowerCase()) {
        btn.click();
        logVerbose(` Pill selected: "${pillText}"`);
        return true;
      }
    }
    logVerbose(` Pill "${text}" not found in ${containerSelector}`);
    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 1: CONTACT INFORMATION
  // Container: <name-form> inside apply-flow-section
  // Fields: lastName, firstName, middleNames, knownAs, email, phone, title
  // ════════════════════════════════════════════════════════════════════

  const fillContactInfo = async (profile) => {
    log('=== Section: Contact Information ===');

    // [OracleCloud] Last Name (required)
    await fillTextByName('lastName', profile.lastName || profile.last_name || '');

    // [OracleCloud] First Name
    await fillTextByName('firstName', profile.firstName || profile.first_name || '');

    // [OracleCloud] Middle Name (optional, not all portals have this)
    if (profile.middleName || profile.middle_name) {
      await fillTextByName('middleNames', profile.middleName || profile.middle_name);
    }

    // [OracleCloud] Preferred Name (optional, not all portals)
    if (profile.preferredName || profile.known_as) {
      await fillTextByName('knownAs', profile.preferredName || profile.known_as);
    }

    // [OracleCloud] Email — SKIP if prefilled (from Indeed/LinkedIn import)
    const emailEl = document.querySelector('input[name="email"]');
    if (emailEl && !emailEl.value.trim()) {
      await typeHumanLike(emailEl, profile.email || '');
    } else {
      logVerbose(' SKIP: email already prefilled');
    }

    // [OracleCloud] Phone Number (actual number, no name attr — use class)
    const phoneInput = document.querySelector('input.phone-row__input[type="tel"]');
    if (phoneInput && !phoneInput.value.trim()) {
      await typeHumanLike(phoneInput, profile.phone || profile.phoneNumber || '');
    }

    // [OracleCloud] Title pill buttons (Mr./Mrs./Dr./Miss/Ms.)
    // Map gender to title if no explicit title in profile
    const titleText = profile.title
      || (profile.gender?.toLowerCase() === 'male' ? 'Mr.'
        : profile.gender?.toLowerCase() === 'female' ? 'Mrs.' : null);
    if (titleText) {
      clickPillByText('ul.cx-select-pills-container[aria-label="Title"]', titleText);
    }

    log('Contact Information done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 2: ADDRESS
  // Container: <address-form-v2> inside apply-flow-section
  // Strategy: Type address → poll Oracle Maps → click suggestion → cascade
  // Cascade fills: City, State, ZIP, County automatically
  // CRITICAL: Do NOT re-fill cascaded fields — it nukes the others
  // ════════════════════════════════════════════════════════════════════

  // [OracleCloud] Helper: read current value of a cx-select field
  const getCxValue = (name) =>
    document.querySelector(`input.cx-select-input[name="${name}"]`)?.value?.trim() || '';

  const fillAddress = async (profile) => {
    log('=== Section: Address ===');

    const addressLine1 = profile.addressLine1 || profile.address_line_1 || profile.address || '';
    const zip = profile.zipCode || profile.zip_code || profile.postalCode || '';
    const city = profile.city || '';
    const state = profile.state || '';

    if (!addressLine1 && !zip && !city && !state) {
      logVerbose('SKIP: no address data in profile');
      return;
    }

    // ── Step 1: Fill Address Line 1 ──
    const addr1Input = document.querySelector('input.cx-select-input[name="addressLine1"]');
    if (addr1Input && addressLine1) {
      // [OracleCloud] Clear existing value
      const resetBtn = addr1Input
        .closest('.cx-select-container')
        ?.querySelector('button.icon-clear');
      if (resetBtn) {
        resetBtn.click();
        await stableWait(200, 1500);
      }

      // [OracleCloud] Try Oracle Maps autocomplete first (keyboard events)
      await typeWithKeyboard(addr1Input, addressLine1);
      logVerbose('Polling for Oracle Maps suggestions...');
      const cascaded = await pollAndClickSuggestion(addr1Input.id);

      if (cascaded) {
        // [OracleCloud] Wait for cascade to propagate (poll until ZIP appears)
        await waitForCascade('postalCode', 3000);
        const afterCascade = { zip: getCxValue('postalCode'), city: getCxValue('city'), state: getCxValue('region2'), county: getCxValue('region1') };
        logVerbose('CASCADE from Address Line 1:', JSON.stringify(afterCascade));

        if (afterCascade.zip && afterCascade.city && afterCascade.state) {
          logVerbose('Full cascade — skipping individual address fields');
          // Fill Address Line 2 if present
          const addressLine2 = profile.addressLine2 || profile.address_line_2 || '';
          if (addressLine2) await fillTextBySelector('input[name="addressLine2"]', addressLine2);
          log('Address done');
          return;
        }
      } else {
        logVerbose('No Oracle Maps suggestions — filling fields individually');
      }
    }

    // ── Step 2: Fill Address Line 2 (plain text, no cascade) ──
    const addressLine2 = profile.addressLine2 || profile.address_line_2 || '';
    if (addressLine2) {
      await fillTextBySelector('input[name="addressLine2"]', addressLine2);
    }

    // ── Step 3: CASCADE-AWARE fill order: ZIP → City → State → County ──
    // ZIP cascades City + County + State (format: "14214, Buffalo, Erie, NY")
    // City cascades County + State (format: "Buffalo, Erie, NY")
    // State is individual (2-letter code, no cascade)
    // County cascades to State too (format: "Erie, NY")
    // After EACH fill: wait for cascade, re-check remaining fields

    // ── 3a: ZIP (biggest cascade — fills City, County, State) ──
    if (zip && !getCxValue('postalCode')) {
      logVerbose(`Filling ZIP: "${zip}"`);
      const filled = await fillCxSelect('postalCode', zip);
      if (filled) {
        await waitForCascade('city', 5000); // wait for cascade propagation
        const after = { city: getCxValue('city'), state: getCxValue('region2'), county: getCxValue('region1') };
        logVerbose('After ZIP cascade:', JSON.stringify(after));
      }
    }

    // ── 3b: City (cascades County + State) — only if still empty ──
    if (city && !getCxValue('city')) {
      logVerbose(`Filling City: "${city}"`);
      const filled = await fillCxSelect('city', city);
      if (filled) {
        await waitForCascade('region2', 3000); // wait for state to cascade
        const after = { state: getCxValue('region2'), county: getCxValue('region1') };
        logVerbose('After City cascade:', JSON.stringify(after));
      }
    } else if (getCxValue('city')) {
      logVerbose('City already filled — skipping');
    }

    // ── 3c: State (individual, no cascade) — only if still empty ──
    if (state && !getCxValue('region2')) {
      const stateCode = toStateCode(state, profile.country);
      logVerbose(`Filling State: "${stateCode}"`);
      await fillCxSelect('region2', stateCode);
    } else if (getCxValue('region2')) {
      logVerbose('State already filled — skipping');
    }

    // ── 3d: County — only if still empty (we don't have county in profile, cascades fill it) ──
    if (!getCxValue('region1')) {
      logVerbose('County still empty — leaving for cascade or manual');
    } else {
      logVerbose(`County already filled: "${getCxValue('region1')}"`);
    }

    log('Address done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 3: WORK EXPERIENCE
  // Container: <beautiful-timeline> → click "Add Experience" → <timeline-form-inline>
  // Fields: employerName, jobTitle, dates, country, state, city, responsibilities
  // Flexible: fills dates/responsibilities only if present on this portal
  // ════════════════════════════════════════════════════════════════════

  // [OracleCloud] Fill a single work experience entry (inline form must be open)
  const fillSingleExperience = async (exp, profile) => {
    const employer = exp?.employer || exp?.company || '';
    const jobTitle = exp?.title || exp?.job_title || '';

    // [OracleCloud] Employer Name (required)
    if (employer) await fillTextByName('employerName', employer);

    // [OracleCloud] Job Title
    if (jobTitle) await fillTextByName('jobTitle', jobTitle);

    // [OracleCloud] Start/End Dates — only if cx-select date fields exist
    const hasDateFields = !!document.querySelector('input.cx-select-input[id^="month-startDate"]');
    if (hasDateFields) {
      logVerbose('Experience dates: FOUND');
      const startMonth = exp?.start_month || '';
      const startYear = exp?.start_year || '';
      const endMonth = exp?.end_month || '';
      const endYear = exp?.end_year || '';

      if (startMonth) { await fillCxSelect('month-startDate', startMonth, true); await stableWait(200, 1500); }
      if (startYear) { await fillCxSelect('year-startDate', startYear, true); await stableWait(200, 1500); }
      if (endMonth) { await fillCxSelect('month-endDate', endMonth, true); await stableWait(200, 1500); }
      if (endYear) { await fillCxSelect('year-endDate', endYear, true); await stableWait(200, 1500); }
    } else {
      logVerbose('Experience dates: NOT present on this portal');
    }

    // [OracleCloud] Employer Country → cascade → State → City
    const expCountry = exp?.country || profile.country || 'United States';
    await fillCxSelect('countryCode', expCountry);

    // [OracleCloud] Wait for State field to cascade after Country selection
    const stateAppeared = await waitForStateCascade();
    if (stateAppeared) {
      const expState = exp?.state || profile.state || '';
      if (expState) {
        const expCountryForCode = exp?.country || profile.country || 'United States';
        const stateCode = toStateCode(expState, expCountryForCode);
        await fillCxSelect('stateProvinceCode', stateCode);
        await stableWait(200, 1500);
      }
    }

    // [OracleCloud] Employer City (fill AFTER State to avoid cascade wipe)
    const expCity = exp?.city || '';
    if (expCity) await fillTextByName('employerCity', expCity);

    // [OracleCloud] Responsibilities textarea (optional, not all portals)
    const responsibilities = exp?.description || exp?.responsibilities || '';
    if (responsibilities) {
      const textarea = document.querySelector('textarea[name="responsibilities"]');
      if (textarea) {
        await typeHumanLike(textarea, responsibilities);
      }
    }
  };

  const fillWorkExperience = async (profile) => {
    log('=== Section: Work Experience ===');

    // [OracleCloud] Build entries list — profile arrays first, flat fields as fallback
    const entries = profile.experience_entries || profile.experiences || [];
    if (entries.length === 0) {
      const employer = profile.employer || profile.company || '';
      const jobTitle = profile.jobTitle || profile.job_title || '';
      if (employer || jobTitle) {
        entries.push({ employer, title: jobTitle, country: profile.country, state: profile.state, city: profile.city });
      }
    }

    if (entries.length === 0) {
      logVerbose('SKIP: no work experience data in profile');
      return;
    }

    for (let i = 0; i < entries.length; i++) {
      log(`Work Experience entry ${i + 1}/${entries.length}`);

      // [OracleCloud] Click "Add Experience" button to open inline form
      const addExpBtn = document.getElementById('timeline-add-experience-button');
      if (!addExpBtn) {
        logVerbose(`SKIP: Add Experience button not found for entry ${i + 1}`);
        break;
      }
      addExpBtn.click();
      await stableWait(300, 3000);

      // Verify form opened
      const formOpened = !!document.querySelector('timeline-form-inline input[name="employerName"]');
      if (!formOpened) {
        logWarn(`Experience form did not open for entry ${i + 1} — portal may have a limit`);
        break;
      }

      await fillSingleExperience(entries[i], profile);

      // [OracleCloud] Click Save button to save the entry
      const saveBtn = document.querySelector('button.save-btn');
      if (saveBtn) {
        saveBtn.click();
        await stableWait(400, 3000);
        logVerbose(`Experience entry ${i + 1} saved`);
      }
    }

    log('Work Experience done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 4: EDUCATION
  // Container: <beautiful-timeline> → click "Add Education" → <timeline-form-inline>
  // CRITICAL: Form structure varies per portal (Variant A vs B)
  //   Variant A (Fanatics): text Degree, has dates, no School/Status
  //   Variant B (HealthPartners): dropdown Degree, no dates, has School/Status
  // Adapter auto-detects and handles both
  // ════════════════════════════════════════════════════════════════════

  // [OracleCloud] Fill a single education entry (inline form must be open)
  const fillSingleEducation = async (edu, profile) => {
    const degree = edu?.degree || '';
    const major = edu?.major || edu?.field_of_study || '';

    // ── [OracleCloud] Degree: auto-detect text vs cx-select dropdown ──
    const degreeCx = document.querySelector('input.cx-select-input[name="contentItemId"]');
    const degreeTxt = document.querySelector('input.input-row__control[name="degreeName"]');

    if (degreeCx && degree) {
      logVerbose('Degree: DROPDOWN detected (Variant B)');
      await fillCxSelectWithRetry('contentItemId', degree);
    } else if (degreeTxt && degree) {
      logVerbose('Degree: TEXT INPUT detected (Variant A)');
      await fillTextByName('degreeName', degree);
    }
    await stableWait(200, 1500);

    // [OracleCloud] Major / Field of Study
    if (major) await fillTextByName('major', major);

    // [OracleCloud] School (cx-select — only some portals have this)
    const schoolInput = document.querySelector('input.cx-select-input[name="educationalEstablishment"]');
    if (schoolInput) {
      const school = edu?.school || edu?.institution || '';
      if (school) {
        const picked = await fillCxSelectWithRetry('educationalEstablishment', school);
        if (!picked) logWarn('School: no match — user fills manually');
      }
      await stableWait(200, 1500);
    }

    // [OracleCloud] Minor (text — only some portals)
    const minor = edu?.minor || '';
    if (minor) await fillTextByName('minor', minor);

    // [OracleCloud] Comments (textarea — only some portals)
    const comments = edu?.comments || '';
    if (comments) await fillTextByName('comments', comments);

    // [OracleCloud] Start/End Dates — only if cx-select date fields exist
    const hasDateFields = !!document.querySelector('input.cx-select-input[id^="month-startDate"]');
    if (hasDateFields) {
      logVerbose('Education dates: FOUND');
      const startMonth = edu?.start_month || '';
      const startYear = edu?.start_year || '';
      const endMonth = edu?.end_month || '';
      const endYear = edu?.end_year || '';

      if (startMonth) { await fillCxSelect('month-startDate', startMonth, true); await stableWait(200, 1500); }
      if (startYear) { await fillCxSelect('year-startDate', startYear, true); await stableWait(200, 1500); }
      if (endMonth) { await fillCxSelect('month-endDate', endMonth, true); await stableWait(200, 1500); }
      if (endYear) { await fillCxSelect('year-endDate', endYear, true); await stableWait(200, 1500); }
    } else {
      logVerbose('Education dates: NOT present on this portal');
    }

    // [OracleCloud] Country → cascade → State → City
    const eduCountry = edu?.country || profile.country || 'United States';
    await fillCxSelect('countryCode', eduCountry);

    const stateAppeared = await waitForStateCascade();
    if (stateAppeared) {
      const eduState = edu?.state || '';
      if (eduState) {
        const eduCountryForCode = edu?.country || profile.country || 'United States';
        const stateCode = toStateCode(eduState, eduCountryForCode);
        await fillCxSelect('stateProvinceCode', stateCode);
        await stableWait(200, 1500);
      }
    }

    // [OracleCloud] City (fill AFTER State to avoid cascade wipe)
    const eduCity = edu?.city || '';
    if (eduCity) await fillTextByName('city', eduCity);

    // [OracleCloud] Status pills (only some portals: In Progress/Enrolled, Completed, Withdrew)
    const statusPills = document.querySelectorAll('timeline-form-inline button.cx-select-pill-section');
    if (statusPills.length > 0) {
      const status = edu?.status || 'Completed';
      clickPillByText('timeline-form-inline', status);
    }
  };

  const fillEducation = async (profile) => {
    log('=== Section: Education ===');

    // [OracleCloud] Build entries list — profile arrays first, flat fields as fallback
    const entries = profile.education_entries || profile.educations || [];
    if (entries.length === 0) {
      const degree = profile.degree || '';
      const major = profile.major || '';
      if (degree || major) {
        entries.push({ degree, major, school: profile.school, country: profile.country, state: profile.state, city: profile.city });
      }
    }

    if (entries.length === 0) {
      logVerbose('SKIP: no education data in profile');
      return;
    }

    for (let i = 0; i < entries.length; i++) {
      log(`Education entry ${i + 1}/${entries.length}`);

      // [OracleCloud] Click "Add Education" button to open inline form
      const addEduBtn = document.getElementById('timeline-add-education-button');
      if (!addEduBtn) {
        logVerbose(`SKIP: Add Education button not found for entry ${i + 1}`);
        break;
      }
      addEduBtn.click();
      await stableWait(300, 3000);

      // Verify form opened
      const formOpened = !!document.querySelector('timeline-form-inline');
      if (!formOpened) {
        logWarn(`Education form did not open for entry ${i + 1} — portal may have a limit`);
        break;
      }

      await fillSingleEducation(entries[i], profile);

      // [OracleCloud] Click Save button to save the entry
      const saveBtn = document.querySelector('button.save-btn');
      if (saveBtn) {
        saveBtn.click();
        await stableWait(400, 3000);
        logVerbose(`Education entry ${i + 1} saved`);
      }
    }

    log('Education done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 5: SUPPORTING DOCUMENTS
  // Custom elements: <resume-upload-button>, <cover-letter-upload-button>
  // Upload via DataTransfer API + Knockout's onFileSelected handler
  // ════════════════════════════════════════════════════════════════════

  // [OracleCloud] Verify file upload registered by polling for filename in container
  const verifyUpload = async (fileInput, label) => {
    const container = fileInput?.closest('resume-upload-button')
      || fileInput?.closest('cover-letter-upload-button')
      || fileInput?.closest('[class*="upload"]');
    if (!container) return;
    for (let i = 0; i < 15; i++) {
      await delay(200);
      const filenameEl = container.querySelector('[class*="file-name"], [class*="filename"], .attachment-name, .upload-name');
      if (filenameEl && filenameEl.textContent.trim()) {
        logVerbose(`${label} upload verified: "${filenameEl.textContent.trim()}"`);
        return;
      }
    }
    logWarn(`${label} upload may not have registered — no filename detected in 3s`);
  };

  const fillDocuments = async (profile, resumeFile, coverLetterFile) => {
    log('=== Section: Supporting Documents ===');

    // [OracleCloud] Resume upload
    if (resumeFile) {
      const resumeInput = document.querySelector('resume-upload-button input[type="file"]');
      if (resumeInput) {
        const dt = new DataTransfer();
        dt.items.add(resumeFile);
        resumeInput.files = dt.files;
        resumeInput.dispatchEvent(new Event('change', { bubbles: true }));
        logVerbose(`Resume uploaded: ${resumeFile.name}`);
        await verifyUpload(resumeInput, 'Resume');
      } else {
        logVerbose('SKIP: resume file input not found');
      }
      await stableWait(300, 2000);
    }

    // [OracleCloud] Cover Letter upload
    if (coverLetterFile) {
      const coverInput = document.querySelector('cover-letter-upload-button input[type="file"]');
      if (coverInput) {
        const dt = new DataTransfer();
        dt.items.add(coverLetterFile);
        coverInput.files = dt.files;
        coverInput.dispatchEvent(new Event('change', { bubbles: true }));
        logVerbose(`Cover Letter uploaded: ${coverLetterFile.name}`);
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
          logVerbose(`Cover Letter uploaded (fallback): ${coverLetterFile.name}`);
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

    for (let i = 0; i < urlInputs.length; i++) {
      const input = urlInputs[i];
      if (urlValues[i] && !input.value.trim()) {
        await typeHumanLike(input, urlValues[i]);
      }
    }

    log('Supporting Documents done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] HELPER: Click a Yes/No pill by aria-label substring
  // Works for both single-select (Yes/No) and multi-select pills
  // ════════════════════════════════════════════════════════════════════

  const clickPillByAriaLabel = (ariaSubstr, pillText) => {
    for (const ul of document.querySelectorAll('ul.cx-select-pills-container')) {
      const label = (ul.getAttribute('aria-label') || '').toLowerCase();
      if (!label.includes(ariaSubstr.toLowerCase())) continue;
      scrollToEl(ul);
      for (const btn of ul.querySelectorAll('button.cx-select-pill-section')) {
        const txt = btn.querySelector('.cx-select-pill-name')?.textContent?.trim();
        if (txt === pillText && btn.getAttribute('aria-pressed') !== 'true') {
          btn.click();
          logVerbose(`Pill: "${ariaSubstr.substring(0, 45)}..." → ${pillText}`);
          return true;
        } else if (txt === pillText && btn.getAttribute('aria-pressed') === 'true') {
          return true; // already selected
        }
      }
    }
    return false;
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 5b: APPLICATION QUESTIONS
  // Handles: Yes/No pills, multi-select pills, cx-select dropdowns
  // These vary per portal — uses keyword matching for safe defaults
  // ════════════════════════════════════════════════════════════════════

  const fillApplicationQuestions = async (profile) => {
    log('=== Section: Application Questions ===');

    // ── Yes/No pill keyword rules (question substring → answer) ──
    // Profile-driven answers first, then safe defaults
    const isAuthorized = profile.work_authorization || profile.workAuthorization || 'Yes';
    const needsSponsorship = profile.requires_sponsorship === true ? 'Yes'
      : profile.requires_sponsorship === false ? 'No' : 'No';

    // [OracleCloud] Profile-driven answers — check profile fields first, fall back to safe defaults
    const prevEmployed = profile.previously_employed === true ? 'Yes' : 'No';
    const hasLicense = profile.has_professional_license === true ? 'Yes' : 'No';

    const YES_NO_RULES = [
      // Work authorization
      ['eligible to work', isAuthorized === 'Yes' || isAuthorized === true ? 'Yes' : 'No'],
      ['authorized to work', isAuthorized === 'Yes' || isAuthorized === true ? 'Yes' : 'No'],
      ['require sponsorship', needsSponsorship],
      // Legal/compliance
      ['suspended or barred', 'No'],
      ['license or professional certification', hasLicense],
      ['covered fund', 'No'],
      ['volcker rule', 'No'],
      ['public accounting firm', 'No'],
      ['financial regulatory', 'No'],
      // Employment history — profile-driven
      ['previously been employed by company', prevEmployed],
      ['previously employed by', prevEmployed],
      ['referred by', profile.referral_source ? 'Yes' : 'No'],
      // Accommodation
      ['accommodation during the recruitment', 'No'],
      ['request an accommodation', 'No'],
      // Government/political
      ['close personal associates serving', 'No'],
      ['government official', 'No'],
      ['contributions to any of the following', 'No'],
      ['political contributions', 'No'],
      // Family/relatives
      ['relatives or members of your household', 'No'],
      ['family member', 'No'],
      // Age
      ['at least 18 years of age', profile.is_over_18 || 'Yes'],
    ];

    let pillsFilled = 0;
    for (const [keyword, answer] of YES_NO_RULES) {
      if (clickPillByAriaLabel(keyword, answer)) pillsFilled++;
      await delay(150);
    }

    // [OracleCloud] Fill referral name if "referred by" was answered Yes
    if (profile.referral_source) {
      const referralInput = document.querySelector('input[name*="referral" i]')
        || document.querySelector('input[name*="referred" i]');
      if (referralInput && !referralInput.value.trim()) {
        await typeHumanLike(referralInput, profile.referral_source);
      }
    }

    // ── Multi-select pill: "Do any of the following apply to you?" ──
    clickPillByAriaLabel('do any of the following apply', 'None of these apply to me');
    await delay(150);

    // ── Sexual orientation — use decline option ──
    const sexOrientUl = [...document.querySelectorAll('ul.cx-select-pills-container')]
      .find(ul => (ul.getAttribute('aria-label') || '').toLowerCase().includes('sexual orientation'));
    if (sexOrientUl) {
      const opts = [...sexOrientUl.querySelectorAll('button .cx-select-pill-name')].map(s => s.textContent.trim());
      const declineOpt = opts.find(o => /prefer not|decline|don.t wish/i.test(o));
      if (declineOpt) {
        clickPillByAriaLabel('sexual orientation', declineOpt);
      }
    }

    // ── Compensation/Salary dropdowns ──
    // These are cx-select-input dropdowns found by nearby label/toggle button text
    const salaryValue = profile.desired_salary || profile.salary_expectation || '';
    const allCxInputs = document.querySelectorAll('input.cx-select-input[role="combobox"]');
    for (const input of allCxInputs) {
      // Check toggle button aria-label for salary/compensation keywords
      const toggleBtn = input.closest('.cx-select-container')?.querySelector('button.icon-dropdown-arrow');
      const toggleLabel = (toggleBtn?.getAttribute('aria-label') || '').toLowerCase();
      const inputLabel = (document.querySelector(`span#inputFieldLabel-${input.id}`)?.textContent || '').toLowerCase();
      const combinedLabel = toggleLabel + ' ' + inputLabel;

      if (/compensation|salary requirement/.test(combinedLabel) && !input.value.trim()) {
        // Fill with salary from profile, or skip if no data
        if (salaryValue) {
          await fillCxSelect(input.name, String(salaryValue));
          await stableWait(200, 1500);
        }
      } else if (/salary expectation.*currency|local currency/.test(combinedLabel) && !input.value.trim()) {
        // Currency dropdown — default to US Dollar
        await fillCxSelect(input.name, 'US Dollar');
        await stableWait(200, 1500);
      }
    }

    log(` Application Questions done (${pillsFilled} pills filled)`);
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 6: DISABILITY INFORMATION
  // Radio group with 3 options — click by value attribute
  // Default: "I do not want to answer" (ORA_PER_NO_ANSWER_US)
  // ════════════════════════════════════════════════════════════════════

  const fillDisability = (profile) => {
    log('=== Section: Disability Information ===');

    // [OracleCloud] Map profile disability value, or use safe default
    const disabilityValue = profile.disability || EEO_DEFAULTS.disability;

    const radios = document.querySelectorAll('input[type="radio"]');
    for (const radio of radios) {
      if (radio.value === disabilityValue) {
        scrollToEl(radio);
        radio.click();
        logVerbose(`Disability selected: ${disabilityValue}`);
        return;
      }
    }
    logVerbose('SKIP: disability radio not found');
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
    log('=== Section: Diversity Information ===');

    // ── [OracleCloud] Ethnicity/Race checkboxes ──
    // Strategy 1: Try "Prefer not to answer" by label text (some portals have it)
    const prefNoCb = findEthnicityCheckboxByLabel('prefer not to answer');
    if (prefNoCb) {
      if (!prefNoCb.checked) prefNoCb.click();
      logVerbose('Ethnicity: "Prefer not to answer" checked');
    } else {
      // Strategy 2: No "Prefer not to answer" — match profile ethnicity by label text
      const profileEthnicity = profile.ethnicity || profile.race || '';
      if (profileEthnicity) {
        const cb = findEthnicityCheckboxByLabel(profileEthnicity);
        if (cb && !cb.checked) {
          cb.click();
          const lbl = document.querySelector(`label[for="${cb.id}"]`);
          const labelText = lbl?.querySelector('span.apply-flow-input-checkbox__label')?.textContent?.trim() || cb.id;
          logVerbose(`Ethnicity: "${profileEthnicity}" → "${labelText}" checked`);
        } else if (!cb) {
          logVerbose(`Ethnicity: "${profileEthnicity}" — no matching checkbox found`);
        }
      } else {
        logVerbose('No ethnicity in profile — leaving blank (voluntary)');
      }
    }

    await stableWait(200, 1500);

    // ── [OracleCloud] Gender cx-select dropdown ──
    // Options vary per portal: Female, Male, Nonbinary, Prefer not to Answer, X-Gender
    // Field name varies per portal — find by partial match, then use exact name
    const genderSearch = profile.gender || EEO_DEFAULTS.gender;
    const genderInput = document.querySelector('input.cx-select-input[name*="GENDER" i]')
      || document.querySelector('input.cx-select-input[id*="GENDER" i]');
    if (genderInput) {
      await fillCxSelect(genderInput.name || genderInput.id, genderSearch);
    } else {
      logVerbose('SKIP: Gender dropdown not found');
    }

    log('Diversity Information done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 8: VETERAN INFORMATION
  // cx-select dropdown: Not a Protected Veteran, Declines to Self-Identify, Protected Veteran
  // ════════════════════════════════════════════════════════════════════

  const fillVeteran = async (profile) => {
    log('=== Section: Veteran Information ===');

    // [OracleCloud] Map profile veteran status, or use safe default
    // Field name varies per portal — find by partial match, then use exact name
    const veteranSearch = profile.veteranStatus || profile.veteran_status || EEO_DEFAULTS.veteran;
    const veteranInput = document.querySelector('input.cx-select-input[name*="VETERAN" i]')
      || document.querySelector('input.cx-select-input[id*="VETERAN" i]');
    if (veteranInput) {
      const fieldName = veteranInput.name || veteranInput.id;
      await fillCxSelectWithRetry(fieldName, veteranSearch);
    } else {
      logVerbose('SKIP: Veteran dropdown not found');
    }

    log('Veteran Information done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION 9: E-SIGNATURE
  // Plain text input — full name as electronic signature (required)
  // ════════════════════════════════════════════════════════════════════

  const fillESignature = async (profile) => {
    log('=== Section: E-Signature ===');

    const firstName = profile.firstName || profile.first_name || '';
    const lastName = profile.lastName || profile.last_name || '';
    const fullName = profile.fullName || profile.full_name || `${firstName} ${lastName}`.trim();

    if (fullName) {
      await fillTextByName('fullName', fullName);
    }

    log('E-Signature done');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] SECTION PRESENCE DETECTION
  // Quick DOM checks to determine which sections exist on the current page.
  // Works for both single scrollable pages (all sections visible) and
  // multi-step paginated portals (only some sections per page).
  // Each check is a fast selector query — no polling, no delay.
  // ════════════════════════════════════════════════════════════════════

  const sectionVisible = {
    // [OracleCloud] Uses isVisible() to handle multi-step portals where
    // Oracle renders ALL sections in DOM but CSS-hides non-active pages.
    // On single scrollable pages, all checks return true (everything visible).

    contactInfo: () =>
      !!findVisible('input[name="firstName"]'),

    address: () =>
      !!findVisible('input[name*="addressLine1" i]')
      || !!findVisible('input.cx-select-input[name="country"]'),

    workExperience: () => {
      const btn = document.getElementById('timeline-add-experience-button');
      return btn && isVisible(btn);
    },

    education: () => {
      const btn = document.getElementById('timeline-add-education-button');
      return btn && isVisible(btn);
    },

    documents: () =>
      !!findVisible('resume-upload-button')
      || !!findVisible('[class*="resume-upload"]'),

    applicationQuestions: () => {
      // Check for visible pill containers (not Title pills in Contact section)
      for (const ul of document.querySelectorAll('ul.cx-select-pills-container')) {
        const label = (ul.getAttribute('aria-label') || '').toLowerCase();
        if (label === 'title') continue; // Skip Contact Info title pills
        if (isVisible(ul)) return true;
      }
      return false;
    },

    disability: () =>
      !!findVisible('input[type="radio"][value="ORA_PER_NO_ANSWER_US"]')
      || !!findVisible('input[type="radio"][value*="DISABILITY" i]'),

    diversity: () =>
      !!findVisible('input[type="checkbox"][id^="dq-option"]')
      || !!findVisible('input.cx-select-input[name*="GENDER" i]')
      || !!findVisible('input.cx-select-input[id*="GENDER" i]'),

    veteran: () =>
      !!findVisible('input.cx-select-input[name*="VETERAN" i]')
      || !!findVisible('input.cx-select-input[id*="VETERAN" i]'),

    eSignature: () =>
      !!findVisible('input[name="fullName"]'),
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] MAIN FILL ORCHESTRATOR
  // Page-aware: detects which sections are on the current page, fills
  // only those, then clicks NEXT (if multi-step) and recurses.
  // Works identically on single scrollable pages (all sections found
  // on one pass, no NEXT button) and multi-step paginated portals.
  // ════════════════════════════════════════════════════════════════════

  const MAX_PAGES = 6; // safety cap — no Oracle portal has more than 6 steps

  // [OracleCloud] Module-level ref to ctx.utils — set at fillCustom entry
  // Gives section functions access to orchestrator waits without signature changes
  let _utils = null;

  // [OracleCloud] HELPER: Wait for a cx-select cascade to propagate
  // Polls until the target field has a non-empty value (or maxMs reached)
  const waitForCascade = async (fieldName, maxMs = 5000, pollMs = 200) => {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (getCxValue(fieldName)) return true;
      await delay(pollMs);
    }
    return false;
  };

  // [OracleCloud] HELPER: Safe DOM-stable wait (uses orchestrator if available, else delay fallback)
  const stableWait = async (quietMs = 300, maxMs = 2000) => {
    if (_utils?.waitForDomStable) {
      await _utils.waitForDomStable(quietMs, maxMs);
    } else {
      await delay(maxMs);
    }
  };

  const fillCustom = async (ctx, _depth = 0) => {
    if (_depth > MAX_PAGES) {
      logWarn('Max page depth reached — stopping');
      return;
    }

    // [OracleCloud] Store utils for section functions to access
    _utils = ctx.utils || null;

    const { profile } = ctx;
    const resumeFile = ctx.resumeFile || null;
    const coverLetterFile = ctx.coverLetterFile || null;

    // [OracleCloud] Log current page for debugging
    const pageNum = document.querySelector('.apply-flow-navigation-page--active')?.textContent?.trim();
    const pageLabel = pageNum ? `PAGE ${pageNum}` : 'SINGLE PAGE';
    log(`═══ FILLING ${pageLabel} (depth=${_depth}) ═══`);

    // [OracleCloud] Detect & fill only sections present on this page
    // On a single scrollable page ALL checks return true → fills everything in one pass
    // On a multi-step portal only the current page's sections are found
    //
    // QUIRK: Contact Info & Address inputs persist in the DOM across all pages
    // on multi-step portals (Oracle keeps them hidden but queryable).
    // Only fill these on the first pass to avoid re-typing on every page.

    if (_depth === 0 && sectionVisible.contactInfo()) {
      try {
        await fillContactInfo(profile);
      } catch (e) { logWarn('fillContactInfo failed:', e.message); document.activeElement?.blur(); }
      await stableWait(300, 2000);
    }

    if (_depth === 0 && sectionVisible.address()) {
      try {
        await fillAddress(profile);
      } catch (e) { logWarn('fillAddress failed:', e.message); document.activeElement?.blur(); }
      await stableWait(300, 2000);
    }

    // [OracleCloud] Application Questions — pills + dropdowns can appear on any page
    if (sectionVisible.applicationQuestions()) {
      try {
        await fillApplicationQuestions(profile);
      } catch (e) { logWarn('fillApplicationQuestions failed:', e.message); document.activeElement?.blur(); }
      await stableWait(300, 2000);
    }

    if (sectionVisible.workExperience()) {
      try {
        await fillWorkExperience(profile);
      } catch (e) { logWarn('fillWorkExperience failed:', e.message); document.activeElement?.blur(); }
      await stableWait(300, 2000);
    }

    if (sectionVisible.education()) {
      try {
        await fillEducation(profile);
      } catch (e) { logWarn('fillEducation failed:', e.message); document.activeElement?.blur(); }
      await stableWait(300, 2000);
    }

    if (sectionVisible.documents()) {
      try {
        await fillDocuments(profile, resumeFile, coverLetterFile);
      } catch (e) { logWarn('fillDocuments failed:', e.message); document.activeElement?.blur(); }
      await stableWait(300, 2000);
    }

    if (sectionVisible.disability()) {
      try {
        fillDisability(profile);
      } catch (e) { logWarn('fillDisability failed:', e.message); document.activeElement?.blur(); }
      await stableWait(300, 2000);
    }

    if (sectionVisible.diversity()) {
      try {
        await fillDiversity(profile);
      } catch (e) { logWarn('fillDiversity failed:', e.message); document.activeElement?.blur(); }
      await stableWait(300, 2000);
    }

    if (sectionVisible.veteran()) {
      try {
        await fillVeteran(profile);
      } catch (e) { logWarn('fillVeteran failed:', e.message); document.activeElement?.blur(); }
      await stableWait(300, 2000);
    }

    if (sectionVisible.eSignature()) {
      try {
        await fillESignature(profile);
      } catch (e) { logWarn('fillESignature failed:', e.message); document.activeElement?.blur(); }
    }

    // ── [OracleCloud] Multi-step pagination ──
    // Click NEXT if present and enabled, then recurse for the new page
    try {
      const nextBtn = document.querySelector('button[data-qa="applyFlowPaginationNextButton"]');
      if (nextBtn && !nextBtn.disabled) {
        log('Clicking NEXT...');
        nextBtn.click();
        await stableWait(500, 5000);
        await fillCustom(ctx, _depth + 1);
        return;
      }
    } catch (e) {
      logWarn('Page navigation failed:', e.message);
    }

    log('═══ ALL PAGES COMPLETE ═══');
    log('Review all sections, then submit!');
  };

  // ════════════════════════════════════════════════════════════════════
  // [OracleCloud] FLOW DEFINITION
  // Page-aware: fills only sections present on current page, then NEXT
  // Works identically on single scrollable pages and multi-step portals
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
          // [OracleCloud] Aggressive filtering — the adapter's fillCustom already
          // handles cx-selects, pills, radio groups, and text fields directly.
          // Only let through fields the adapter genuinely can't handle so the
          // LLM doesn't waste 15s mapping already-filled or unfillable fields.

          scanResult.fields = scanResult.fields.filter((f) => {
            if (f.isFileInput) return false;
            // Hidden Knockout checkboxes (backing observables, not real UI)
            if (f.element?.classList?.contains('input-row__hidden-control') &&
                f.element?.type === 'checkbox') return false;
            // cx-select inputs — only filter if already filled (non-empty value)
            if (f.element?.classList?.contains('cx-select-input') && f.element?.value?.trim()) return false;
            // Pill buttons — only filter if a pill is already selected
            if (f.element?.closest?.('ul.cx-select-pills-container')) {
              const pillContainer = f.element.closest('ul.cx-select-pills-container');
              if (pillContainer?.querySelector('button[aria-pressed="true"]') ||
                  pillContainer?.querySelector('.cx-select-pill--selected')) return false;
              // Unfilled pill group — let LLM try
            }
            // Phone country code — adapter skips (default +1 already set)
            if (f.element?.classList?.contains('phone-row__input')) return false;
            // E-Signature fullName — adapter fills directly
            if (f.element?.name === 'fullName') return false;
            // Disability radio — adapter fills via fillDisability()
            if (f.element?.type === 'radio' && f.element?.value?.startsWith?.('ORA_PER_')) return false;
            // Ethnicity checkboxes — adapter fills via fillDiversity()
            if (f.element?.type === 'checkbox' && f.element?.id?.startsWith?.('dq-option')) return false;
            // Contact Info text fields — adapter fills directly
            if (['lastName', 'firstName', 'middleNames', 'knownAs', 'email'].includes(f.element?.name)) return false;
            // Address text field — adapter fills directly
            if (f.element?.name?.toLowerCase?.()?.includes?.('addressline')) return false;
            return true;
          });

          scanResult.widgets = scanResult.widgets.filter((w) => {
            const el = w.element || w.inputElement;
            if (!el) return true;
            // Skip import profile section (LinkedIn/Indeed buttons)
            if (el.closest('.apply-flow-profile-import') ||
                el.closest('[class*="import-profile"]') ||
                el.closest('[class*="profile-import"]')) return false;
            // cx-select comboboxes — only filter if already filled
            if (el.classList?.contains('cx-select-input') && el.value?.trim()) return false;
            if (w.type === 'aria-combobox' && el.closest?.('.cx-select-container') && el.value?.trim()) return false;
            // Pill containers — only filter if already selected
            if (el.closest?.('ul.cx-select-pills-container')) {
              const pc = el.closest('ul.cx-select-pills-container');
              if (pc?.querySelector('button[aria-pressed="true"]') ||
                  pc?.querySelector('.cx-select-pill--selected')) return false;
            }
            if (w.type === 'aria-combobox' && el.closest?.('.cx-select-pills-container')) {
              const pc = el.closest('ul.cx-select-pills-container');
              if (pc?.querySelector('button[aria-pressed="true"]') ||
                  pc?.querySelector('.cx-select-pill--selected')) return false;
            }
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

  log('Adapter registered (v2)');
})();
