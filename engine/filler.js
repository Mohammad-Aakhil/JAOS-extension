/**
 * engine/filler.js — Humanized form fill engine
 *
 * Content script that fills form fields with realistic human-like behavior:
 *  - Character-by-character typing with random delays
 *  - Proper event sequence: focus → keydown → input → keyup → change → blur
 *  - React-compatible value setting via native property descriptors
 *  - Select/checkbox/radio handling
 *  - React-select widget interaction
 *
 * Registers: window.__jaosFiller
 */
(() => {
  if (window.__jaosFiller) return;

  /**
   * Random delay between min and max ms.
   */
  const delay = (min, max) =>
    new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

  /**
   * Get the native value setter for React-controlled inputs.
   */
  const getNativeSetter = (el) => {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    return desc?.set || null;
  };

  /**
   * Dispatch a sequence of events on an element.
   */
  const dispatchEvents = (el, eventNames) => {
    for (const name of eventNames) {
      if (name === "focus") {
        el.focus();
        el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      } else if (name === "blur") {
        el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        el.blur();
      } else if (name.startsWith("key")) {
        el.dispatchEvent(new KeyboardEvent(name, { bubbles: true, key: "", code: "" }));
      } else {
        el.dispatchEvent(new Event(name, { bubbles: true }));
      }
    }
  };

  /**
   * Type a value into a text input character-by-character.
   * Simulates realistic human typing with variable delays.
   *
   * @param {HTMLElement} el — The input/textarea element
   * @param {string} value — The text to type
   * @param {object} [opts] — Options
   * @param {number} [opts.minDelay] — Min ms between keystrokes (default 15)
   * @param {number} [opts.maxDelay] — Max ms between keystrokes (default 55)
   * @param {boolean} [opts.clearFirst] — Clear existing value first (default true)
   */
  const typeText = async (el, value, opts = {}) => {
    const { minDelay = 15, maxDelay = 55, clearFirst = true } = opts;
    const nativeSetter = getNativeSetter(el);

    // Focus the element
    el.focus();
    el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await delay(30, 80);

    // Clear existing value
    if (clearFirst && el.value) {
      if (nativeSetter) {
        nativeSetter.call(el, "");
      } else {
        el.value = "";
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(20, 50);
    }

    // Type character by character
    let current = "";
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      current += char;

      el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: char, code: `Key${char.toUpperCase()}` }));

      if (nativeSetter) {
        nativeSetter.call(el, current);
      } else {
        el.value = current;
      }

      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
      el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: char, code: `Key${char.toUpperCase()}` }));

      await delay(minDelay, maxDelay);
    }

    // Trigger change + blur
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(50, 120);
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  };

  /**
   * Set a value on a text input instantly (for speed when typing isn't needed).
   * Still uses React-compatible setter and dispatches full event sequence.
   */
  const setValue = (el, value) => {
    const nativeSetter = getNativeSetter(el);
    const previous = el.value;

    el.focus();
    el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    return previous !== value;
  };

  /**
   * Select an option in a native <select> element.
   * Uses multi-tier fuzzy matching + React-compatible value setting.
   *
   * Matching priority:
   *  1. Exact match on value or text
   *  2. option text/value contains target
   *  3. target contains option text (handles LLM returning verbose text)
   *  4. First-word match (handles "Yes" vs "Yes, I am authorized...")
   *
   * @param {HTMLSelectElement} el
   * @param {string} value — Value or text to match
   * @returns {boolean} — Whether a match was found and selected
   */
  const fillSelect = (el, value) => {
    if (!value || !(el instanceof HTMLSelectElement)) return false;

    const target = value.toLowerCase().trim();
    const options = Array.from(el.options).filter((o) => !o.disabled && o.value !== "");

    // Normalize: keywords that mean "decline" / "prefer not to answer"
    const DECLINE_KEYWORDS = /decline|prefer not|don.?t wish|do not wish|not to (answer|say|disclose|identify)|choose not/i;
    const targetIsDecline = DECLINE_KEYWORDS.test(target);

    // Helper: extract significant words (3+ chars) for overlap scoring
    const significantWords = (text) =>
      text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length >= 3);
    const targetWords = significantWords(target);

    // Multi-tier matching
    const match =
      // Tier 1: Exact match
      options.find((o) => o.value.toLowerCase() === target || o.textContent.trim().toLowerCase() === target) ||
      // Tier 2: Option contains target
      options.find((o) => o.value.toLowerCase().includes(target) || o.textContent.trim().toLowerCase().includes(target)) ||
      // Tier 3: Target contains option text (LLM returned verbose answer)
      options.find((o) => {
        const optText = o.textContent.trim().toLowerCase();
        return optText.length > 1 && target.includes(optText);
      }) ||
      // Tier 3.5: Word-overlap match ("I am not a veteran" ↔ "I am not a protected veteran")
      (() => {
        if (targetWords.length < 2) return null;
        let bestOption = null;
        let bestScore = 0;
        for (const o of options) {
          const optWords = significantWords(o.textContent.trim());
          if (optWords.length < 2) continue;
          const targetInOpt = targetWords.filter((w) => optWords.includes(w)).length;
          const optInTarget = optWords.filter((w) => targetWords.includes(w)).length;
          const score = (targetInOpt / targetWords.length + optInTarget / optWords.length) / 2;
          if (score > bestScore) {
            bestScore = score;
            bestOption = o;
          }
        }
        return bestScore >= 0.6 ? bestOption : null;
      })() ||
      // Tier 4: First word match ("Yes" matches "Yes, I am authorized...")
      options.find((o) => {
        const optFirst = o.textContent.trim().toLowerCase().split(/[\s,]/)[0];
        return optFirst.length > 1 && (optFirst === target || target === optFirst);
      }) ||
      // Tier 5: Semantic decline match (LLM says "Decline" but option is "I don't wish to answer")
      (targetIsDecline ? options.find((o) => DECLINE_KEYWORDS.test(o.textContent)) : null);

    if (!match) {
      console.warn(`[JAOS Filler] No select match for "${value}" in [${options.map((o) => o.textContent.trim()).join(", ")}]`);
      return false;
    }

    // React _valueTracker sync (must be done BEFORE setting value)
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue("");

    // Focus + open simulation
    el.focus();
    el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    // Set value via native setter (React-compatible)
    const nativeSetter = getNativeSetter(el);
    if (nativeSetter) {
      nativeSetter.call(el, match.value);
    } else {
      el.value = match.value;
    }
    // Also set selectedIndex for frameworks that check it
    el.selectedIndex = match.index;

    // Full event sequence (input → change → blur)
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    return true;
  };

  /**
   * Check or uncheck a checkbox/radio.
   */
  const fillCheckbox = (el, shouldCheck) => {
    if (!(el instanceof HTMLInputElement)) return false;
    const desired = Boolean(shouldCheck);
    if (el.checked === desired) return false;

    el.focus();
    el.checked = desired;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    return true;
  };

  /**
   * Fill a React-select dropdown widget.
   * Opens the dropdown, searches for the option, clicks it.
   *
   * @param {HTMLElement} container — The react-select container element
   * @param {string} value — Text to match in options
   * @returns {Promise<boolean>}
   */
  const fillReactSelect = async (container, value) => {
    if (!value || !container) return false;

    const control = container.querySelector('[class*="__control"]');
    if (!control) return false;

    // Click to open
    control.click();
    await delay(200, 400);

    // Wait for menu
    let menu = null;
    for (let i = 0; i < 40; i++) {
      menu = container.querySelector('[class*="__menu"]');
      if (menu) break;
      await delay(50, 50);
    }
    if (!menu) {
      document.body.click(); // close if opened without menu
      return false;
    }

    const target = value.toLowerCase().trim();
    const options = Array.from(menu.querySelectorAll('[class*="__option"]'));

    // Try exact match first, then partial
    const match =
      options.find((o) => o.textContent.trim().toLowerCase() === target) ||
      options.find((o) => o.textContent.trim().toLowerCase().includes(target)) ||
      options.find((o) => target.includes(o.textContent.trim().toLowerCase()));

    if (match) {
      match.click();
      await delay(100, 200);
      return true;
    }

    // Try typing into search input
    const searchInput = container.querySelector(
      '[class*="__input"] input, input[id^="react-select"]'
    );
    if (searchInput) {
      const nativeSetter = getNativeSetter(searchInput);
      if (nativeSetter) {
        nativeSetter.call(searchInput, value);
      } else {
        searchInput.value = value;
      }
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      await delay(300, 500);

      const filtered = container.querySelectorAll('[class*="__option"]');
      if (filtered.length > 0) {
        filtered[0].click();
        await delay(100, 200);
        return true;
      }
    }

    // Close without selection
    document.body.click();
    await delay(50, 100);
    return false;
  };

  /**
   * Fill an ARIA combobox widget (role="combobox").
   * Opens the combobox, types the search value, waits for listbox options, selects best match.
   *
   * @param {object} descriptor — Widget descriptor from scanner (has .element + .inputElement)
   * @param {string} value — Text to match
   * @returns {Promise<boolean>}
   */
  const fillAriaCombobox = async (descriptor, value) => {
    const container = descriptor.element;
    const input = descriptor.inputElement || container.querySelector("input");
    if (!input) return false;

    // Click to open the combobox dropdown
    container.click();
    await delay(150, 300);

    // Type the search value into the input
    const nativeSetter = getNativeSetter(input);
    input.focus();
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(300, 500);

    // Find the associated listbox
    const listboxId = container.getAttribute("aria-owns") || container.getAttribute("aria-controls");
    let listbox = listboxId ? document.getElementById(listboxId) : null;
    if (!listbox) {
      listbox =
        container.querySelector('[role="listbox"]') ||
        document.querySelector('[role="listbox"]:not([aria-hidden="true"])');
    }

    if (listbox) {
      // Wait for options to render (up to 1s)
      for (let i = 0; i < 10; i++) {
        const options = Array.from(listbox.querySelectorAll('[role="option"]'));
        if (options.length > 0) {
          const target = value.toLowerCase().trim();
          // Multi-tier matching
          const match =
            options.find((o) => o.textContent.trim().toLowerCase() === target) ||
            options.find((o) => o.textContent.trim().toLowerCase().includes(target)) ||
            options.find((o) => target.includes(o.textContent.trim().toLowerCase()));

          if (match) {
            match.click();
            await delay(100, 200);
            return true;
          }

          // Fallback: click first option
          options[0].click();
          await delay(100, 200);
          return true;
        }
        await delay(100, 100);
      }
    }

    // Close the combobox
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    return false;
  };

  /**
   * Fill a Select2 dropdown widget.
   * Opens the dropdown by clicking, waits for the results list,
   * optionally types in the search input, then selects the best match.
   *
   * Handles Select2 v3.x (.select2-choice, .select2-drop-active)
   * and v4.x (.select2-selection, .select2-container--open).
   *
   * @param {object} descriptor — Widget descriptor from scanner (has .element, .selectElement)
   * @param {string} value — Text to match in options
   * @returns {Promise<boolean>}
   */
  const fillSelect2 = async (descriptor, value) => {
    if (!value || !descriptor.element) return false;
    const container = descriptor.element;

    // 1. Click to open the dropdown
    // v3: .select2-choice, v4: .select2-selection
    const trigger = container.querySelector(".select2-choice, .select2-selection") || container;
    trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await delay(50, 100);
    trigger.click();
    await delay(200, 400);

    // 2. Find the active dropdown's results list
    let resultsUl = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      // v3: active drop has class select2-drop-active
      const activeDrop = document.querySelector(".select2-drop-active");
      if (activeDrop) {
        resultsUl = activeDrop.querySelector(".select2-results");
        if (resultsUl) break;
      }
      // v4: container gets --open modifier, dropdown is inside or appended to body
      const openContainer = document.querySelector(".select2-container--open");
      if (openContainer) {
        resultsUl = openContainer.querySelector(".select2-results");
        if (!resultsUl) {
          // v4 dropdown might be appended to body
          const dropdown = document.querySelector(".select2-dropdown");
          if (dropdown) resultsUl = dropdown.querySelector(".select2-results");
        }
        if (resultsUl) break;
      }
      await delay(50, 80);
    }

    if (!resultsUl) {
      console.warn(`[JAOS Filler] Select2: no results found for "${descriptor.label}"`);
      document.body.click();
      return false;
    }

    // 3. Type in search input if available (filters options)
    const searchInput = document.querySelector(
      ".select2-drop-active .select2-input, .select2-search__field, .select2-dropdown .select2-search input"
    );
    if (searchInput && searchInput.offsetParent !== null) {
      // Use first significant words as search term (max 30 chars)
      const searchTerm = value.length <= 30 ? value : value.split(/[\s,]+/).slice(0, 3).join(" ").substring(0, 30);
      const nativeSetter = getNativeSetter(searchInput);
      searchInput.focus();
      if (nativeSetter) {
        nativeSetter.call(searchInput, searchTerm);
      } else {
        searchInput.value = searchTerm;
      }
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
      searchInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
      await delay(300, 500);
    }

    // 4. Find matching option in results
    const optionEls = Array.from(
      resultsUl.querySelectorAll(
        'li.select2-result-selectable, li[role="option"]:not([aria-disabled="true"]), li.select2-results__option:not(.select2-results__option--disabled)'
      )
    ).filter(
      (el) =>
        !el.classList.contains("select2-result-unselectable") &&
        !el.classList.contains("select2-disabled")
    );

    const target = value.toLowerCase().trim();
    const getOptText = (o) => (o.textContent || "").trim().toLowerCase();

    // Normalize: keywords that mean "decline" / "prefer not to answer"
    const DECLINE_KEYWORDS = /decline|prefer not|don.?t wish|do not wish|not to (answer|say|disclose|identify)|choose not/i;
    const targetIsDecline = DECLINE_KEYWORDS.test(target);

    // Helper: extract significant words for overlap scoring
    const significantWords = (text) =>
      text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length >= 3);
    const targetWords = significantWords(target);

    // Multi-tier matching (mirrors fillSelect logic)
    const match =
      // Tier 1: Exact match
      optionEls.find((o) => getOptText(o) === target) ||
      // Tier 2: Option contains target
      optionEls.find((o) => getOptText(o).includes(target)) ||
      // Tier 3: Target contains option text
      optionEls.find((o) => {
        const t = getOptText(o);
        return t.length > 1 && target.includes(t);
      }) ||
      // Tier 3.5: Word overlap
      (() => {
        if (targetWords.length < 2) return null;
        let bestOption = null;
        let bestScore = 0;
        for (const o of optionEls) {
          const optWords = significantWords(o.textContent || "");
          if (optWords.length < 2) continue;
          const targetInOpt = targetWords.filter((w) => optWords.includes(w)).length;
          const optInTarget = optWords.filter((w) => targetWords.includes(w)).length;
          const score = (targetInOpt / targetWords.length + optInTarget / optWords.length) / 2;
          if (score > bestScore) {
            bestScore = score;
            bestOption = o;
          }
        }
        return bestScore >= 0.5 ? bestOption : null;
      })() ||
      // Tier 4: First word match
      optionEls.find((o) => {
        const optFirst = getOptText(o).split(/[\s,]/)[0];
        return optFirst.length > 1 && (optFirst === target || target === optFirst);
      }) ||
      // Tier 5: Semantic decline match
      (targetIsDecline ? optionEls.find((o) => DECLINE_KEYWORDS.test(o.textContent)) : null);

    if (match) {
      match.scrollIntoView?.({ block: "nearest" });
      await delay(50, 100);
      match.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      match.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      match.click();
      await delay(100, 200);
      return true;
    }

    // If search narrowed to exactly 1 result, take it
    if (searchInput && optionEls.length === 1) {
      optionEls[0].click();
      await delay(100, 200);
      return true;
    }

    console.warn(
      `[JAOS Filler] Select2: no match for "${value}" in ${optionEls.length} options for "${descriptor.label}"`
    );
    // Close dropdown via Escape key
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await delay(50, 100);
    return false;
  };

  /**
   * Upload a file to a file input using DataTransfer API.
   *
   * @param {HTMLInputElement} el — The file input
   * @param {File} file — The File object to attach
   * @returns {boolean}
   */
  const fillFileInput = (el, file) => {
    if (!(el instanceof HTMLInputElement) || el.type !== "file") return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (_e) {
      return false;
    }
  };

  /**
   * Main fill dispatcher.
   * Routes to the correct fill method based on field descriptor.
   *
   * @param {object} fieldDescriptor — From scanner.scanPage()
   * @param {string} value — The value to fill
   * @param {object} [opts] — Options
   * @param {boolean} [opts.humanType] — Use character-by-character typing (default false for speed)
   * @returns {Promise<boolean>} — Whether the field was successfully filled
   */
  const fillField = async (fieldDescriptor, value, opts = {}) => {
    const { humanType = false } = opts;
    const el = fieldDescriptor.element;
    const fieldLabel = fieldDescriptor.label || fieldDescriptor.name || fieldDescriptor.uid;

    if (!el || !value) {
      if (!value && el) {
        console.warn(`[JAOS Filler] Empty value for "${fieldLabel}" (type=${fieldDescriptor.type}) — skipping`);
      }
      return false;
    }

    // Skip if already has the correct value
    if (fieldDescriptor.type !== "checkbox" && fieldDescriptor.type !== "radio") {
      if (el.value === String(value)) return false;
    }

    // Route by type
    if (fieldDescriptor.type === "react-select") {
      console.log(`[JAOS Filler] react-select "${fieldLabel}" → "${String(value).substring(0, 40)}"`);
      return fillReactSelect(el, String(value));
    }

    if (fieldDescriptor.type === "aria-combobox") {
      console.log(`[JAOS Filler] aria-combobox "${fieldLabel}" → "${String(value).substring(0, 40)}"`);
      return fillAriaCombobox(fieldDescriptor, String(value));
    }

    if (fieldDescriptor.type === "select2") {
      console.log(`[JAOS Filler] select2 "${fieldLabel}" → "${String(value).substring(0, 50)}"`);
      return fillSelect2(fieldDescriptor, String(value));
    }

    if (fieldDescriptor.isFileInput) {
      return false;
    }

    if (fieldDescriptor.type === "checkbox" || fieldDescriptor.type === "radio") {
      const shouldCheck = /^(true|yes|1|y|on)$/i.test(String(value));
      console.log(`[JAOS Filler] checkbox "${fieldLabel}" → ${shouldCheck}`);
      return fillCheckbox(el, shouldCheck);
    }

    if (fieldDescriptor.tag === "select" || fieldDescriptor.type === "select" || fieldDescriptor.type === "select-one") {
      console.log(`[JAOS Filler] select "${fieldLabel}" → "${String(value).substring(0, 50)}"`);
      return fillSelect(el, String(value));
    }

    // Text inputs and textareas
    if (humanType) {
      await typeText(el, String(value));
      return true;
    } else {
      return setValue(el, String(value));
    }
  };

  window.__jaosFiller = {
    typeText,
    setValue,
    fillSelect,
    fillCheckbox,
    fillReactSelect,
    fillAriaCombobox,
    fillSelect2,
    fillFileInput,
    fillField,
    delay,
  };
})();
