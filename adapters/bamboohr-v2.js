/**
 * adapters/bamboohr-v2.js — BambooHR ATS adapter (v2 architecture)
 *
 * BambooHR uses standard HTML forms with no custom widgets.
 * This adapter is thin — just detection + form root scoping.
 * The universal scanner + LLM mapper handles all field mapping.
 *
 * Flow: detect → waitForDomStable → scan → LLM map → fill
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 =
    window.__jaosAtsAdaptersV2 || []);

  // ── Detection ──────────────────────────────────────────────────────

  const detect = () => {
    return /\.bamboohr\.com$/i.test(window.location.hostname);
  };

  // ── Form root ──────────────────────────────────────────────────────

  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';

  const getFormRoot = () => {
    const candidates = [
      document.querySelector(".ReferralForm"),
      document.querySelector(".ApplicationForm"),
      document.querySelector('form[method="post"]'),
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

  if (registry.some((a) => a.name === "bamboohr")) return;

  registry.push({
    name: "bamboohr",
    detect,
    getFormRoot,
    getFlow,
    shouldOverwrite: () => false,
  });
})();
