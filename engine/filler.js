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
   * Get the visible label text for a checkbox/radio input.
   * Walks up the DOM to find the associated <label> — handles Greenhouse's
   * wrapper pattern where the label is a sibling of the input's parent div.
   *
   * DOM: <div class="checkbox__wrapper">
   *        <div class="checkbox__input"><input type="checkbox"></div>
   *        <label>Option Text</label>
   *      </div>
   */
  const _getInputLabelText = (input) => {
    // 1. Native labels association (label[for=id])
    if (input.labels && input.labels.length > 0) {
      const t = input.labels[0].textContent?.trim();
      if (t) return t;
    }
    // 2. Walk up to find sibling <label> in wrapper container (Greenhouse pattern)
    let parent = input.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const label = parent.querySelector("label");
      if (label && !label.contains(input)) {
        const t = label.textContent?.trim();
        if (t) return t;
      }
      // Also check for text-bearing sibling spans
      for (const sib of parent.children) {
        if (sib === input || sib.contains(input)) continue;
        if (sib.tagName === "LABEL" || sib.tagName === "SPAN") {
          const t = sib.textContent?.trim();
          if (t && t.length > 0 && t.length < 200) return t;
        }
      }
      parent = parent.parentElement;
    }
    // 3. Fallback: input value attribute
    return input.value || "";
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

    // Reset React _valueTracker so React detects changes on each keystroke
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue("");

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

    // Reset React _valueTracker so React detects the change on next input event.
    // Without this, React may not fire onChange and will overwrite our value on re-render.
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue("");

    el.focus();
    el.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
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
      console.log(`[JAOS Filler] No select match for "${value}" in [${options.map((o) => o.textContent.trim()).join(", ")}]`);
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
   * Fill a React-Select via React Fiber internals (no menu interaction).
   * Walks the fiber tree from the combobox input to find the parent
   * component's onChange, then calls it directly with a matched option object.
   * Works on Greenhouse emotion CSS React-Selects where click→menu fails.
   *
   * @param {HTMLElement} container — The react-select container element
   * @param {string} value — Text to match against option labels/values
   * @returns {boolean}
   */
  const fillReactSelectFiber = (container, value) => {
    if (!value || !container) return false;

    const input = container.querySelector(
      'input[role="combobox"], input[id^="react-select"], [class*="__input"] input'
    );
    if (!input) return false;

    const fiberKey = Object.keys(input).find(k => k.startsWith("__reactFiber$"));
    if (!fiberKey) return false;

    let fiber = input[fiberKey];
    let options = null;
    let selectInstance = null;
    let parentFn = null;
    let optionsLevel = -1;

    for (let i = 0; i < 30 && fiber; i++) {
      const props = fiber.memoizedProps || {};

      // Capture options array (first occurrence only)
      if (props.options && Array.isArray(props.options) && optionsLevel === -1) {
        options = props.options;
        optionsLevel = i;
      }

      // Strategy A: Find Select class instance with selectOption method.
      // react-select's Select class has selectOption(option) which handles
      // state update, menu close, focus, and calling the user's onChange.
      if (fiber.stateNode && typeof fiber.stateNode.selectOption === "function" && !selectInstance) {
        selectInstance = fiber.stateNode;
      }

      // Strategy B: Find onChange STRICTLY ABOVE the options level.
      // The onChange at the SAME level as options is handleInputChange
      // (expects event/string for text input) — calling it with {label, value}
      // causes TypeError. The correct selection onChange is at a higher level.
      if (typeof props.onChange === "function" && optionsLevel !== -1 && i > optionsLevel && !parentFn) {
        parentFn = props.onChange;
      }

      // Stop early if we have the primary strategy ready
      if (selectInstance && options) break;

      fiber = fiber.return;
    }

    if (!options || (!selectInstance && !parentFn)) return false;

    const target = value.toLowerCase().trim();
    const DECLINE = /decline|prefer not|don.?t wish|do not wish|not to (answer|say|disclose|identify)|choose not/i;

    const match =
      options.find(o => String(o.label || "").toLowerCase().trim() === target) ||
      options.find(o => String(o.label || "").toLowerCase().includes(target)) ||
      options.find(o => {
        const l = String(o.label || "").toLowerCase();
        return l.length > 1 && target.includes(l);
      }) ||
      options.find(o => String(o.value || "").toLowerCase().includes(target)) ||
      (DECLINE.test(target) ? options.find(o => DECLINE.test(String(o.label || ""))) : null);

    if (!match) return false;

    // Prefer selectOption — react-select's own internal method
    if (selectInstance) {
      try {
        selectInstance.selectOption(match);
        return true;
      } catch (e) {
        console.log("[JAOS Filler] selectOption() failed:", e.message);
      }
    }

    // Fallback to parent onChange (above options level)
    if (parentFn) {
      try {
        parentFn(match);
        return true;
      } catch (e) {
        console.log("[JAOS Filler] parent onChange() failed:", e.message);
      }
    }

    return false;
  };

  /**
   * Fill a React-select dropdown widget.
   * Tries React Fiber first (instant), falls back to click→menu interaction.
   *
   * @param {HTMLElement} container — The react-select container element
   * @param {string} value — Text to match in options
   * @returns {Promise<boolean>}
   */
  const fillReactSelect = async (container, value, skipBridge = false) => {
    if (!value || !container) return false;

    // Strategy 1: MAIN world fiber bridge (selectOption via custom DOM event)
    // Content scripts run in ISOLATED world and can't access __reactFiber$.
    // The fiber-bridge.js (MAIN world) handles this via custom events.
    // Skipped when orchestrator probe detected bridge is dead (avoids 2s timeout per field).
    if (!skipBridge) {
      const marker = `filler-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      container.setAttribute("data-jaos-rs", marker);
      const bridgeResult = await new Promise((resolve) => {
        const timeout = setTimeout(() => { cleanup(); resolve(false); }, 2000);
        const cleanup = () => {
          clearTimeout(timeout);
          document.removeEventListener("jaos:rs-fill-result", handler);
          container.removeAttribute("data-jaos-rs");
        };
        const handler = (e) => {
          if (e.detail?.marker !== marker) return;
          cleanup();
          resolve(e.detail.success);
        };
        document.addEventListener("jaos:rs-fill-result", handler);
        document.dispatchEvent(new CustomEvent("jaos:rs-fill", { detail: { marker, value } }));
      });
      if (bridgeResult) return true;
    }

    // Strategy 2: Click→menu fallback (if bridge unavailable or fiber failed)

    // Open the menu: try toggle button first (Greenhouse Remix), then input, then control
    const toggleBtn = container.querySelector('[class*="__indicators"] button, button[aria-label*="Toggle"]');
    const comboInput = container.querySelector('input[role="combobox"], [class*="__input"] input');
    const control =
      container.querySelector('[class*="__control"]') ||
      container.querySelector('[class*="-control"]');

    if (toggleBtn) {
      toggleBtn.click();
    } else if (comboInput) {
      comboInput.focus();
      comboInput.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    } else if (control) {
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      control.click();
    } else {
      console.log(`[JAOS Filler] React-select: no interactive element found in container`);
      return false;
    }
    await delay(200, 400);

    // Find the react-select search input (works for both standard and emotion)
    const searchInput = container.querySelector(
      'input[id^="react-select"], input[role="combobox"], [class*="__input"] input'
    );

    // Wait for menu via MutationObserver (reactive, no fixed polling ceiling)
    const findMenu = () => {
      let m =
        container.querySelector('[class*="__menu"]') ||
        container.querySelector('[class*="-menu"]:has([class*="-option"], [id*="-option-"])');
      // React-Select can portal menu to body — find by the listbox id linked to our input
      if (!m && searchInput) {
        const menuId = searchInput.getAttribute("aria-controls") || searchInput.getAttribute("aria-owns");
        if (menuId) {
          const linkedMenu = document.getElementById(menuId);
          if (linkedMenu) m = linkedMenu.closest('[class*="-menu"], [class*="__menu"]') || linkedMenu;
        }
      }
      return m;
    };

    let menu = findMenu();
    if (!menu) {
      menu = await new Promise((resolve) => {
        const maxWait = setTimeout(() => { obs.disconnect(); resolve(null); }, 5000);
        const obs = new MutationObserver(() => {
          const found = findMenu();
          if (found) {
            clearTimeout(maxWait);
            obs.disconnect();
            resolve(found);
          }
        });
        // Observe both the container (inline menu) and body (portaled menu)
        obs.observe(container, { childList: true, subtree: true });
        obs.observe(document.body, { childList: true, subtree: true });
      });
    }
    if (!menu) {
      document.body.click();
      return false;
    }

    const target = value.toLowerCase().trim();
    // Find options — standard (__option), emotion (css-HASH-option), or by role/id
    const options = Array.from(
      menu.querySelectorAll('[class*="__option"], [class*="-option"]:not([class*="-option-"]), [role="option"]')
    ).filter((o) => !o.getAttribute("aria-disabled"));

    // Normalize: decline keywords
    const DECLINE_KEYWORDS = /decline|prefer not|don.?t wish|do not wish|not to (answer|say|disclose|identify)|choose not/i;
    const targetIsDecline = DECLINE_KEYWORDS.test(target);

    // Multi-tier matching (same as fillSelect)
    const match =
      // Tier 1: Exact match
      options.find((o) => o.textContent.trim().toLowerCase() === target) ||
      // Tier 2: Option contains target
      options.find((o) => o.textContent.trim().toLowerCase().includes(target)) ||
      // Tier 3: Target contains option text
      options.find((o) => {
        const t = o.textContent.trim().toLowerCase();
        return t.length > 1 && target.includes(t);
      }) ||
      // Tier 4: Semantic decline match
      (targetIsDecline ? options.find((o) => DECLINE_KEYWORDS.test(o.textContent)) : null);

    if (match) {
      match.scrollIntoView?.({ block: "nearest" });
      await delay(50, 100);
      match.click();
      await delay(100, 200);
      return true;
    }

    // Try typing into search input to filter options
    if (searchInput) {
      const nativeSetter = getNativeSetter(searchInput);
      searchInput.focus();
      // Reset tracker so React picks up the search text
      const tracker = searchInput._valueTracker;
      if (tracker) tracker.setValue("");
      if (nativeSetter) {
        nativeSetter.call(searchInput, value);
      } else {
        searchInput.value = value;
      }
      searchInput.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
      await delay(300, 500);

      const filtered = menu.querySelectorAll(
        '[class*="__option"], [class*="-option"]:not([class*="-option-"]), [role="option"]'
      );
      const filteredArr = Array.from(filtered).filter((o) => !o.getAttribute("aria-disabled"));
      if (filteredArr.length > 0) {
        // Pick best match from filtered results
        const filteredMatch =
          filteredArr.find((o) => o.textContent.trim().toLowerCase() === target) ||
          filteredArr.find((o) => o.textContent.trim().toLowerCase().includes(target)) ||
          filteredArr[0]; // Take first if search narrowed results
        filteredMatch.click();
        await delay(100, 200);
        return true;
      }
    }

    // Close without selection
    document.body.click();
    await delay(50, 100);
    console.log(`[JAOS Filler] React-select: no match for "${value}" in ${options.length} options`);
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
      console.log(`[JAOS Filler] Select2: no results found for "${descriptor.label}"`);
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

    console.log(
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
    const { humanType = false, skipBridge = false } = opts;
    const el = fieldDescriptor.element;
    const fieldLabel = fieldDescriptor.label || fieldDescriptor.name || fieldDescriptor.uid;

    if (!el || !value) {
      if (!value && el) {
        console.log(`[JAOS Filler] Empty value for "${fieldLabel}" (type=${fieldDescriptor.type}) — skipping`);
      }
      return false;
    }

    // Check if element is still in the DOM (React may have re-rendered during LLM wait)
    if (!el.isConnected) {
      console.log(`[JAOS Filler] Element DETACHED from DOM for "${fieldLabel}" (type=${fieldDescriptor.type}) — React likely re-rendered. Skipping.`);
      return false;
    }

    // Skip if already has the correct value
    if (fieldDescriptor.type !== "checkbox" && fieldDescriptor.type !== "radio" &&
        fieldDescriptor.type !== "radio-group" && fieldDescriptor.type !== "checkbox-group") {
      if (el.value === String(value)) return false;
    }

    // Route by type
    if (fieldDescriptor.type === "react-select") {
      console.log(`[JAOS Filler] react-select "${fieldLabel}" → "${String(value).substring(0, 40)}"`);
      return fillReactSelect(el, String(value), skipBridge);
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

    if (fieldDescriptor.type === "radio-group") {
      // Find the matching radio input inside the container and .click() it
      // Must use real .click() — React-controlled radios ignore programmatic checked + events
      const radios = el.querySelectorAll('input[type="radio"]');
      const target = String(value).toLowerCase().trim();
      let matched = false;
      for (const radio of radios) {
        const radioText = _getInputLabelText(radio).toLowerCase().trim();
        if (radioText === target || radioText.includes(target) || target.includes(radioText) ||
            radio.value.toLowerCase() === target) {
          radio.click();
          matched = true;
          console.log(`[JAOS Filler] radio-group "${fieldLabel}" → "${radioText.substring(0, 40)}"`);
          break;
        }
      }
      if (!matched) console.log(`[JAOS Filler] radio-group "${fieldLabel}": no match for "${value}" in ${radios.length} options`);
      return matched;
    }

    if (fieldDescriptor.type === "checkbox-group") {
      // value can be comma-separated list or array — click matching checkboxes
      // Must use real .click() — Greenhouse renders React-controlled custom checkboxes
      // with SVG icons; setting .checked + dispatching events doesn't update React state
      const checkboxes = el.querySelectorAll('input[type="checkbox"]');
      const targets = (Array.isArray(value) ? value : String(value).split(","))
        .map((v) => v.toLowerCase().trim())
        .filter(Boolean);
      let filled = 0;
      for (const cb of checkboxes) {
        const cbText = _getInputLabelText(cb).toLowerCase().trim();
        // Use word-boundary matching to avoid "man" matching "woman"
        const shouldCheck = targets.some((t) => {
          if (cbText === t || cb.value.toLowerCase() === t) return true;
          // Word-boundary check: "man" should NOT match "woman"
          const wordRegex = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          return wordRegex.test(cbText);
        });
        if (shouldCheck && !cb.checked) {
          cb.click();
          filled++;
        }
      }
      console.log(`[JAOS Filler] checkbox-group "${fieldLabel}" → checked ${filled}/${targets.length} matches`);
      return filled > 0;
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

    // Text inputs and textareas — guard against non-input elements (e.g. div containers
    // from widgets that weren't routed to their correct fill method)
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA" && !el.isContentEditable) {
      console.log(`[JAOS Filler] Cannot fill <${el.tagName}> as text for "${fieldLabel}" (type=${fieldDescriptor.type}) — element is not a text input`);
      return false;
    }

    console.log(`[JAOS Filler] text "${fieldLabel}" → "${String(value).substring(0, 40)}"`);
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
    fillReactSelectFiber,
    fillReactSelect,
    fillAriaCombobox,
    fillSelect2,
    fillFileInput,
    fillField,
    delay,
  };
})();
