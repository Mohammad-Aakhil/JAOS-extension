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
   * Matches by exact value, exact text, or partial text (case-insensitive).
   *
   * @param {HTMLSelectElement} el
   * @param {string} value — Value or text to match
   * @returns {boolean} — Whether a match was found and selected
   */
  const fillSelect = (el, value) => {
    if (!value || !(el instanceof HTMLSelectElement)) return false;

    const target = value.toLowerCase().trim();
    const options = Array.from(el.options).filter((o) => !o.disabled);

    const match =
      options.find((o) => o.value.toLowerCase() === target || o.textContent.trim().toLowerCase() === target) ||
      options.find((o) => o.value.toLowerCase().includes(target) || o.textContent.trim().toLowerCase().includes(target)) ||
      options.find((o) => target.includes(o.textContent.trim().toLowerCase()));

    if (!match) return false;

    el.focus();
    const nativeSetter = getNativeSetter(el);
    if (nativeSetter) {
      nativeSetter.call(el, match.value);
    } else {
      el.value = match.value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

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

    if (!el || !value) return false;

    // Skip if already has the correct value
    if (fieldDescriptor.type !== "checkbox" && fieldDescriptor.type !== "radio") {
      if (el.value === String(value)) return false;
    }

    // Route by type
    if (fieldDescriptor.type === "react-select") {
      return fillReactSelect(el, String(value));
    }

    if (fieldDescriptor.isFileInput) {
      // File inputs need a File object, not a string
      return false;
    }

    if (fieldDescriptor.type === "checkbox" || fieldDescriptor.type === "radio") {
      const shouldCheck = /^(true|yes|1|y|on)$/i.test(String(value));
      return fillCheckbox(el, shouldCheck);
    }

    if (fieldDescriptor.tag === "select" || fieldDescriptor.type === "select" || fieldDescriptor.type === "select-one") {
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
    fillFileInput,
    fillField,
    delay,
  };
})();
