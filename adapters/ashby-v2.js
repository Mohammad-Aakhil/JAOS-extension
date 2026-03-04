/**
 * adapters/ashby-v2.js — Ashby ATS adapter (v2 architecture)
 *
 * Ashby uses React with some quirks:
 *  - Polymorphic field names: standard (name, email) AND _systemfield_ variants
 *  - Combined "Full Name" field (first + last) — LLM handles naturally
 *  - Custom search combobox fields ([role="combobox"])
 *  - React state needs sync after fill (_valueTracker pattern)
 *
 * Flow: detect → waitForDomStable → scan → augmentScan → LLM map → fill → afterFill
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 =
    window.__jaosAtsAdaptersV2 || []);

  // ── Detection ──────────────────────────────────────────────────────

  const detect = () => {
    const host = window.location.hostname;

    // Direct Ashby hosted pages
    if (/jobs\.ashbyhq\.com$/i.test(host)) return true;

    // Embedded Ashby forms (custom domains)
    if (document.querySelector('[data-testid="application-form"]'))
      return true;
    if (
      document.querySelector(
        '.ashby-application-form, [class*="ashby-application"]'
      )
    )
      return true;

    return false;
  };

  // ── Form root ──────────────────────────────────────────────────────

  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';

  const getFormRoot = () => {
    const candidates = [
      document.querySelector('[data-testid="application-form"]'),
      document.querySelector(".ashby-application-form"),
      document.querySelector('[class*="ashby-application"]'),
      document.querySelector("form"),
    ];

    for (const el of candidates) {
      if (el && el.querySelector(FORM_FIELD_CHECK)) return el;
    }
    return document.body;
  };

  // ── React sync helper ──────────────────────────────────────────────

  const triggerReactSync = (el) => {
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue("");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // ── Flow ───────────────────────────────────────────────────────────

  const getFlow = () => {
    const formRoot = getFormRoot();

    return [
      {
        id: "application",
        label: "Application Form",

        waitFor: async (ctx) => {
          await ctx.utils.waitForElement(
            "input, select, textarea",
            formRoot,
            8000
          );
          // Ashby uses React — wait for hydration
          await ctx.utils.waitForDomStable(500, 4000);
        },

        getFormRoot: () => getFormRoot(),

        // Detect custom Ashby combobox widgets not caught by default scanner
        augmentScan: async (ctx, scanResult) => {
          const comboboxes = formRoot.querySelectorAll(
            '[role="combobox"]:not(input):not(select):not(textarea)'
          );
          for (const cb of comboboxes) {
            // Skip if already captured by scanner
            const alreadyCaptured = scanResult.widgets.some(
              (w) => w.el === cb
            );
            if (alreadyCaptured) continue;

            const label =
              cb.getAttribute("aria-label") ||
              cb
                .closest("fieldset, [class*=field]")
                ?.querySelector("label")
                ?.textContent?.trim() ||
              "";

            if (label) {
              scanResult.widgets.push({
                uid: `ashby-combo-${scanResult.widgets.length}`,
                type: "aria-combobox",
                el: cb,
                label,
                placeholder:
                  cb.getAttribute("placeholder") ||
                  cb.textContent?.trim()?.substring(0, 40) ||
                  "",
                section:
                  cb
                    .closest("section, fieldset")
                    ?.querySelector("h2, h3, legend")
                    ?.textContent?.trim() || "",
                currentValue: "",
              });
            }
          }
        },

        // Trigger React sync on all filled fields
        afterFill: async (ctx) => {
          const inputs = formRoot.querySelectorAll(
            "input, select, textarea"
          );
          for (const input of inputs) {
            if (input.value || input.checked) {
              triggerReactSync(input);
            }
          }
          await ctx.utils.waitForDomStable(300, 2000);
        },
      },
    ];
  };

  // ── Register adapter ───────────────────────────────────────────────

  if (registry.some((a) => a.name === "ashby")) return;

  registry.push({
    name: "ashby",
    detect,
    getFormRoot,
    getFlow,
    shouldOverwrite: () => false,
  });
})();
