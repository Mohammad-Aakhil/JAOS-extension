/**
 * adapters/workday-v2.js — Workday ATS adapter (v2 architecture)
 *
 * This adapter handles ONLY:
 *  - Portal detection (hostname patterns, DOM markers)
 *  - Rendering timing (wait for Workday React hydration)
 *  - Step transitions (multi-page navigation: My Info → Experience → Questions → Review)
 *  - Validation triggers (React native setter, forceClosePopups)
 *  - Portal quirks (searchable multiselects, button dropdowns, date split fields,
 *    multi-entry sections, custom widget tagging via augmentScan)
 *
 * This adapter does NOT:
 *  - Hardcode field selectors per input
 *  - Map fields to profile keys (LLM does that)
 *  - Decide what value goes where
 *  - Implement generic fill logic (generic filler does that)
 *
 * Flow: detect → waitFor → scan → augmentScan → LLM map → fill → afterFill → advance
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 = window.__jaosAtsAdaptersV2 || []);

  const LOG_PREFIX = "[JAOS:Workday]";
  const log = (...args) => console.log(LOG_PREFIX, ...args);
  const warn = (...args) => console.warn(LOG_PREFIX, ...args);

  // ── Timing Constants ──────────────────────────────────────────────
  const TIMING = {
    DOM_SETTLE: 800,
    DOM_TIMEOUT: 6000,
    POPUP_OPEN: 600,
    SEARCH_RESULTS: 3500,
    SEARCH_RESULTS_RETRY: 6000,
    AFTER_SELECT: 300,
    POPUP_CLOSE_GAP: 300,
    ADD_BUTTON_RENDER: 1500,
    BETWEEN_ENTRIES: 500,
    AFTER_FILL_SETTLE: 400,
    ADVANCE_SETTLE: 800,
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Utility Functions (private) ───────────────────────────────────

  /**
   * React-safe value setter. Standard el.value = x does NOT work
   * with Workday's React controlled inputs.
   */
  const setReactValue = (el, val) => {
    const setter =
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(el, String(val));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  };

  /**
   * Dispatch Enter keypress sequence on an element.
   * Required to trigger Workday's server-side search.
   */
  const pressEnter = (el) => {
    const opts = { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  };

  /**
   * Force close any open Workday popups. Workday popups are stubbornly
   * persistent — MUST be called TWICE with a gap after every popup operation.
   */
  const forceClosePopups = () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape", code: "Escape", keyCode: 27, bubbles: true,
      })
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape", code: "Escape", keyCode: 27, bubbles: true,
      })
    );
    document.body.click();
    const overlay = document.querySelector('[data-automation-id="overlay"]');
    if (overlay) overlay.click();
  };

  /**
   * Double forceClosePopups with gap. Call after every popup/multiselect operation.
   */
  const doubleClosePopups = async () => {
    forceClosePopups();
    await wait(TIMING.POPUP_CLOSE_GAP);
    forceClosePopups();
  };

  const toLower = (s) => (s || "").toLowerCase().trim();

  /**
   * Get a field's signature string (data-automation-id + label text).
   * Used for regex matching within scoped containers.
   */
  const getFieldSig = (el) => {
    const c = el.closest("[data-automation-id]") || el.parentElement;
    const aid = c?.getAttribute("data-automation-id") || "";
    const labelEl = c?.querySelector('label, [data-automation-id="formLabel"], legend, h3, h4, h5');
    const label = toLower(labelEl?.textContent || c?.getAttribute("aria-label") || "");
    return toLower(aid + " " + label);
  };

  // ── Heading selectors for section discovery ───────────────────────
  const HEADING_SEL =
    'h2, h3, h4, legend, b, strong, ' +
    '[data-automation-id*="label"], [data-automation-id*="Label"], ' +
    '[data-automation-id*="sectionHeader"]';

  // Form field check selector
  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';

  // ── Detection ─────────────────────────────────────────────────────

  const detect = () => {
    if (/\.wd\d+\.myworkdayjobs\.com$/i.test(location.hostname)) return true;
    if (/\.myworkdayjobs\.com$/i.test(location.hostname)) return true;
    if (/\.myworkdaysite\.com$/i.test(location.hostname)) return true;
    if (/\.workday\.com$/i.test(location.hostname)) return true;
    // DOM fallback for white-labeled embeds
    if (document.querySelector('[data-automation-id="jobPostingHeader"]')) return true;
    if (document.querySelector('[data-automation-id="applyFlowMyInfoPage"]')) return true;
    return false;
  };

  // ── Form Root Discovery ───────────────────────────────────────────

  const FORM_ROOT_CANDIDATES = [
    '[data-automation-id="applyFlowContainer"]',
    '[data-automation-id="applyFlowMyInfoPage"]',
    '[data-automation-id="applyFlowMyExperiencePage"]',
    '[data-automation-id="applyFlowVoluntaryDisclosuresPage"]',
    '[data-automation-id="applicationReviewPage"]',
  ];

  const getFormRoot = () => {
    for (const sel of FORM_ROOT_CANDIDATES) {
      const el = document.querySelector(sel);
      if (el && el.querySelector(FORM_FIELD_CHECK)) return el;
    }
    return document.body;
  };

  // ── Degree Normalization (extracted from V1 lines 312-341 EXACTLY) ─

  const normalizeDegree = (raw) => {
    if (!raw) return [];
    const cands = [raw.trim()];
    const stripped = raw.replace(/,\s*.+$/, "").trim();
    if (stripped !== raw.trim()) cands.push(stripped);
    const dl = raw.toLowerCase();
    if (/ph\.?d|doctor.*philosophy/i.test(dl)) cands.push("PhD");
    else if (/executive\s*mba/i.test(dl)) cands.push("Executive MBA", "MBA");
    else if (/m\.?b\.?a/i.test(dl)) cands.push("MBA");
    else if (/j\.?d\.?\b|juris/i.test(dl)) cands.push("J.D.");
    else if (/m\.?d\.?\b(?!.*master)|doctor.*medicine/i.test(dl)) cands.push("M.D.");
    else if (/m\.?div|divinity/i.test(dl)) cands.push("MDiv");
    else if (/master|m\.\s*[a-z]/i.test(dl)) {
      if (/science|m\.?s|m\.?sc/i.test(dl)) cands.push("M.S.", "MSc");
      if (/arts|m\.?a\.?\b/i.test(dl)) cands.push("M.A.");
      if (/engineer|m\.?eng/i.test(dl)) cands.push("M.Eng");
      if (cands.length <= 2) cands.push("M.S.", "M.A.");
    } else if (/bachelor|b\.\s*[a-z]/i.test(dl)) {
      if (/science|b\.?s|b\.?sc/i.test(dl)) cands.push("B.S.", "BSc");
      if (/arts|b\.?a\.?\b/i.test(dl)) cands.push("B.A.");
      if (/engineer|b\.?eng/i.test(dl)) cands.push("B.Eng");
      if (cands.length <= 2) cands.push("B.S.", "B.A.");
    } else if (/associate/i.test(dl)) cands.push("Associate");
    else if (/high.?school/i.test(dl)) cands.push("High School");
    else if (/\bged\b/i.test(dl)) cands.push("GED");
    else if (/diploma|dcs/i.test(dl)) cands.push("Diploma of College Studies (DCS)");
    else if (/vocation/i.test(dl)) cands.push("Vocational");
    else if (/trade\s*school/i.test(dl)) cands.push("Trade School");
    return [...new Set(cands)];
  };

  // ── Education Dedup (extracted from V1 lines 343-355 EXACTLY) ─────

  const dedupeEducation = (entries) => {
    const seen = new Map();
    for (const e of entries) {
      const key = toLower(e.institution || e.school || "") + "|" + (e.start_year || "") + "|" + (e.end_year || "");
      if (!key || key === "||") { seen.set(Math.random().toString(), e); continue; }
      const existing = seen.get(key);
      if (existing) {
        const eLen = (existing.degree || "").length + (existing.field_of_study || "").length;
        if ((e.degree || "").length + (e.field_of_study || "").length > eLen) seen.set(key, e);
      } else seen.set(key, e);
    }
    return [...seen.values()];
  };

  // ── Date Parsing ──────────────────────────────────────────────────

  const parseDateParts = (val) => {
    if (!val) return { year: "", month: "" };
    const s = String(val);
    if (s.includes("-")) { const [y, m] = s.split("-"); return { year: y, month: m }; }
    return { year: s, month: "" };
  };

  // ── Proficiency Mapping ───────────────────────────────────────────

  const profToLevel = (p) => {
    const s = toLower(p || "");
    if (/native|fluent|advanced/.test(s)) return "Advanced";
    if (/intermediate/.test(s)) return "Intermediate";
    if (/basic|beginner|elementary/.test(s)) return "Beginner";
    return p || "";
  };

  // ── Section Management (extracted from V1 lines 220-280) ──────────

  /**
   * Find the Add/Add Another button near a section heading.
   * Walks up from the heading element (max 8 levels) searching for buttons.
   */
  const findSectionButton = (headingPattern, entryIndex) => {
    for (const el of document.querySelectorAll(HEADING_SEL)) {
      if (!headingPattern.test(el.textContent || "")) continue;
      let ancestor = el.parentElement;
      for (let d = 0; d < 8 && ancestor; d++) {
        const buttons = Array.from(ancestor.querySelectorAll("button"));
        const btn =
          entryIndex === 0
            ? buttons.find((b) => /^\s*add\s*$/i.test(b.textContent?.trim()))
            : buttons.find((b) => /add\s*another/i.test(b.textContent?.trim()));
        const found =
          btn || buttons.find((b) => /^\s*add(\s*another)?\s*$/i.test(b.textContent?.trim()));
        if (found) return { button: found, container: ancestor };
        ancestor = ancestor.parentElement;
      }
    }
    return null;
  };

  /**
   * Clear existing entries in a section by clicking Delete buttons in reverse.
   * Confirms deletion dialogs automatically.
   */
  const clearSectionEntries = async (pattern) => {
    for (const el of document.querySelectorAll(HEADING_SEL)) {
      if (!pattern.test(el.textContent || "")) continue;
      let ancestor = el.parentElement;
      for (let d = 0; d < 8 && ancestor; d++) {
        const delBtns = Array.from(ancestor.querySelectorAll("button")).filter(
          (b) => /^\s*delete\s*$/i.test(b.textContent?.trim())
        );
        if (!delBtns.length) { ancestor = ancestor.parentElement; continue; }
        for (let i = delBtns.length - 1; i >= 0; i--) {
          delBtns[i].click();
          await wait(600);
          const confirm = document.querySelector(
            'button[data-automation-id="confirmDeleteButton"], ' +
            'button[data-automation-id="deleteConfirm"], ' +
            '[role="dialog"] button:not([data-automation-id*="cancel"])'
          );
          if (confirm && /yes|ok|confirm|delete/i.test(confirm.textContent || "")) {
            confirm.click();
            await wait(400);
          }
        }
        return;
      }
    }
  };

  /**
   * Generic multi-entry handler: find Add button → click → fill per entry.
   * Extracted from V1 lines 267-280.
   */
  const handleMultiEntry = async (headingPattern, entries, fillEntry) => {
    if (!entries.length) return;
    const warnings = [];
    for (let i = 0; i < entries.length; i++) {
      const section = findSectionButton(headingPattern, i);
      if (!section) {
        warn(`No Add button for ${headingPattern.source} entry ${i + 1}`);
        warnings.push({ field: headingPattern.source, message: `No Add button for entry ${i + 1}` });
        break;
      }
      section.button.click();
      await wait(TIMING.ADD_BUTTON_RENDER);
      try {
        await fillEntry(section.container, entries[i], i);
      } catch (err) {
        warn(`Multi-entry fill error (${headingPattern.source} #${i + 1}):`, err.message);
      }
      await wait(TIMING.BETWEEN_ENTRIES);
    }
    return warnings;
  };

  // ── Scoped Fill Helpers (extracted from V1) ───────────────────────

  /**
   * Fill text fields within a scoped container using a [regex, value] map.
   * Uses claimed Set to prevent double-fills.
   * Extracted from V1 fillTextFields (lines 285-303).
   */
  const fillScopedText = (scope, fieldMap, claimed) => {
    let count = 0;
    const inputs = scope.querySelectorAll(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea'
    );
    for (const el of inputs) {
      if (claimed.has(el) || el.value || el.disabled || el.readOnly) continue;
      if (el.closest("#jaos-dev-panel")) continue;
      const sig = getFieldSig(el);
      for (const [re, val] of fieldMap) {
        if (val && re.test(sig) && setReactValue(el, String(val))) {
          claimed.add(el);
          count++;
          break;
        }
      }
    }
    return count;
  };

  /**
   * Fill a native <select> or button-dropdown within scope matching labelPattern.
   * Extracted from V1 fillScopedSelect (lines 194-212).
   */
  const fillScopedSelect = async (scope, labelPattern, value) => {
    if (!value) return false;
    const F = window.__jaosFiller;

    for (const sel of scope.querySelectorAll("select")) {
      if (sel.disabled) continue;
      if (!labelPattern.test(getFieldSig(sel))) continue;
      if (F && F.fillSelect(sel, String(value))) return true;
    }

    for (const btn of scope.querySelectorAll("button")) {
      const aria = toLower(btn.getAttribute("aria-label") || "");
      const parentAid = btn.closest("[data-automation-id]")?.getAttribute("data-automation-id") || "";
      if (!labelPattern.test(aria) && !labelPattern.test(parentAid)) continue;
      if (await fillButtonDropdown({ element: btn }, value)) return true;
    }

    return false;
  };

  /**
   * Fill a searchable list widget within a scoped container.
   * Extracted from V1 fillSearchableList (lines 133-191).
   *
   * Interaction: focus → type → Enter → wait for server → pick match → close popup.
   * Fallback: split value into words, try longest words individually.
   */
  const fillScopedSearchable = async (scope, fieldAid, value, claimed) => {
    if (!value) return false;
    const fc = scope.querySelector(`[data-automation-id="${fieldAid}"]`);
    if (!fc) return false;

    const input =
      fc.querySelector('[data-automation-id="multiselectInputContainer"] input') ||
      fc.querySelector('input:not([type="hidden"]):not([type="checkbox"])');
    if (!input || (claimed && claimed.has(input)) || input.disabled) return false;

    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!nativeSetter) return false;

    forceClosePopups();
    input.focus();
    input.click();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    await wait(200);

    // Try full value, then longest individual words (fallback for long names)
    const terms = [value];
    value
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .sort((a, b) => b.length - a.length)
      .forEach((w) => {
        if (w.toLowerCase() !== value.toLowerCase()) terms.push(w);
      });

    for (const term of terms) {
      nativeSetter.call(input, term);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      pressEnter(input);
      await wait(TIMING.SEARCH_RESULTS);

      const opts = Array.from(
        document.querySelectorAll(
          '[data-automation-id="menuItem"][role="option"], [data-automation-id="promptOption"]'
        )
      ).filter(
        (o) =>
          o.offsetParent !== null &&
          !/^no\s*items?\.?$/i.test(o.textContent?.trim()) &&
          !/^search\s*results?\s*\(/i.test(o.textContent?.trim())
      );
      if (!opts.length) continue;

      const t = toLower(value);
      const match =
        opts.find((o) => toLower(o.textContent?.trim()) === t) ||
        opts.find((o) => toLower(o.textContent?.trim()).includes(toLower(term))) ||
        opts.find((o) => toLower(term).includes(toLower(o.textContent?.trim()))) ||
        opts[0];

      match.click();
      if (claimed) claimed.add(input);
      await wait(TIMING.AFTER_SELECT);
      await doubleClosePopups();
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      document.body.click();
      return true;
    }

    input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    document.body.click();
    await wait(100);
    return false;
  };

  // ── Quirk Handlers ────────────────────────────────────────────────

  /**
   * Fill a Workday searchable multiselect widget.
   * Interaction: forceClose → focus → type → Enter → wait server → pick → close.
   * Supports multi-value (Skills) by accepting comma-separated or array values.
   *
   * Extracted from V1 fillSearchableList (lines 133-191).
   */
  const fillSearchableMultiselect = async (widget, value, ctx) => {
    try {
      const el = widget.element;
      const input =
        el.querySelector('[data-automation-id="multiselectInputContainer"] input') ||
        el.querySelector('input:not([type="hidden"]):not([type="checkbox"])');
      if (!input || input.disabled) return false;

      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!nativeSetter) return false;

      // Handle multi-value (array or comma-separated string)
      const values = Array.isArray(value) ? value : [value];

      for (const singleValue of values) {
        if (!singleValue) continue;

        forceClosePopups();
        await wait(100);
        input.focus();
        input.click();
        input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
        await wait(200);

        // Clear any existing text in the input
        nativeSetter.call(input, "");
        input.dispatchEvent(new Event("input", { bubbles: true }));

        // Try full value, then longest individual words as fallback
        const terms = [singleValue];
        singleValue
          .split(/\s+/)
          .filter((w) => w.length >= 3)
          .sort((a, b) => b.length - a.length)
          .forEach((w) => {
            if (w.toLowerCase() !== singleValue.toLowerCase()) terms.push(w);
          });

        let picked = false;
        for (const term of terms) {
          nativeSetter.call(input, term);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          pressEnter(input);
          await wait(TIMING.SEARCH_RESULTS);

          const opts = Array.from(
            document.querySelectorAll(
              '[data-automation-id="menuItem"][role="option"], [data-automation-id="promptOption"]'
            )
          ).filter(
            (o) =>
              o.offsetParent !== null &&
              !/^no\s*items?\.?$/i.test(o.textContent?.trim()) &&
              !/^search\s*results?\s*\(/i.test(o.textContent?.trim())
          );
          if (!opts.length) continue;

          const t = toLower(singleValue);
          const match =
            opts.find((o) => toLower(o.textContent?.trim()) === t) ||
            opts.find((o) => toLower(o.textContent?.trim()).includes(toLower(term))) ||
            opts.find((o) => toLower(term).includes(toLower(o.textContent?.trim()))) ||
            opts[0];

          match.click();
          await wait(TIMING.AFTER_SELECT);
          picked = true;
          break;
        }

        await doubleClosePopups();
        input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        document.body.click();
        await wait(200);
      }

      return true;
    } catch (err) {
      warn("fillSearchableMultiselect error:", err.message);
      return false;
    }
  };

  /**
   * Fill a Workday button-based dropdown.
   * Click button → wait for popup → fuzzy match option → click.
   *
   * Extracted from V1 fillButtonDropdown (lines 107-130).
   */
  const fillButtonDropdown = async (widget, value, ctx) => {
    try {
      if (!value) return false;
      const btn = widget.element;
      btn.click();
      await wait(TIMING.POPUP_OPEN);

      const options = Array.from(
        document.querySelectorAll(
          'li[role="option"], [role="option"], [data-automation-id="promptOption"]'
        )
      ).filter((o) => o.offsetParent !== null);

      if (!options.length) {
        document.body.click();
        await wait(100);
        return false;
      }

      const t = toLower(value);
      const match =
        options.find((o) => toLower(o.textContent?.trim()) === t) ||
        options.find((o) => toLower(o.textContent?.trim()).includes(t)) ||
        options.find((o) => t.includes(toLower(o.textContent?.trim())));

      if (match) {
        match.click();
        await wait(TIMING.AFTER_SELECT);
        await doubleClosePopups();
        return true;
      }

      document.body.click();
      await wait(100);
      return false;
    } catch (err) {
      warn("fillButtonDropdown error:", err.message);
      return false;
    }
  };

  /**
   * Fill a Workday date split field (month or year).
   * Uses React native setter pattern.
   */
  const fillDateField = async (widget, value, ctx) => {
    try {
      if (!value) return false;
      const el = widget.element;
      return setReactValue(el, String(value));
    } catch (err) {
      warn("fillDateField error:", err.message);
      return false;
    }
  };

  // ── Multi-Entry Section Fill Handlers ─────────────────────────────

  /**
   * Fill a single Work Experience entry within its scoped container.
   * Extracted from V1 lines 428-463.
   */
  const fillWorkExperienceEntry = async (scope, entry, index, ctx) => {
    try {
      const claimed = new Set();
      let count = 0;
      const isCurrent = Boolean(entry.is_current) || /present|current/i.test(entry.end_date || "");

      // Text fields
      count += fillScopedText(scope, [
        [/job.?title|position/i, entry.title || entry.role || ""],
        [/\bcompany\b|employer|organization/i, entry.company || ""],
        [/role.?desc|description|responsib|duties/i, entry.description || entry.role_description || ""],
        [/\blocation\b/i, entry.location || ""],
      ], claimed);

      // "I currently work here" checkbox (first entry only when current)
      if (index === 0 && isCurrent) {
        for (const cb of scope.querySelectorAll('input[type="checkbox"]')) {
          if (cb.checked || cb.disabled) continue;
          const lbl = toLower((cb.closest("[data-automation-id]") || cb.parentElement)?.textContent || "");
          if (/currently\s*work|i\s*currently/i.test(lbl)) {
            cb.click();
            await wait(300);
            count++;
            break;
          }
        }
      }

      // Date fields: first month/year pair = From, second = To
      const months = [...scope.querySelectorAll('[data-automation-id="dateSectionMonth-input"]')]
        .filter((i) => !claimed.has(i));
      const years = [...scope.querySelectorAll('[data-automation-id="dateSectionYear-input"]')]
        .filter((i) => !claimed.has(i));

      if (entry.start_date && months[0] && years[0]) {
        const [sy, sm] = entry.start_date.split("-");
        if (setReactValue(months[0], sm || "")) { claimed.add(months[0]); count++; }
        if (setReactValue(years[0], sy || "")) { claimed.add(years[0]); count++; }
      }
      if (entry.end_date && !isCurrent && months[1] && years[1]) {
        const [ey, em] = entry.end_date.split("-");
        if (setReactValue(months[1], em || "")) { claimed.add(months[1]); count++; }
        if (setReactValue(years[1], ey || "")) { claimed.add(years[1]); count++; }
      }

      return count;
    } catch (err) {
      warn("fillWorkExperienceEntry error:", err.message);
      return 0;
    }
  };

  /**
   * Fill a single Education entry within its scoped container.
   * Extracted from V1 lines 466-511.
   */
  const fillEducationEntry = async (scope, entry, index, ctx) => {
    try {
      const claimed = new Set();
      let count = 0;

      // School — searchable list
      const school = entry.institution || entry.school || "";
      if (school) {
        if (await fillScopedSearchable(scope, "formField-school", school, claimed)) count++;
        else warn(`School "${school}" not found — select manually`);
        await wait(TIMING.AFTER_SELECT);
      }

      // Degree — button dropdown with normalization (try multiple candidates)
      if (entry.degree) {
        let ok = false;
        for (const candidate of normalizeDegree(entry.degree)) {
          if (await fillScopedSelect(scope, /degree/i, candidate)) { count++; ok = true; break; }
        }
        if (!ok) warn(`Degree "${entry.degree}" not matched`);
        await wait(TIMING.AFTER_SELECT);
      }

      // Field of Study — searchable list
      if (entry.field_of_study) {
        if (await fillScopedSearchable(scope, "formField-fieldOfStudy", entry.field_of_study, claimed)) count++;
        else warn(`Field of Study "${entry.field_of_study}" not found`);
        await wait(TIMING.AFTER_SELECT);
      }

      // GPA — text input
      count += fillScopedText(scope, [[/gpa|overall.?result|grade/i, entry.gpa || ""]], claimed);

      // Dates (year-only or year+month)
      const yrs = [...scope.querySelectorAll('[data-automation-id="dateSectionYear-input"]')]
        .filter((i) => !claimed.has(i));
      const mos = [...scope.querySelectorAll('[data-automation-id="dateSectionMonth-input"]')]
        .filter((i) => !claimed.has(i));
      const start = parseDateParts(entry.start_year || entry.start_date);
      const end = parseDateParts(entry.end_year || entry.end_date);
      if (start.year && yrs[0] && setReactValue(yrs[0], start.year)) { claimed.add(yrs[0]); count++; }
      if (start.month && mos[0] && setReactValue(mos[0], start.month)) { claimed.add(mos[0]); count++; }
      if (end.year && yrs[1] && setReactValue(yrs[1], end.year)) { claimed.add(yrs[1]); count++; }
      if (end.month && mos[1] && setReactValue(mos[1], end.month)) { claimed.add(mos[1]); count++; }

      return count;
    } catch (err) {
      warn("fillEducationEntry error:", err.message);
      return 0;
    }
  };

  /**
   * Fill a single Language entry within its scoped container.
   * Extracted from V1 lines 514-541.
   */
  const fillLanguageEntry = async (scope, entry, index, ctx) => {
    try {
      let count = 0;

      // Language dropdown
      if (entry.language && await fillScopedSelect(scope, /\blanguage\b/i, entry.language)) {
        count++;
        await wait(TIMING.AFTER_SELECT);
      }

      // Native/fluent checkbox
      if (/native|fluent/i.test(entry.proficiency || "")) {
        for (const cb of scope.querySelectorAll('input[type="checkbox"]')) {
          if (cb.checked || cb.disabled) continue;
          if (/fluent/i.test(toLower((cb.closest("[data-automation-id]") || cb.parentElement)?.textContent || ""))) {
            cb.click();
            await wait(200);
            count++;
            break;
          }
        }
      }

      // Proficiency levels: reading/speaking/writing
      const level = profToLevel(entry.proficiency);
      if (level) {
        for (const skill of [/\breading\b/i, /\bspeaking\b/i, /\bwriting\b/i]) {
          if (await fillScopedSelect(scope, skill, level)) count++;
          await wait(200);
        }
      }

      return count;
    } catch (err) {
      warn("fillLanguageEntry error:", err.message);
      return 0;
    }
  };

  // ── augmentScan ───────────────────────────────────────────────────

  /**
   * Augment the generic scanner's results with Workday-specific widget tagging.
   * This is the critical bridge — without it, the generic scanner can't classify
   * Workday's custom widgets correctly.
   */
  const augmentScan = async (ctx, scanResult) => {
    const formRoot = getFormRoot();
    let uidCounter = 0;
    const genUid = (prefix) => `wd-${prefix}-${uidCounter++}-${Date.now()}`;

    // ── a) Searchable Multiselects ──
    // Workday uses [data-automation-id="multiSelectContainer"] for search-and-pick widgets.
    // The scanner sees the inner <input> as a plain text field — re-tag it.
    const multiSelectContainers = formRoot.querySelectorAll('[data-automation-id="multiSelectContainer"]');
    for (const container of multiSelectContainers) {
      // Check if there's an existing scanned field inside this container
      const input = container.querySelector('input:not([type="hidden"])');
      if (!input) continue;

      // Find and re-tag the matching scanned field
      const existingField = scanResult.fields.find((f) => f.element === input);
      if (existingField) {
        // Remove from fields array (we'll add as a widget)
        scanResult.fields = scanResult.fields.filter((f) => f !== existingField);
      }

      // Check for existing selection chips
      const chips = container.querySelectorAll('[data-automation-id="DELETE_charm"]');
      const hasExistingSelection = chips.length > 0;

      // Get label from the closest labeled container
      const labelContainer = container.closest("[data-automation-id]");
      const labelEl = labelContainer?.querySelector(
        'label, [data-automation-id="formLabel"], legend'
      );
      const label = labelEl?.textContent?.replace(/\s+/g, " ").trim() || "";
      const section = ctx.utils.scanner.getSectionContext(container);
      const automationId = labelContainer?.getAttribute("data-automation-id") || "";

      scanResult.widgets.push({
        uid: genUid("searchable"),
        type: "workday-searchable-multiselect",
        element: container,
        label: label,
        placeholder: input.placeholder || "",
        currentValue: hasExistingSelection
          ? Array.from(chips).map((c) => c.parentElement?.textContent?.replace(/\s*×?\s*$/, "").trim()).filter(Boolean).join(", ")
          : "",
        section: section,
        hasValue: hasExistingSelection,
        dataAutomationId: automationId,
        _meta: { interaction: "type-enter-wait-pick" },
      });
    }

    // ── b) Button Dropdowns ──
    // Workday uses button[aria-haspopup="listbox"] for dropdown selects.
    // Generic scanner won't pick these up (they're buttons, not selects).
    const dropdownButtons = formRoot.querySelectorAll('button[aria-haspopup="listbox"]');
    for (const btn of dropdownButtons) {
      if (!btn.offsetParent) continue; // Skip hidden
      if (btn.closest("#jaos-dev-panel")) continue;

      // Check not already captured by scanner
      const alreadyCaptured = scanResult.widgets.some((w) => w.element === btn);
      if (alreadyCaptured) continue;

      const labelContainer = btn.closest("[data-automation-id]");
      const labelEl = labelContainer?.querySelector(
        'label, [data-automation-id="formLabel"], legend'
      );
      const label = labelEl?.textContent?.replace(/\s+/g, " ").trim() || "";
      const btnText = btn.textContent?.trim() || "";
      const section = ctx.utils.scanner.getSectionContext(btn);
      const automationId = labelContainer?.getAttribute("data-automation-id") || "";

      scanResult.widgets.push({
        uid: genUid("dropdown"),
        type: "workday-button-dropdown",
        element: btn,
        label: label,
        placeholder: "",
        currentValue: btnText,
        section: section,
        hasValue: btnText !== "" && !/select|choose|--/i.test(btnText),
        dataAutomationId: automationId,
        _meta: { ariaHaspopup: "listbox" },
      });
    }

    // ── c) Date Month/Year Split Fields ──
    // Workday splits dates into separate month and year inputs.
    // Tag them so the LLM knows what format to use.
    const monthInputs = formRoot.querySelectorAll('[data-automation-id="dateSectionMonth-input"]');
    for (const input of monthInputs) {
      const existingField = scanResult.fields.find((f) => f.element === input);
      if (existingField) {
        existingField.type = "workday-date-month";
        existingField._meta = { dateFormat: "MM" };
      }
    }

    const yearInputs = formRoot.querySelectorAll('[data-automation-id="dateSectionYear-input"]');
    for (const input of yearInputs) {
      const existingField = scanResult.fields.find((f) => f.element === input);
      if (existingField) {
        existingField.type = "workday-date-year";
        existingField._meta = { dateFormat: "YYYY" };
      }
    }

    // ── d) Radio Groups ──
    // Consolidate individual radio buttons by name into single logical fields.
    const radiosByName = new Map();
    scanResult.fields = scanResult.fields.filter((f) => {
      if (f.type !== "radio") return true;
      const name = f.name || f.element?.name;
      if (!name) return true; // Keep orphan radios
      if (!radiosByName.has(name)) {
        radiosByName.set(name, []);
      }
      radiosByName.get(name).push(f);
      return false; // Remove individual radios
    });

    for (const [name, radios] of radiosByName) {
      if (radios.length === 0) continue;
      const firstRadio = radios[0];
      const options = radios.map((r) => {
        const radioLabel =
          r.element.closest("label")?.textContent?.trim() ||
          document.querySelector(`label[for="${r.element.id}"]`)?.textContent?.trim() ||
          r.element.value || "";
        return radioLabel;
      }).filter(Boolean);

      const selectedRadio = radios.find((r) => r.element.checked);

      scanResult.widgets.push({
        uid: genUid("radiogroup"),
        type: "workday-radio-group",
        element: firstRadio.element.closest('[role="radiogroup"]') ||
                 firstRadio.element.closest("[data-automation-id]") ||
                 firstRadio.element.parentElement,
        label: firstRadio.label || firstRadio.section || "",
        placeholder: "",
        currentValue: selectedRadio
          ? (selectedRadio.element.closest("label")?.textContent?.trim() || selectedRadio.element.value || "")
          : "",
        section: firstRadio.section || "",
        hasValue: !!selectedRadio,
        options: options,
        _meta: { radioName: name, radioElements: radios.map((r) => r.element) },
      });
    }

    // ── e) Multi-Entry Sections ──
    // Detect section headings with "Add" / "Add Another" buttons.
    const sectionPatterns = [
      { heading: /work\s*experience/i, key: "work-experience" },
      { heading: /\beducation\b/i, key: "education" },
      { heading: /\blanguage/i, key: "language" },
      { heading: /\bwebsite/i, key: "website" },
      { heading: /\bskill/i, key: "skill" },
    ];

    scanResult.sections = scanResult.sections || [];
    for (const sp of sectionPatterns) {
      const result = findSectionButton(sp.heading, 0);
      if (result) {
        // Count existing entries by looking for Delete buttons
        const delBtns = Array.from(result.container.querySelectorAll("button")).filter(
          (b) => /^\s*delete\s*$/i.test(b.textContent?.trim())
        );

        scanResult.sections.push({
          heading: sp.key,
          headingPattern: sp.heading,
          addButton: result.button,
          entryCount: delBtns.length,
          container: result.container,
        });
      }
    }

    // ── f) File Upload Zones ──
    // Tag input[type="file"] and upload regions.
    const uploadRegions = formRoot.querySelectorAll('[data-automation-id*="upload"], [data-automation-id*="Upload"]');
    for (const region of uploadRegions) {
      const fileInput = region.querySelector('input[type="file"]');
      if (!fileInput) continue;
      // Scanner should already have this — just ensure it's tagged
      const existingField = scanResult.fields.find((f) => f.element === fileInput);
      if (existingField) {
        existingField._meta = { ...(existingField._meta || {}), workdayUpload: true };
      }
    }
  };

  // ── afterFill ─────────────────────────────────────────────────────

  /**
   * Post-fill cleanup: React sync, force close popups, wait for validation.
   */
  const afterFill = async (ctx, fillResult) => {
    const formRoot = getFormRoot();

    // 1. React sync — dispatch input/change/blur on all filled elements
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const inputs = formRoot.querySelectorAll("input, textarea");
    for (const input of inputs) {
      if (!input.value || input.disabled || input.readOnly) continue;
      if (input.type === "hidden" || input.type === "checkbox" || input.type === "radio" || input.type === "file") continue;
      try {
        if (nativeSetter) nativeSetter.call(input, input.value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("blur", { bubbles: true }));
      } catch (_e) { /* ignore individual field errors */ }
    }

    // 2. Force close any lingering popups — TWICE
    await doubleClosePopups();

    // 3. Wait for validation messages to render
    await ctx.utils.waitForDomStable(TIMING.AFTER_FILL_SETTLE, 3000);
  };

  // ── advance ───────────────────────────────────────────────────────

  /**
   * Navigate to the next Workday page (Save and Continue / Next).
   */
  const advance = async (ctx) => {
    // Primary: data-automation-id based
    let nextBtn =
      document.querySelector('[data-automation-id="pageFooterNextButton"]') ||
      document.querySelector('[data-automation-id="bottom-navigation-next-button"]');

    // Fallback: text-based search
    if (!nextBtn) {
      const buttons = [...document.querySelectorAll("button")];
      nextBtn = buttons.find((b) => /save\s*and\s*continue|next/i.test(b.textContent?.trim()));
    }

    if (!nextBtn) {
      log("No advance button found");
      return false;
    }

    nextBtn.click();
    log("Clicked advance button");

    // Wait for the next page to render
    try {
      await ctx.utils.waitForMutation({
        predicate: (mutations) => mutations.some((m) => m.addedNodes.length > 0),
        timeoutMs: 8000,
      });
      await ctx.utils.waitForDomStable(TIMING.ADVANCE_SETTLE, TIMING.DOM_TIMEOUT);
      return true;
    } catch (_e) {
      warn("Advance wait timed out, page may not have changed");
      return false;
    }
  };

  // ── Flow Definition ───────────────────────────────────────────────

  /**
   * Build a flow step entry for a given Workday page.
   */
  const buildWorkdayStep = (id, label) => ({
    id,
    label,

    waitFor: async (ctx) => {
      const { waitForElement, waitForDomStable } = ctx.utils;
      const formRoot = getFormRoot();

      // Wait for at least one form field to appear
      try {
        await waitForElement("input, select, textarea, button[aria-haspopup]", formRoot, 8000);
      } catch (_e) {
        // Form might already be loaded
      }

      // Wait for Workday React hydration (generous settle — Workday is slow)
      await waitForDomStable(TIMING.DOM_SETTLE, TIMING.DOM_TIMEOUT);
    },

    getFormRoot: () => getFormRoot(),

    augmentScan: async (ctx, scanResult) => augmentScan(ctx, scanResult),

    afterFill: async (ctx, fillResult) => afterFill(ctx, fillResult),

    advance: async (ctx) => advance(ctx),
  });

  /**
   * Workday is ALWAYS multi-page. Return flow steps for all known pages.
   * The orchestrator will execute each step in sequence, calling advance()
   * between them. Steps that don't match the current page will still scan
   * and fill whatever is visible.
   */
  const getFlow = () => {
    return [
      buildWorkdayStep("my-info", "My Information"),
      buildWorkdayStep("my-experience", "My Experience"),
      buildWorkdayStep("questions", "Application Questions"),
      buildWorkdayStep("voluntary", "Voluntary Disclosures"),
    ];
  };

  // ── Registration ──────────────────────────────────────────────────

  // Prevent double-registration if script loads twice in same frame
  if (registry.some((a) => a.name === "workday")) return;

  registry.push({
    name: "workday",
    detect,
    getFormRoot,
    getFlow,

    // Respect existing values by default
    shouldOverwrite: () => false,

    // Quirk handlers that the generic filler dispatches to
    // when it encounters workday-* widget types
    quirkHandlers: {
      "workday-searchable-multiselect": fillSearchableMultiselect,
      "workday-button-dropdown": fillButtonDropdown,
      "workday-date-month": fillDateField,
      "workday-date-year": fillDateField,
    },

    // Multi-entry section handlers
    sectionHandlers: {
      "work-experience": fillWorkExperienceEntry,
      "education": fillEducationEntry,
      "language": fillLanguageEntry,
    },

    // Section management utilities for the orchestrator/generic layer
    multiEntry: {
      handleMultiEntry,
      findSectionButton,
      clearSectionEntries,
    },

    // Utility exports for the generic layer if needed
    utils: {
      forceClosePopups,
      doubleClosePopups,
      setReactValue,
      pressEnter,
      normalizeDegree,
      dedupeEducation,
      parseDateParts,
      profToLevel,
      fillScopedText,
      fillScopedSelect,
      fillScopedSearchable,
    },
  });
})();
