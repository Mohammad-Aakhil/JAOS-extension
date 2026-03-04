/**
 * adapters/greenhouse-v2.js — Greenhouse ATS adapter (v2 architecture)
 *
 * This adapter handles ONLY:
 *  - Portal detection (hostname, DOM markers)
 *  - Rendering timing (wait for React hydration via MutationObserver)
 *  - Step transitions (multi-step navigation, "Next"/"Submit")
 *  - Validation triggers (React event dispatching, blur sequences)
 *  - Portal quirks (React-select, intl-tel-input, demographic sections)
 *
 * This adapter does NOT:
 *  - Hardcode field selectors per input
 *  - Map fields manually to profile keys
 *  - Decide what value goes where (LLM does that)
 *
 * Flow: detect → waitForFormReady → scan → LLM map → fill → afterFill → advance
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 = window.__jaosAtsAdaptersV2 || []);

  // ── Detection ──────────────────────────────────────────────────────

  const GREENHOUSE_HOSTNAMES = /(?:boards|job-boards|my)(?:\.\w+)?\.greenhouse\.io/i;

  const GREENHOUSE_FORM_SELECTORS = [
    "#grnhse_app",
    "#application_form.job-application",
    "#application.job-application",
  ];

  const GREENHOUSE_FIELD_PATTERN = 'input[name^="job_application["], select[name^="job_application["], textarea[name^="job_application["]';

  const GREENHOUSE_EMBED_PATTERN = 'script[src*="greenhouse.io"], iframe[src*="greenhouse.io"], link[href*="greenhouse.io"]';

  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';

  const detect = () => {
    // Direct Greenhouse hostnames — always detect
    if (GREENHOUSE_HOSTNAMES.test(window.location.hostname)) return true;

    // Check for Greenhouse form containers that actually have form fields inside.
    // On white-labeled sites, #grnhse_app may be an empty iframe wrapper.
    for (const sel of GREENHOUSE_FORM_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && el.querySelector(FORM_FIELD_CHECK)) return true;
    }

    // Greenhouse-specific field naming convention (definitive signal)
    if (document.querySelector(GREENHOUSE_FIELD_PATTERN)) return true;

    // Embed patterns (iframe/script/link) alone are NOT enough to detect —
    // if the form is inside an iframe, the content script inside the iframe
    // will handle detection via hostname or field patterns above.
    return false;
  };

  // ── Form root discovery ────────────────────────────────────────────

  /**
   * Find the best form root. Validates that candidates actually contain
   * form fields — on white-labeled sites (e.g. careers.encora.com),
   * #grnhse_app may be an empty embed container or iframe wrapper,
   * while the actual fields are rendered elsewhere on the page.
   */
  const getFormRoot = () => {
    const candidates = [
      document.querySelector("#grnhse_app"),
      document.querySelector("#application_form"),
      document.querySelector("#application"),
      document.querySelector('form[action*="greenhouse"]'),
    ];

    for (const el of candidates) {
      if (el && el.querySelector(FORM_FIELD_CHECK)) return el;
    }

    return document.body;
  };

  // ── Greenhouse-specific quirks ─────────────────────────────────────

  /**
   * Greenhouse uses React for many form controls. After setting values,
   * we need to ensure React's internal state is synced by dispatching
   * the correct event sequence.
   */
  const triggerReactSync = (el) => {
    // React 15/16 uses a custom event property
    const tracker = el._valueTracker;
    if (tracker) {
      tracker.setValue("");
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  /**
   * Greenhouse renders phone country codes in three different ways.
   * This handles detecting which variant is present.
   */
  const detectPhoneCountryCodeWidget = (formRoot) => {
    const phoneContainers = formRoot.querySelectorAll(
      '.field:has(input[type="tel"]), .form-field:has(input[type="tel"]), [class*="phone"]:has(input[type="tel"])'
    );

    const widgets = [];
    for (const container of phoneContainers) {
      // Variant A: native <select>
      const nativeSelect = container.querySelector("select");
      if (nativeSelect) {
        widgets.push({ type: "native-select", element: nativeSelect, container });
        continue;
      }

      // Variant B: intl-tel-input flag dropdown
      const itiFlag = container.querySelector(
        ".iti__selected-flag, [class*='flag-container'], [class*='country-selector']"
      );
      if (itiFlag) {
        widgets.push({ type: "iti-flag", element: itiFlag, container });
        continue;
      }

      // Variant C: React-select country code
      const reactSelect = container.querySelector(
        '[class*="-container"]:has([class*="__control"])'
      );
      if (reactSelect) {
        widgets.push({ type: "react-select-phone", element: reactSelect, container });
      }
    }

    return widgets;
  };

  /**
   * Greenhouse location fields use typeahead/autocomplete.
   * After the filler types a location value, a dropdown appears with suggestions.
   * We need to click the first suggestion so the value "commits" to the form.
   *
   * Handles:
   *  - Google Places Autocomplete (.pac-container / .pac-item)
   *  - Greenhouse custom typeahead (ul with li, [role="listbox"] with [role="option"])
   */
  const handleLocationAutocomplete = async (formRoot) => {
    // Find text inputs that look like location/city/address fields
    const textInputs = formRoot.querySelectorAll('input[type="text"], input:not([type])');

    for (const input of textInputs) {
      if (!input.value) continue;

      // Identify location fields by label, name, id, or autocomplete attribute
      const label = (
        input.getAttribute("aria-label") ||
        input.getAttribute("name") ||
        input.id ||
        input.closest(".field, .form-field, [class*='field']")?.querySelector("label")?.textContent ||
        ""
      ).toLowerCase();

      const isLocation = /(location|city|address|zip|postal)/i.test(label) ||
        input.getAttribute("autocomplete")?.includes("address") ||
        input.getAttribute("autocomplete")?.includes("locality");

      if (!isLocation) continue;

      // Re-focus the input to re-trigger autocomplete dropdown
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));

      // Wait for autocomplete to render
      await new Promise((r) => setTimeout(r, 600));

      // Try Google Places Autocomplete
      const pacContainer = document.querySelector(".pac-container");
      if (pacContainer) {
        const firstItem = pacContainer.querySelector(".pac-item");
        if (firstItem) {
          // Google Places uses mousedown, not click
          firstItem.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
      }

      // Try Greenhouse custom autocomplete / generic listbox near the input
      const container = input.closest(".field, .form-field, [class*='field']") || input.parentElement;
      const dropdown =
        container?.querySelector('[role="listbox"], ul.autocomplete-results, [class*="autocomplete"], [class*="suggestion"]') ||
        document.querySelector('[role="listbox"]:not([aria-hidden="true"])');

      if (dropdown && dropdown.children.length > 0) {
        const firstOption = dropdown.querySelector('[role="option"], li, [class*="item"]') || dropdown.children[0];
        if (firstOption) {
          firstOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 100));
          firstOption.click();
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
      }

      // Blur to close any orphaned dropdown
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    }
  };

  // ── Greenhouse scan cleanup helpers ─────────────────────────────────

  /**
   * Deep visibility check — walks the parent chain checking computed styles.
   * The generic scanner's isVisible() only checks the element itself, which can
   * miss elements inside conditionally hidden parent containers (display:none,
   * opacity:0, max-height:0 with overflow:hidden).
   */
  const isDeepVisible = (el, boundary) => {
    let node = el;
    while (node && node !== boundary && node !== document.body) {
      try {
        const style = getComputedStyle(node);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          parseFloat(style.opacity) === 0 ||
          (style.maxHeight === "0px" && style.overflow === "hidden")
        ) {
          return false;
        }
      } catch (_e) {
        return false;
      }
      node = node.parentElement;
    }
    return true;
  };

  /**
   * Extract a label for a react-select widget using Greenhouse-specific DOM patterns.
   * The generic scanner's getLabel() often fails because Greenhouse uses randomized
   * CSS module class names that don't match generic patterns like [class*='field'].
   */
  const getGreenhouseReactSelectLabel = (container) => {
    // Strategy 1: Walk up looking for a sibling <label> element
    let parent = container.parentElement;
    for (let depth = 0; depth < 5 && parent; depth++) {
      for (const child of parent.children) {
        if (child === container || child.contains(container)) continue;
        const isLabelEl =
          child.tagName === "LABEL" ||
          child.tagName === "LEGEND" ||
          (child.matches &&
            child.matches(
              '.label, [class*="label"]:not([class*="container"]):not([class*="control"])'
            ));
        if (!isLabelEl) continue;
        const text = (child.textContent || "")
          .trim()
          .replace(/\s*\*\s*$/, "")
          .replace(/\s+/g, " ");
        if (
          text &&
          text.length > 1 &&
          text.length < 100 &&
          !text.toLowerCase().includes("if you selected")
        ) {
          return text;
        }
      }
      parent = parent.parentElement;
    }

    // Strategy 2: ARIA attributes on the hidden input inside react-select
    const ariaInput = container.querySelector("input[aria-label]");
    if (ariaInput) {
      const label = (ariaInput.getAttribute("aria-label") || "").trim();
      if (label) return label;
    }
    const labelledInput = container.querySelector("input[aria-labelledby]");
    if (labelledInput) {
      const id = labelledInput.getAttribute("aria-labelledby");
      if (id) {
        const el = document.getElementById(id);
        if (el) {
          const text = (el.textContent || "").trim().replace(/\s*\*\s*$/, "");
          if (text) return text;
        }
      }
    }

    // Strategy 3: Parse Greenhouse's name attribute
    // e.g. "job_application[education_school_name_0]" → "School Name"
    const namedInput = container.querySelector("input[name]");
    if (namedInput) {
      const name = namedInput.getAttribute("name") || "";
      const match = name.match(/\[(?:education_|experience_)?(\w+?)(?:_\d+)?\]$/);
      if (match) {
        return match[1]
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }

    // Strategy 4: Placeholder text (if not generic "Select...")
    const placeholder = container.querySelector('[class*="__placeholder"]');
    if (placeholder) {
      const text = (placeholder.textContent || "").trim();
      if (text && !/^select\.?\.?\.?$/i.test(text) && text.length > 1) {
        return text;
      }
    }

    return null;
  };

  /**
   * Greenhouse-specific scan result cleanup.
   * Filters noise, improves labels, removes hidden conditional fields.
   * Called from augmentScan in both single-page and multi-step flows.
   */
  const cleanupScanResult = (scanResult, formRoot) => {
    const beforeFields = scanResult.fields.length;
    const beforeWidgets = scanResult.widgets.length;

    // ── 1. Filter conditional "Other" text fields ──
    // Greenhouse shows "If you selected 'Other' as your school/degree/discipline,
    // please enter..." — only relevant when "Other" is actually selected.
    scanResult.fields = scanResult.fields.filter((f) => {
      const label = (f.label || "").toLowerCase();
      if (label.includes("if you selected") && label.includes("other")) return false;
      if (label.startsWith("if other,") || label.startsWith("if other ")) return false;
      return true;
    });

    // ── 2. Deep visibility filter ──
    // Catches elements inside containers hidden via CSS that isVisible() missed.
    scanResult.fields = scanResult.fields.filter((f) =>
      isDeepVisible(f.element, formRoot)
    );
    scanResult.widgets = scanResult.widgets.filter((w) =>
      isDeepVisible(w.element, formRoot)
    );

    // ── 3. Improve react-select widget labels ──
    // The generic scanner's getLabel() often fails on react-select containers
    // because Greenhouse uses randomized CSS class names.
    for (const w of scanResult.widgets) {
      if (w.type !== "react-select") continue;
      const label = (w.label || "").trim().toLowerCase();
      if (!label || label === "field" || label === "widget" || label.length < 2) {
        const improved = getGreenhouseReactSelectLabel(w.element);
        if (improved) {
          console.log(
            `[JAOS Greenhouse] Improved label: "${w.label || "(empty)"}" → "${improved}"`
          );
          w.label = improved;
        }
      }
    }

    // ── 4. Clean up concatenated field labels ──
    // The generic scanner joins multiple label sources with " | ", producing
    // confusing labels like "Last Name | First Name". Fix by extracting the best part.
    for (const f of scanResult.fields) {
      if (!f.label || !f.label.includes(" | ")) continue;
      const parts = f.label
        .split(" | ")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 2) continue;

      const fieldName = (f.name || "").toLowerCase().replace(/[\[\]_]/g, " ");
      const fieldId = (f.id || "").toLowerCase().replace(/[\[\]_]/g, " ");
      const autocomplete = (f.autocomplete || "").toLowerCase();

      // If a part matches the field's name/id/autocomplete, use that part
      const matchingPart = parts.find((p) => {
        const pl = p.toLowerCase().replace(/[^a-z ]/g, "");
        return (
          (fieldName && fieldName.includes(pl)) ||
          (fieldId && fieldId.includes(pl)) ||
          (autocomplete && autocomplete.includes(pl))
        );
      });

      if (matchingPart) {
        f.label = matchingPart;
      } else {
        // Take the shortest meaningful part (usually the most specific)
        const shortest = parts
          .filter((p) => p.length > 1 && p.length < 60)
          .sort((a, b) => a.length - b.length)[0];
        if (shortest) f.label = shortest;
      }
    }

    // ── 5. Filter fields with no identifying info ──
    // The LLM can't meaningfully fill a field with no label, name, or placeholder.
    scanResult.fields = scanResult.fields.filter((f) => {
      if (f.isFileInput) return true;
      if (f.label || f.name || f.placeholder || f.ariaLabel || f.autocomplete) return true;
      return false;
    });

    const removedFields = beforeFields - scanResult.fields.length;
    const removedWidgets = beforeWidgets - scanResult.widgets.length;
    if (removedFields > 0 || removedWidgets > 0) {
      console.log(
        `[JAOS Greenhouse] Cleaned scan: removed ${removedFields} fields + ${removedWidgets} widgets ` +
        `(${scanResult.fields.length} fields + ${scanResult.widgets.length} widgets remain)`
      );
    }
  };

  /**
   * Detect and add phone country code widgets to the scan result.
   * Shared helper for both single-page and multi-step flows.
   */
  const addPhoneWidgets = (scanResult, formRoot) => {
    const phoneWidgets = detectPhoneCountryCodeWidget(formRoot);
    for (const pw of phoneWidgets) {
      if (pw.type === "react-select-phone") continue;
      if (pw.type === "iti-flag") {
        scanResult.widgets.push({
          uid: `phone-country-${scanResult.widgets.length}-${Date.now()}`,
          type: "phone-country-iti",
          element: pw.element,
          label: "Phone Country Code",
          placeholder: "",
          currentValue: "",
          section: "Contact Information",
          hasValue: false,
          _container: pw.container,
        });
      }
    }
  };

  // ── Flow Definition ────────────────────────────────────────────────

  /**
   * Greenhouse applications can be:
   * 1. Single-page forms (most common)
   * 2. Multi-step embedded forms (#grnhse_app with iframes)
   *
   * The flow handles both cases.
   */
  const getFlow = () => {
    // Only treat as multi-step if there's an actual "Next"/"Continue" button
    // visible in the form. CSS class heuristics (progress-bar, step-indicator)
    // produce false positives on single-page Greenhouse forms.
    const formRoot = getFormRoot();
    const buttons = Array.from(formRoot.querySelectorAll('button, input[type="submit"], a.btn'));
    const hasNextButton = buttons.some((btn) => {
      const text = (btn.textContent || btn.value || "").trim().toLowerCase();
      return /^(next|continue|save\s*&?\s*continue|proceed)$/i.test(text);
    });

    if (hasNextButton) {
      return [
        buildStepFlowEntry("personal-info", "Personal Information"),
        buildStepFlowEntry("resume-cover", "Resume & Cover Letter"),
        buildStepFlowEntry("questions", "Application Questions"),
        buildStepFlowEntry("demographics", "Demographics"),
      ];
    }

    // Single-page: one big scan+fill
    return [
      {
        id: "application",
        label: "Application Form",

        waitFor: async (ctx) => {
          const { waitForElement, waitForDomStable } = ctx.utils;
          const formRoot = getFormRoot();

          // Wait for at least one form field to appear
          try {
            await waitForElement(
              'input, select, textarea',
              formRoot,
              8000
            );
          } catch (_e) {
            // Form might already be loaded
          }

          // Wait for React hydration to complete (DOM stabilizes)
          await waitForDomStable(500, 4000);
        },

        getFormRoot: () => getFormRoot(),

        augmentScan: async (ctx, scanResult) => {
          const formRoot = getFormRoot();
          cleanupScanResult(scanResult, formRoot);
          addPhoneWidgets(scanResult, formRoot);
        },

        afterFill: async (ctx, fillResult) => {
          const formRoot = getFormRoot();

          // 1. Handle location autocomplete — click the first suggestion
          //    Must run BEFORE React sync so the selected value sticks
          await handleLocationAutocomplete(formRoot);

          // 2. React sync on text inputs/textareas ONLY
          //    Skip <select> — fillSelect already handles _valueTracker + events.
          //    Re-syncing selects can cause React to re-render and undo the fill.
          const inputs = formRoot.querySelectorAll("input, select, textarea");
          for (const input of inputs) {
            if (input.tagName === "SELECT") continue;
            if (input.value || input.checked) {
              triggerReactSync(input);
            }
          }

          // 3. Handle phone country code widgets
          await fillPhoneCountryCode(ctx, formRoot);

          // 4. Wait for validation messages to render
          await ctx.utils.waitForDomStable(300, 2000);
        },
      },
    ];
  };

  /**
   * Build a flow entry for a multi-step form step.
   */
  const buildStepFlowEntry = (id, label) => ({
    id,
    label,

    waitFor: async (ctx) => {
      await ctx.utils.waitForDomStable(500, 4000);
    },

    getFormRoot: () => getFormRoot(),

    augmentScan: async (ctx, scanResult) => {
      const formRoot = getFormRoot();
      cleanupScanResult(scanResult, formRoot);
      addPhoneWidgets(scanResult, formRoot);
    },

    afterFill: async (ctx) => {
      const formRoot = getFormRoot();
      await handleLocationAutocomplete(formRoot);
      const inputs = formRoot.querySelectorAll("input, select, textarea");
      for (const input of inputs) {
        if (input.tagName === "SELECT") continue;
        if (input.value || input.checked) {
          triggerReactSync(input);
        }
      }
      await fillPhoneCountryCode(ctx, formRoot);
      await ctx.utils.waitForDomStable(300, 2000);
    },

    advance: async (ctx) => {
      // Find and click the "Next" / "Continue" button
      const formRoot = getFormRoot();
      const buttons = Array.from(formRoot.querySelectorAll('button, input[type="submit"], a.btn'));
      const nextBtn = buttons.find((btn) => {
        const text = (btn.textContent || btn.value || "").trim().toLowerCase();
        return /^(next|continue|save\s*&?\s*continue|proceed)$/i.test(text);
      });

      if (!nextBtn) {
        return false;
      }

      nextBtn.click();

      // Wait for the next step to render via MutationObserver
      try {
        await ctx.utils.waitForMutation({
          predicate: (mutations) => {
            // The form content should change significantly
            return mutations.some((m) => m.addedNodes.length > 0);
          },
          timeoutMs: 5000,
        });
        await ctx.utils.waitForDomStable(400, 3000);
        return true;
      } catch (_e) {
        return false;
      }
    },
  });

  /**
   * Handle phone country code filling after the main LLM fill.
   * This is a quirk-handler, not a field mapper — it uses the profile's country
   * to set the correct phone country code.
   */
  const fillPhoneCountryCode = async (ctx, formRoot) => {
    const filler = ctx.utils.filler;
    const phoneWidgets = detectPhoneCountryCodeWidget(formRoot);
    const country = ctx.profile.country || "United States";
    const isUS = /^(us|usa|united states)/i.test(country);
    const countryCode = isUS ? "+1" : "";

    for (const pw of phoneWidgets) {
      try {
        if (pw.type === "native-select") {
          const sel = pw.element;
          if (sel.disabled) continue;
          const match = Array.from(sel.options).find((o) =>
            isUS
              ? /united states/i.test(o.textContent) || /^us$/i.test(o.value) || /\+1\b/.test(o.textContent)
              : o.textContent.toLowerCase().includes(country.toLowerCase())
          );
          if (match && sel.value !== match.value) {
            filler.fillSelect(sel, match.value);
          }
        } else if (pw.type === "iti-flag") {
          pw.element.click();
          // Wait for dropdown to appear
          try {
            const dropdown = await ctx.utils.waitForElement(
              '.iti__country-list, [class*="country-list"]',
              document.body,
              2000
            );
            if (dropdown) {
              const usItem = dropdown.querySelector(
                isUS
                  ? '.iti__country[data-country-code="us"], [data-dial-code="1"][data-country-code="us"]'
                  : `[data-country-code]`
              );
              if (usItem) {
                usItem.click();
              } else {
                document.body.click(); // close dropdown
              }
            }
          } catch (_e) {
            document.body.click();
          }
        } else if (pw.type === "react-select-phone") {
          const targetText = isUS ? "United States" : country;
          await filler.fillReactSelect(pw.element, targetText);
        }
      } catch (err) {
        console.warn("[JAOS Greenhouse] Phone country code fill failed:", err.message);
      }
    }
  };

  // ── Register adapter ───────────────────────────────────────────────

  if (registry.some((a) => a.name === "greenhouse")) return;

  registry.push({
    name: "greenhouse",
    detect,
    getFormRoot,
    getFlow,

    // No shouldOverwrite by default — respect existing values
    shouldOverwrite: () => false,
  });
})();
