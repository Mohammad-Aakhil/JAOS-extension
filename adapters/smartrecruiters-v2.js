/**
 * adapters/smartrecruiters-v2.js — SmartRecruiters ATS adapter (v2 architecture)
 *
 * SmartRecruiters uses standard HTML forms. Some instances have
 * multi-section layouts but fields are standard inputs/selects.
 * The LLM handles field name mismatches (e.g., "location" → city).
 *
 * Flow: detect → waitForDomStable → scan → LLM map → fill
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 =
    window.__jaosAtsAdaptersV2 || []);

  // ── Detection ──────────────────────────────────────────────────────

  const detect = () => {
    const host = window.location.hostname;
    // jobs.smartrecruiters.com or *.smartrecruiters.com
    return /smartrecruiters\.com$/i.test(host);
  };

  // ── Form root ──────────────────────────────────────────────────────

  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';

  const getFormRoot = () => {
    const candidates = [
      document.querySelector('form[data-test="application-form"]'),
      document.querySelector(".application-form"),
      document.querySelector("#application"),
      document.querySelector('section[class*="application"]'),
      document.querySelector("form"),
    ];

    for (const el of candidates) {
      if (el && el.querySelector(FORM_FIELD_CHECK)) return el;
    }
    return document.body;
  };

  // ── Flow ───────────────────────────────────────────────────────────

  const getFlow = () => {
    return [
      {
        id: "application",
        label: "Application Form",

        waitFor: async (ctx) => {
          const formRoot = getFormRoot();
          await ctx.utils.waitForElement(
            "input, select, textarea",
            formRoot,
            8000
          );
          await ctx.utils.waitForDomStable(400, 3000);
        },

        getFormRoot: () => getFormRoot(),
      },
    ];
  };

  // ── Register adapter ───────────────────────────────────────────────

  if (registry.some((a) => a.name === "smartrecruiters")) return;

  registry.push({
    name: "smartrecruiters",
    detect,
    getFormRoot,
    getFlow,
    shouldOverwrite: () => false,
  });
})();
