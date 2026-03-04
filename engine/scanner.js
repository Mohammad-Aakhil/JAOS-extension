/**
 * engine/scanner.js — Universal DOM field scanner
 *
 * Content script that discovers all visible form fields on the page
 * and extracts rich metadata for LLM-based semantic mapping.
 *
 * Handles: <input>, <select>, <textarea>, custom widgets
 * (React-select, ARIA comboboxes/listboxes), and Shadow DOM.
 *
 * Registers: window.__jaosScanner
 */
(() => {
  if (window.__jaosScanner) return;

  const PANEL_ID = "jaos-dev-panel";
  const LAUNCHER_WRAP_ID = "jaos-floating-launcher-wrap";

  const FIELD_SELECTOR = [
    'input[type="text"]',
    'input[type="email"]',
    'input[type="tel"]',
    'input[type="number"]',
    'input[type="url"]',
    'input[type="date"]',
    'input[type="password"]',
    'input[type="search"]',
    'input:not([type])',
    "select",
    "textarea",
    'input[type="checkbox"]',
    'input[type="radio"]',
    'input[type="file"]',
  ].join(", ");

  /**
   * Clean whitespace from a string.
   */
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  /**
   * Check if an element is visible (not hidden, not zero-size).
   */
  const isVisible = (el) => {
    if (!el) return false;
    if (!el.offsetParent && el.tagName !== "BODY" && getComputedStyle(el).position !== "fixed") {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    }
    return true;
  };

  /**
   * CSS.escape wrapper.
   */
  const esc = (v) => {
    if (typeof v !== "string") return "";
    return window.CSS?.escape ? window.CSS.escape(v) : v.replace(/(["\\#.;:[\],+*~'>=|^$(){}!?])/g, "\\$1");
  };

  // ─── Shadow DOM traversal ───────────────────────────────────────────

  /**
   * querySelectorAll that pierces Shadow DOM boundaries.
   * Recursively walks into every element's shadowRoot to find matches.
   */
  const deepQuerySelectorAll = (root, selector) => {
    const results = [...root.querySelectorAll(selector)];
    // Walk all elements looking for shadow roots
    const walker = root.querySelectorAll("*");
    for (const el of walker) {
      if (el.shadowRoot) {
        results.push(...deepQuerySelectorAll(el.shadowRoot, selector));
      }
    }
    return results;
  };

  /**
   * querySelector that pierces Shadow DOM boundaries.
   */
  const deepQuerySelector = (root, selector) => {
    const result = root.querySelector(selector);
    if (result) return result;
    const walker = root.querySelectorAll("*");
    for (const el of walker) {
      if (el.shadowRoot) {
        const found = deepQuerySelector(el.shadowRoot, selector);
        if (found) return found;
      }
    }
    return null;
  };

  // ─── Label extraction ───────────────────────────────────────────────

  /**
   * Extract label text for a field from multiple sources.
   * Priority: label[for] → wrapping <label> → aria-labelledby →
   *           container heading → XPath preceding sibling → aria-describedby
   */
  const getLabel = (field) => {
    const parts = [];

    // 1. <label for="id">
    if (field.id) {
      const forLabels = document.querySelectorAll(`label[for="${esc(field.id)}"]`);
      forLabels.forEach((l) => {
        const t = clean(l.textContent);
        if (t) parts.push(t);
      });
    }

    // 2. Wrapping <label>
    const wrap = field.closest("label");
    if (wrap) {
      const t = clean(wrap.textContent);
      if (t) parts.push(t);
    }

    // 3. aria-labelledby
    const labelledBy = field.getAttribute("aria-labelledby");
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          const t = clean(el.textContent);
          if (t) parts.push(t);
        }
      });
    }

    // 4. Nearby label/legend in form-field container
    const container = field.closest(
      ".field, .form-field, [class*='field'], [class*='form-group'], [class*='question'], fieldset, [data-field]"
    );
    if (container) {
      const heading = container.querySelector("label, legend, .label, [class*='label'], h3, h4");
      if (heading && heading !== wrap) {
        const t = clean(heading.textContent);
        if (t && !parts.includes(t)) parts.push(t);
      }

      // Also grab question text if it's a custom question container
      const question = container.querySelector("[class*='question'], [class*='prompt']");
      if (question) {
        const t = clean(question.textContent);
        if (t && !parts.includes(t)) parts.push(t);
      }
    }

    // 5. XPath fallback — preceding sibling text (handles disconnected label→input)
    // Catches patterns where label is a plain <span>/<div>/<p> before the input,
    // not connected via for/id. Common on custom-built ATS forms.
    if (parts.length === 0) {
      let prev = field.previousElementSibling;
      for (let i = 0; i < 3 && prev; i++) {
        const tag = prev.tagName;
        // Only consider text-bearing elements that don't contain other inputs
        if (
          ["LABEL", "SPAN", "DIV", "P", "LEGEND", "H3", "H4", "H5"].includes(tag) &&
          !prev.querySelector("input, select, textarea")
        ) {
          const t = clean(prev.textContent);
          if (t && t.length < 120) {
            parts.push(t);
            break;
          }
        }
        prev = prev.previousElementSibling;
      }
    }

    // 6. XPath fallback — walk up and check parent's first text-bearing child
    // Handles: <div><span>Label</span><div><input></div></div>
    if (parts.length === 0 && field.parentElement) {
      const parent = field.parentElement;
      const textEl = parent.querySelector("label, legend, span, p, [class*='label']");
      if (textEl && !textEl.contains(field)) {
        const t = clean(textEl.textContent);
        if (t && t.length < 120) parts.push(t);
      }
    }

    // 7. aria-describedby (last resort — often has helper text)
    if (parts.length === 0) {
      const describedBy = field.getAttribute("aria-describedby");
      if (describedBy) {
        describedBy.split(/\s+/).forEach((id) => {
          const el = document.getElementById(id);
          if (el) {
            const t = clean(el.textContent);
            if (t && t.length < 120) parts.push(t);
          }
        });
      }
    }

    return clean(parts.join(" | "));
  };

  /**
   * Get the section/group heading that a field belongs to.
   */
  const getSectionContext = (field) => {
    let el = field;
    for (let i = 0; i < 12 && el; i++) {
      el = el.parentElement;
      if (!el) break;
      const heading = el.querySelector(
        "h1, h2, h3, h4, legend, .section-title, [class*='section-header'], [class*='step-title']"
      );
      if (heading) {
        const t = clean(heading.textContent);
        if (t && t.length < 100) return t;
      }
    }
    return "";
  };

  // ─── Option extraction ──────────────────────────────────────────────

  /**
   * Extract options from a <select> element.
   */
  const getSelectOptions = (field) => {
    if (!(field instanceof HTMLSelectElement)) return null;
    return Array.from(field.options)
      .filter((o) => o.value && !o.disabled)
      .map((o) => ({
        value: o.value,
        text: clean(o.textContent),
        selected: o.selected,
      }));
  };

  // ─── Data attribute extraction ──────────────────────────────────────

  /**
   * Extract useful data-* attributes from a field.
   * Critical for Workday (data-automation-id) and modern ATS (data-testid).
   */
  const getDataAttributes = (el) => {
    const attrs = {};
    const testId = el.getAttribute("data-testid");
    if (testId) attrs.dataTestId = testId;

    const automationId = el.getAttribute("data-automation-id");
    if (automationId) attrs.dataAutomationId = automationId;

    const fieldId = el.getAttribute("data-field-id");
    if (fieldId) attrs.dataFieldId = fieldId;

    const uiautId = el.getAttribute("data-uiautomation-id");
    if (uiautId) attrs.dataUiAutomationId = uiautId;

    return attrs;
  };

  // ─── Select2 detection ─────────────────────────────────────────────

  /**
   * Check if a <select> element is controlled by Select2.
   * Used by scanFields() to skip these (handled by scanSelect2Widgets).
   */
  const isSelect2Controlled = (el) => {
    if (el.tagName !== "SELECT") return false;
    // Select2 v3: adds .select2-offscreen class
    if (el.classList.contains("select2-offscreen")) return true;
    // Select2 v4: adds .select2-hidden-accessible class
    if (el.classList.contains("select2-hidden-accessible")) return true;
    // Generic: next sibling is the select2 container
    const next = el.nextElementSibling;
    if (next && next.classList?.contains("select2-container")) return true;
    return false;
  };

  // ─── Widget scanners ────────────────────────────────────────────────

  /**
   * Detect React-select / custom dropdown widgets in a container.
   * Returns array of widget descriptors.
   */
  const scanReactSelects = (rootEl) => {
    const widgets = [];
    const containers = deepQuerySelectorAll(
      rootEl || document,
      '[class*="-container"]:has([class*="__control"])'
    );

    for (const container of containers) {
      if (container.closest(`#${PANEL_ID}`) || container.closest(`#${LAUNCHER_WRAP_ID}`)) continue;
      if (!isVisible(container)) continue;

      const label = getLabel(container) || getSectionContext(container);
      const currentValue = container.querySelector('[class*="__single-value"]');
      const placeholder = container.querySelector('[class*="__placeholder"]');

      widgets.push({
        uid: `react-select-${widgets.length}-${Date.now()}`,
        type: "react-select",
        element: container,
        label: label,
        placeholder: clean(placeholder?.textContent || ""),
        currentValue: clean(currentValue?.textContent || ""),
        section: getSectionContext(container),
        hasValue: !!(currentValue && currentValue.textContent.trim()),
        ...getDataAttributes(container),
      });
    }

    return widgets;
  };

  /**
   * Detect generic ARIA combobox/listbox widgets.
   * These are custom dropdowns that use role="combobox" or role="listbox"
   * but aren't React-select. Common on Ashby, SmartRecruiters, custom ATS.
   */
  const scanAriaWidgets = (rootEl) => {
    const widgets = [];
    const root = rootEl || document;

    // role="combobox" — custom searchable dropdowns
    const comboboxes = deepQuerySelectorAll(root, '[role="combobox"]');
    for (const el of comboboxes) {
      if (el.closest(`#${PANEL_ID}`) || el.closest(`#${LAUNCHER_WRAP_ID}`)) continue;
      if (!isVisible(el)) continue;
      // Skip if this is inside a React-select container (already captured)
      if (el.closest('[class*="-container"]:has([class*="__control"])')) continue;
      // Skip if this is inside a Select2 widget (handled by scanSelect2Widgets)
      if (el.closest(".select2-container") || el.closest(".select2-drop")) continue;

      const input = el.tagName === "INPUT" ? el : el.querySelector("input");
      const label = getLabel(el) || getSectionContext(el);

      // Try to read current value from the input or the element's text
      const currentVal = input?.value || clean(el.textContent) || "";
      const placeholder = input?.placeholder || el.getAttribute("placeholder") || "";

      // Check for associated listbox to extract options
      const listboxId = el.getAttribute("aria-owns") || el.getAttribute("aria-controls");
      let options = null;
      if (listboxId) {
        const listbox = document.getElementById(listboxId);
        if (listbox) {
          const opts = listbox.querySelectorAll('[role="option"]');
          if (opts.length > 0 && opts.length <= 50) {
            options = Array.from(opts).map((o) => clean(o.textContent));
          }
        }
      }

      widgets.push({
        uid: `aria-combobox-${widgets.length}-${Date.now()}`,
        type: "aria-combobox",
        element: el,
        inputElement: input || el,
        label: label,
        placeholder: placeholder,
        currentValue: currentVal,
        section: getSectionContext(el),
        hasValue: !!(currentVal && currentVal.trim()),
        options: options,
        ...getDataAttributes(el),
      });
    }

    // role="listbox" that are standalone (not tied to a combobox we already found)
    const listboxes = deepQuerySelectorAll(root, '[role="listbox"]:not([aria-hidden="true"])');
    for (const el of listboxes) {
      if (el.closest(`#${PANEL_ID}`) || el.closest(`#${LAUNCHER_WRAP_ID}`)) continue;
      if (!isVisible(el)) continue;
      // Skip if there's a combobox pointing to this (already captured above)
      const ownerCombo = root.querySelector(`[aria-owns="${el.id}"], [aria-controls="${el.id}"]`);
      if (ownerCombo) continue;
      // Skip Select2 result lists (handled by scanSelect2Widgets)
      if (el.closest(".select2-container") || el.closest(".select2-drop") || el.classList.contains("select2-results")) continue;

      const label = getLabel(el) || getSectionContext(el);
      const selected = el.querySelector('[role="option"][aria-selected="true"]');
      const options = Array.from(el.querySelectorAll('[role="option"]'))
        .slice(0, 50)
        .map((o) => clean(o.textContent));

      widgets.push({
        uid: `aria-listbox-${widgets.length}-${Date.now()}`,
        type: "aria-listbox",
        element: el,
        label: label,
        placeholder: "",
        currentValue: selected ? clean(selected.textContent) : "",
        section: getSectionContext(el),
        hasValue: !!selected,
        options: options.length > 0 ? options : null,
        ...getDataAttributes(el),
      });
    }

    return widgets;
  };

  /**
   * Detect Select2 dropdown widgets.
   * Select2 hides the real <select> and renders a styled .select2-container.
   * Handles Select2 v3.x (.select2-choice) and v4.x (.select2-selection).
   */
  const scanSelect2Widgets = (rootEl) => {
    const widgets = [];
    const root = rootEl || document;
    const containers = deepQuerySelectorAll(root, ".select2-container");

    for (const container of containers) {
      if (container.closest(`#${PANEL_ID}`) || container.closest(`#${LAUNCHER_WRAP_ID}`)) continue;
      if (!isVisible(container)) continue;

      // Find the associated hidden <select> element
      let selectEl = null;

      // Method 1: Container id = "s2id_<select_id>" (Select2 v3)
      if (container.id && container.id.startsWith("s2id_")) {
        const selectId = container.id.slice(5);
        selectEl = document.getElementById(selectId);
      }

      // Method 2: Previous sibling is a <select>
      if (!selectEl && container.previousElementSibling?.tagName === "SELECT") {
        selectEl = container.previousElementSibling;
      }

      // Method 3: Parent contains a hidden <select> (not inside another select2)
      if (!selectEl && container.parentElement) {
        const candidate = container.parentElement.querySelector("select");
        if (candidate && !candidate.closest(".select2-container")) {
          selectEl = candidate;
        }
      }

      // Extract label from the hidden <select> (has for/id/name/aria attributes)
      const label = selectEl ? getLabel(selectEl) : getLabel(container);

      // Extract current selected value text
      // v3: .select2-chosen, v4: .select2-selection__rendered
      const chosenEl = container.querySelector(".select2-chosen, .select2-selection__rendered");
      const currentText = clean(chosenEl?.textContent || "");

      // Select2 shows placeholder text when nothing is selected
      const isPlaceholder = !currentText ||
        /^(select\.{0,3}|choose\.{0,3}|please select|-- select --|—)$/i.test(currentText);
      const hasValue = !isPlaceholder;

      // Extract options from the hidden <select> (AJAX-loaded may be empty)
      let options = null;
      if (selectEl) {
        const opts = Array.from(selectEl.options).filter((o) => o.value && !o.disabled);
        if (opts.length > 0 && opts.length <= 100) {
          options = opts.map((o) => ({
            value: o.value,
            text: clean(o.textContent),
          }));
        }
      }

      // Detect required from the hidden <select>
      const isRequired = selectEl
        ? (selectEl.required || selectEl.getAttribute("aria-required") === "true")
        : false;

      widgets.push({
        uid: `select2-${widgets.length}-${Date.now()}`,
        type: "select2",
        element: container,
        selectElement: selectEl,
        label: label,
        placeholder: !hasValue ? currentText : "",
        currentValue: hasValue ? currentText : "",
        section: getSectionContext(selectEl || container),
        hasValue: hasValue,
        required: isRequired,
        options: options,
        ...getDataAttributes(selectEl || container),
      });
    }

    return widgets;
  };

  // ─── Main field scanner ─────────────────────────────────────────────

  /**
   * Scan all visible standard form fields on the page.
   * Pierces Shadow DOM to find fields inside web components.
   * Returns an array of field descriptors with rich metadata.
   */
  const scanFields = (rootEl) => {
    const root = rootEl || document;
    // Use deep traversal to pierce Shadow DOM (OracleCloud spl-*, SuccessFactors)
    const elements = deepQuerySelectorAll(root, FIELD_SELECTOR);
    const fields = [];

    for (const el of elements) {
      // Skip our own panel elements
      if (el.closest(`#${PANEL_ID}`) || el.closest(`#${LAUNCHER_WRAP_ID}`)) continue;

      // Skip disabled/readonly (except selects which might be styled)
      if (el.disabled) continue;
      if (el.readOnly && el.tagName !== "SELECT") continue;

      // Skip select2-controlled selects (handled by scanSelect2Widgets)
      if (el.tagName === "SELECT" && isSelect2Controlled(el)) continue;

      // Skip hidden fields
      if (el.type === "hidden") continue;
      if (!isVisible(el)) continue;

      const label = getLabel(el);
      const section = getSectionContext(el);
      const dataAttrs = getDataAttributes(el);

      // Detect required: attribute, aria, OR asterisk in label / nearby markers
      let isRequired = el.required || el.getAttribute("aria-required") === "true";
      if (!isRequired) {
        // Check for asterisk in label text
        if (/\*/.test(label)) {
          isRequired = true;
        } else {
          // Walk up parents looking for asterisk markers (abbr/span/sup with *)
          let parent = el;
          for (let i = 0; i < 4 && !isRequired; i++) {
            parent = parent.parentElement;
            if (!parent || parent.tagName === "FORM" || parent.tagName === "BODY") break;
            for (const m of parent.querySelectorAll("abbr, span, sup")) {
              if ((m.textContent || "").trim() === "*") { isRequired = true; break; }
            }
          }
        }
      }

      const descriptor = {
        uid: `field-${fields.length}-${Date.now()}`,
        element: el,
        tag: el.tagName.toLowerCase(),
        type: el.type || (el.tagName === "TEXTAREA" ? "textarea" : el.tagName === "SELECT" ? "select" : "text"),
        name: el.getAttribute("name") || "",
        id: el.id || "",
        label: label,
        placeholder: el.placeholder || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        autocomplete: el.getAttribute("autocomplete") || "",
        section: section,
        required: isRequired,
        currentValue: el.type === "checkbox" ? String(el.checked) : (el.value || ""),
        hasValue: el.type === "checkbox" ? false : !!(el.value && el.value.trim()),
        options: getSelectOptions(el),
        accept: el.getAttribute("accept") || "",
        isFileInput: el.type === "file",
        ...dataAttrs,
      };

      fields.push(descriptor);
    }

    return fields;
  };

  // ─── Full page scan ─────────────────────────────────────────────────

  /**
   * Full page scan: standard fields + all widget types.
   * Returns { fields: [...], widgets: [...] }
   */
  const scanPage = (rootEl) => {
    const fields = scanFields(rootEl);
    const reactWidgets = scanReactSelects(rootEl);
    const ariaWidgets = scanAriaWidgets(rootEl);
    const select2Widgets = scanSelect2Widgets(rootEl);
    return { fields, widgets: [...reactWidgets, ...ariaWidgets, ...select2Widgets] };
  };

  // ─── LLM serialization ─────────────────────────────────────────────

  /**
   * Serialize scanned fields into a compact JSON representation
   * suitable for sending to the LLM. Strips DOM references.
   */
  const serializeForLLM = (scanResult) => {
    const serializeField = (f) => {
      const obj = {
        uid: f.uid,
        tag: f.tag,
        type: f.type,
        label: f.label || undefined,
        placeholder: f.placeholder || undefined,
        ariaLabel: f.ariaLabel || undefined,
        name: f.name || undefined,
        id: f.id || undefined,
        autocomplete: f.autocomplete || undefined,
        section: f.section || undefined,
        required: f.required || undefined,
        currentValue: f.hasValue ? f.currentValue : undefined,
        isFileInput: f.isFileInput || undefined,
        // data-* attributes — gives LLM extra context for field identification
        dataTestId: f.dataTestId || undefined,
        dataAutomationId: f.dataAutomationId || undefined,
        dataFieldId: f.dataFieldId || undefined,
        dataUiAutomationId: f.dataUiAutomationId || undefined,
      };

      // Include select options (trimmed for LLM context)
      if (f.options) {
        obj.options = f.options.slice(0, 50).map((o) => o.text || o.value);
      }

      // Remove undefined keys for compact JSON
      return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
    };

    const serializeWidget = (w) => {
      const obj = {
        uid: w.uid,
        type: w.type,
        label: w.label || undefined,
        placeholder: w.placeholder || undefined,
        section: w.section || undefined,
        currentValue: w.hasValue ? w.currentValue : undefined,
        // data-* attributes
        dataTestId: w.dataTestId || undefined,
        dataAutomationId: w.dataAutomationId || undefined,
        dataFieldId: w.dataFieldId || undefined,
        dataUiAutomationId: w.dataUiAutomationId || undefined,
      };

      // Include options for widgets (ARIA, Select2) — normalize to text strings
      if (w.options) {
        obj.options = w.options.slice(0, 50).map((o) =>
          typeof o === "string" ? o : (o.text || o.value || String(o))
        );
      }

      // Include required for widgets that carry it (select2)
      if (w.required) obj.required = true;

      return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
    };

    return {
      fields: scanResult.fields.map(serializeField),
      widgets: scanResult.widgets.map(serializeWidget),
    };
  };

  window.__jaosScanner = {
    scanFields,
    scanReactSelects,
    scanAriaWidgets,
    scanSelect2Widgets,
    scanPage,
    serializeForLLM,
    isVisible,
    getLabel,
    getSectionContext,
    deepQuerySelector,
    deepQuerySelectorAll,
  };
})();
