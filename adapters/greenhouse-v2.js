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

  const GREENHOUSE_HOSTNAMES = /boards\.greenhouse\.io|job-boards\.greenhouse\.io|my\.greenhouse\.io/i;

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

  // ── Flow Definition ────────────────────────────────────────────────

  /**
   * Greenhouse applications can be:
   * 1. Single-page forms (most common)
   * 2. Multi-step embedded forms (#grnhse_app with iframes)
   *
   * The flow handles both cases.
   */
  const getFlow = () => {
    // Check if this is a multi-step greenhouse form
    const isMultiStep = !!document.querySelector(
      '.application-progress, [class*="step-indicator"], [class*="progress-bar"]'
    );

    if (isMultiStep) {
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
          // Detect phone country code widgets and add them to the scan
          const formRoot = getFormRoot();
          const phoneWidgets = detectPhoneCountryCodeWidget(formRoot);

          for (const pw of phoneWidgets) {
            if (pw.type === "react-select-phone") {
              // Already picked up by scanner's React-select detection
              continue;
            }
            if (pw.type === "iti-flag") {
              // Add as a custom widget for LLM to see
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
        },

        afterFill: async (ctx, fillResult) => {
          // Greenhouse React forms need blur events on all filled inputs
          // to trigger validation and state sync
          const formRoot = getFormRoot();
          const inputs = formRoot.querySelectorAll("input, select, textarea");

          for (const input of inputs) {
            if (input.value || input.checked) {
              triggerReactSync(input);
            }
          }

          // Handle phone country code widgets that couldn't be filled via standard flow
          await fillPhoneCountryCode(ctx, formRoot);

          // Wait for any validation messages to render
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

    afterFill: async (ctx) => {
      const formRoot = getFormRoot();
      const inputs = formRoot.querySelectorAll("input, select, textarea");
      for (const input of inputs) {
        if (input.value || input.checked) {
          triggerReactSync(input);
        }
      }
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

  registry.push({
    name: "greenhouse",
    detect,
    getFormRoot,
    getFlow,

    // No shouldOverwrite by default — respect existing values
    shouldOverwrite: () => false,
  });
})();
