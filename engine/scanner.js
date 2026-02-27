/**
 * engine/scanner.js — Universal DOM field scanner
 *
 * Content script that discovers all visible form fields on the page
 * and extracts rich metadata for LLM-based semantic mapping.
 *
 * Handles: <input>, <select>, <textarea>, and custom widgets
 * (React-select, comboboxes) when an adapter provides widget hooks.
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
    if (!el || !el.offsetParent && el.tagName !== "BODY" && getComputedStyle(el).position !== "fixed") {
      // offsetParent is null for hidden elements, but also for fixed-position elements
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    }
    return true;
  };

  /**
   * Get the CSS selector escape function.
   */
  const esc = (v) => {
    if (typeof v !== "string") return "";
    return window.CSS?.escape ? window.CSS.escape(v) : v.replace(/(["\\#.;:[\],+*~'>=|^$(){}!?])/g, "\\$1");
  };

  /**
   * Extract label text for a field from multiple sources.
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

  /**
   * Detect React-select / custom dropdown widgets in a container.
   * Returns array of widget descriptors.
   */
  const scanReactSelects = (rootEl) => {
    const widgets = [];
    const containers = (rootEl || document).querySelectorAll(
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
      });
    }

    return widgets;
  };

  /**
   * Scan all visible standard form fields on the page.
   * Returns an array of field descriptors with rich metadata.
   */
  const scanFields = (rootEl) => {
    const root = rootEl || document;
    const elements = root.querySelectorAll(FIELD_SELECTOR);
    const fields = [];

    for (const el of elements) {
      // Skip our own panel elements
      if (el.closest(`#${PANEL_ID}`) || el.closest(`#${LAUNCHER_WRAP_ID}`)) continue;

      // Skip disabled/readonly (except selects which might be styled)
      if (el.disabled) continue;
      if (el.readOnly && el.tagName !== "SELECT") continue;

      // Skip hidden fields
      if (el.type === "hidden") continue;
      if (!isVisible(el)) continue;

      const label = getLabel(el);
      const section = getSectionContext(el);

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
        required: el.required || el.getAttribute("aria-required") === "true",
        currentValue: el.type === "checkbox" ? String(el.checked) : (el.value || ""),
        hasValue: el.type === "checkbox" ? false : !!(el.value && el.value.trim()),
        options: getSelectOptions(el),
        accept: el.getAttribute("accept") || "",
        isFileInput: el.type === "file",
      };

      fields.push(descriptor);
    }

    return fields;
  };

  /**
   * Full page scan: standard fields + custom widgets.
   * Returns { fields: [...], widgets: [...] }
   */
  const scanPage = (rootEl) => {
    const fields = scanFields(rootEl);
    const widgets = scanReactSelects(rootEl);
    return { fields, widgets };
  };

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
      };

      // Include select options (trimmed for LLM context)
      if (f.options) {
        obj.options = f.options.slice(0, 50).map((o) => o.text || o.value);
      }

      // Remove undefined keys for compact JSON
      return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
    };

    const serializeWidget = (w) => ({
      uid: w.uid,
      type: w.type,
      label: w.label || undefined,
      placeholder: w.placeholder || undefined,
      section: w.section || undefined,
      currentValue: w.hasValue ? w.currentValue : undefined,
    });

    return {
      fields: scanResult.fields.map(serializeField),
      widgets: scanResult.widgets.map(serializeWidget),
    };
  };

  window.__jaosScanner = {
    scanFields,
    scanReactSelects,
    scanPage,
    serializeForLLM,
    isVisible,
    getLabel,
    getSectionContext,
  };
})();
