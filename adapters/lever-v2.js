/**
 * adapters/lever-v2.js — Lever ATS adapter (v2 architecture)
 *
 * Lever uses jQuery 3.6.1 with plain HTML forms — no React, no custom widgets.
 * Single-page form with sections: basic info, links, custom cards, surveys, consent.
 *
 * Quirks:
 *  - Location input has Lever's own autocomplete (dropdown-container/dropdown-results)
 *  - Demographic surveys (surveysResponses[...]) must be SKIPPED (EEO data)
 *  - consent[store] checkbox is required — auto-check it
 *  - Custom question cards use `cards[uuid][fieldN]` naming
 *  - Resume file input: #resume-upload-input (handled separately)
 *  - hCaptcha present — can't fill, skip
 *
 * Flow: detect → waitForDomStable → scan → augmentScan → LLM map → fill → afterFill
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 =
    window.__jaosAtsAdaptersV2 || []);

  // ── Detection ──────────────────────────────────────────────────────

  const detect = () => {
    // Direct Lever hostname
    if (/^jobs\.lever\.co$/i.test(window.location.hostname)) return true;
    // Custom domains embedding Lever forms
    if (document.querySelector('#application-form input[name="origin"]')) return true;
    // Lever-specific field naming
    if (document.querySelector('input[name="urls[LinkedIn]"], input[name="urls[GitHub]"]')) return true;
    return false;
  };

  // ── Form root ──────────────────────────────────────────────────────

  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';

  const getFormRoot = () => {
    const form = document.querySelector("#application-form");
    if (form && form.querySelector(FORM_FIELD_CHECK)) return form;
    // Fallback: any form with Lever-style fields
    const fallback = document.querySelector('form[action*="lever.co"]');
    if (fallback && fallback.querySelector(FORM_FIELD_CHECK)) return fallback;
    return document.body;
  };

  // ── Label-based field matching ──────────────────────────────────────
  // Maps field labels to profile keys — deterministic, no LLM needed.
  // Returns the profile value or null (field stays in scan for LLM).

  // Match fields by name attribute OR label text → profile key.
  // Name-based matching is more reliable for Lever's consistent urls[X] naming.
  const FIELD_MATCHERS = [
    { name: 'urls[LinkedIn]',  labelPattern: /linkedin/i,       key: "linkedin" },
    { name: 'urls[GitHub]',    labelPattern: /github/i,         key: "github" },
    { name: 'urls[Portfolio]', labelPattern: /portfolio/i,      key: "portfolio" },
    { name: 'urls[Twitter]',   labelPattern: /twitter/i,        key: "twitter" },
    { name: 'urls[Other]',     labelPattern: /other\s*website/i, key: "website" },
  ];

  const matchField = (fieldName, label, profile) => {
    for (const m of FIELD_MATCHERS) {
      if (fieldName === m.name || m.labelPattern.test(label)) {
        return profile[m.key] || "";
      }
    }
    return null; // no match — let LLM handle
  };

  // ── Helpers ────────────────────────────────────────────────────────

  /** Find best matching <option> value for a profile string */
  const _matchSelectOption = (selectEl, profileValue) => {
    if (!profileValue) return "";
    const target = profileValue.toLowerCase().trim();
    const opts = [...selectEl.options];
    // Exact match first
    const exact = opts.find(o => o.value.toLowerCase() === target || o.text.toLowerCase() === target);
    if (exact) return exact.value;
    // Partial match
    const partial = opts.find(o =>
      o.value.toLowerCase().includes(target) || target.includes(o.value.toLowerCase()) ||
      o.text.toLowerCase().includes(target) || target.includes(o.text.toLowerCase())
    );
    if (partial) return partial.value;
    return "";
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Handle Lever's location autocomplete.
   * Lever uses its OWN dropdown (not Google Places):
   *   div.dropdown-container  (display:flex when open, none when closed)
   *     div.dropdown-results  (clickable result items)
   *     div.dropdown-loading-results  (spinner while fetching)
   *     div.dropdown-no-results  ("No location found")
   * Selecting a result populates hidden input#selected-location with JSON.
   *
   * IMPORTANT: Lever's jQuery + debounce only responds to char-by-char
   * KeyboardEvent + InputEvent combos. Setting value directly does NOT trigger
   * the location API. (Validated via DevTools trial — only Test 3 worked.)
   */

  /** Type text char-by-char with keydown/input/keyup per character */
  const simulateCharByChar = (input, text) => {
    return new Promise((resolve) => {
      input.value = "";
      let i = 0;
      const typeNext = () => {
        if (i >= text.length) { resolve(); return; }
        const ch = text[i++];
        input.dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
        input.value += ch;
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
        setTimeout(typeNext, 40);
      };
      typeNext();
    });
  };

  const fillLocationInput = async (input, value) => {
    if (!input || !value) return false;

    // Use just the city name — Lever's API works best with short queries
    // "Buffalo, NY" → "Buffalo", "New York, NY, USA" → "New York"
    const cityOnly = value.split(",")[0].trim();

    // Find the dropdown container — DOM: label > div.application-field > input + div.dropdown-container
    const fieldContainer = input.closest(".application-field")
      || input.closest("label")
      || input.parentElement;

    // 1. Focus, clear, then type char-by-char
    input.focus();
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await delay(200);

    await simulateCharByChar(input, cityOnly);
    console.log(`[JAOS Lever] Location: typed "${cityOnly}" char-by-char, waiting for dropdown...`);

    // 2. Poll for dropdown results (8s max — API can be slow)
    let found = false;
    for (let i = 0; i < 40; i++) { // 40 × 200ms = 8s
      await delay(200);

      const resultsDiv = fieldContainer?.querySelector(".dropdown-results")
        || document.querySelector(".dropdown-results");
      const loadingDiv = fieldContainer?.querySelector(".dropdown-loading-results")
        || document.querySelector(".dropdown-loading-results");

      // Still loading — keep waiting
      const loadingVisible = loadingDiv && getComputedStyle(loadingDiv).display !== "none";
      if (loadingVisible) continue;

      // Check for actual result children
      if (resultsDiv && resultsDiv.children.length > 0) {
        const items = [...resultsDiv.children];
        const target = value.toLowerCase();

        // Find best match index — prefer item containing full location (city + state)
        let bestIdx = 0;
        for (let j = 0; j < items.length; j++) {
          const text = (items[j].textContent || "").trim().toLowerCase();
          if (text.includes(target) || target.includes(text.split(",")[0])) {
            bestIdx = j;
            break;
          }
        }
        // Fallback: match by city name only
        if (bestIdx === 0) {
          for (let j = 0; j < items.length; j++) {
            const text = (items[j].textContent || "").trim().toLowerCase();
            if (text.includes(cityOnly.toLowerCase())) {
              bestIdx = j;
              break;
            }
          }
        }

        // ArrowDown to highlight the target option, then Enter to select
        for (let j = 0; j <= bestIdx; j++) {
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
          await delay(50);
        }
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
        await delay(300);

        const selectedLocation = document.querySelector("#selected-location");
        if (selectedLocation?.value) {
          console.log(`[JAOS Lever] Location selected: "${items[bestIdx].textContent.trim()}" → ${selectedLocation.value}`);
        } else {
          console.log(`[JAOS Lever] Location highlighted: "${items[bestIdx].textContent.trim()}" (no hidden value set)`);
        }
        found = true;
        break;
      }

      // "No location found" visible — stop
      const noResults = fieldContainer?.querySelector(".dropdown-no-results")
        || document.querySelector(".dropdown-no-results");
      const noResultsVisible = noResults && getComputedStyle(noResults).display !== "none";
      if (noResultsVisible) {
        console.log(`[JAOS Lever] No location results for "${cityOnly}"`);
        break;
      }
    }

    if (!found) {
      console.log(`[JAOS Lever] Location dropdown timed out for "${cityOnly}"`);
    }
    return found;
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

        // [Lever] Pre-fill label-matched fields + filter junk before LLM
        augmentScan: async (ctx, scanResult) => {
          const before = scanResult.fields.length;
          let preFilled = 0;

          // Debug: log all field labels + names so we can verify matching
          console.log("[JAOS Lever] augmentScan fields:", scanResult.fields.map(f =>
            `"${f.label}" (name=${f.element?.name}, type=${f.type})`
          ));

          scanResult.fields = scanResult.fields.filter((f) => {
            const el = f.element;
            // Use descriptor name (works for radio/checkbox groups where element is container div)
            const name = f.name || el.name || "";

            // Remove file inputs (resume upload handled separately)
            if (f.isFileInput || el.type === "file") {
              console.log(`[JAOS Lever] Removed file input: "${f.label}"`);
              return false;
            }

            // EEO selects — fill from profile if data exists, skip if not
            if (name === "eeo[gender]" && ctx.profile.gender) {
              el.value = _matchSelectOption(el, ctx.profile.gender);
              el.dispatchEvent(new Event("change", { bubbles: true }));
              console.log(`[JAOS Lever] EEO gender → "${el.value}"`);
              return false;
            }
            if (name === "eeo[race]" && ctx.profile.race_ethnicity) {
              el.value = _matchSelectOption(el, ctx.profile.race_ethnicity);
              el.dispatchEvent(new Event("change", { bubbles: true }));
              console.log(`[JAOS Lever] EEO race → "${el.value}"`);
              return false;
            }
            if (name === "eeo[veteran]" && ctx.profile.veteran_status) {
              el.value = _matchSelectOption(el, ctx.profile.veteran_status);
              el.dispatchEvent(new Event("change", { bubbles: true }));
              console.log(`[JAOS Lever] EEO veteran → "${el.value}"`);
              return false;
            }
            // Skip EEO/survey fields if NO profile data
            if (name.startsWith("eeo[") || name.startsWith("surveysResponses[")) {
              // Survey demographics: check if profile has matching data
              // Gender radios
              if (/\[field\d+\]$/.test(name)) {
                const label = f.label?.toLowerCase() || "";
                const hasGenderData = ctx.profile.gender && /female|male|non-binary|woman|man/i.test(label);
                const hasRaceData = ctx.profile.race_ethnicity && /asian|white|black|hispanic|native|pacific|decline/i.test(label);
                const hasVeteranData = ctx.profile.veteran_status && /veteran/i.test(label);
                if (hasGenderData || hasRaceData || hasVeteranData) {
                  // Let LLM handle with profile data available
                  return true;
                }
              }
              console.log(`[JAOS Lever] Skipped EEO/survey (no profile data): "${f.label?.substring(0, 40)}" (name=${name})`);
              return false;
            }

            // Remove consent fields (adapter handles these in afterFill)
            if (name.startsWith("consent[")) {
              console.log(`[JAOS Lever] Removed consent field: "${f.label}"`);
              return false;
            }

            // Remove hCaptcha fields
            if (name === "h-captcha-response" || el.id === "hcaptchaResponseInput") {
              console.log(`[JAOS Lever] Removed hCaptcha field`);
              return false;
            }

            // Remove hidden inputs that leaked into scan
            if (el.type === "hidden") {
              console.log(`[JAOS Lever] Removed hidden input: "${name}"`);
              return false;
            }

            // Enrich card field labels — card textareas/radios only have
            // name="cards[uuid][fieldN]" but the question text lives in a
            // sibling/ancestor div.application-question-label or h5/p tag
            if (name.startsWith("cards[") && (!f.label || f.label === "-" || /^cards\[/.test(f.label))) {
              const li = el.closest("li.application-question, li") || el.closest("div.application-field")?.parentElement;
              if (li) {
                const labelDiv = li.querySelector(".application-question-label, .card-field-label, h5, p");
                if (labelDiv) {
                  f.label = (labelDiv.textContent || "").trim().substring(0, 120);
                  console.log(`[JAOS Lever] Enriched card label: "${f.label}"`);
                }
              }
            }

            // Name/label-based pre-fill: URL fields, etc. — fill directly, skip LLM
            const matched = matchField(name, f.label, ctx.profile);
            if (matched !== null) {
              if (matched && !el.value) {
                el.value = matched;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));
                console.log(`[JAOS Lever] Pre-filled "${f.label}" → "${matched}"`);
              } else if (!matched) {
                console.log(`[JAOS Lever] No profile value for "${f.label}", leaving empty`);
              }
              preFilled++;
              return false; // remove from scan — don't send to LLM
            }

            return true;
          });

          const removed = before - scanResult.fields.length;
          if (removed > 0) {
            console.log(`[JAOS Lever] augmentScan: removed ${removed} fields, pre-filled ${preFilled} (${scanResult.fields.length} remain for LLM)`);
          }
        },

        // [Lever] After standard fill: handle location autocomplete + consent checkbox
        afterFill: async (ctx) => {
          const formRoot = getFormRoot();

          // 1. Handle location autocomplete
          const locationInput = formRoot.querySelector("#location-input, .location-input, input[name='location']");
          if (locationInput) {
            const currentVal = (locationInput.value || "").trim();
            const profileLocation = ctx.profile.city && ctx.profile.state
              ? `${ctx.profile.city}, ${ctx.profile.state}`
              : ctx.profile.location || ctx.profile.city || ctx.profile.state || "";

            // Only fill if the hidden selected-location hasn't been set yet
            const selectedLoc = document.querySelector("#selected-location")?.value;
            if (!selectedLoc) {
              const locValue = profileLocation || currentVal;
              if (locValue) {
                console.log(`[JAOS Lever] Location empty, filling: "${locValue}"`);
                await fillLocationInput(locationInput, locValue);
              }
            }
          }

          // 2. Auto-check ALL consent + acknowledgment checkboxes
          const consentBoxes = formRoot.querySelectorAll(
            'input[type="checkbox"][name*="consent["], input[type="checkbox"][name*="[field"][value*="acknowledge"], input[type="checkbox"][name*="[field"][value*="I have read"]'
          );
          for (const cb of consentBoxes) {
            if (!cb.checked) {
              cb.click();
              const label = cb.value?.substring(0, 50) || cb.name;
              console.log(`[JAOS Lever] Auto-checked: "${label}"`);
            }
          }

          // 3. EEO selects + survey demographics — SKIP if profile has no data
          // These are voluntary fields. Only fill if the user's profile explicitly
          // contains gender/race/veteran data. Otherwise leave blank.
        },
      },
    ];
  };

  // ── Register adapter ───────────────────────────────────────────────

  if (registry.some((a) => a.name === "lever")) return;

  registry.push({
    name: "lever",
    detect,
    getFormRoot,
    getFlow,
    shouldOverwrite: () => false,
  });

  console.log(`[JAOS Lever] v2 adapter registered (${registry.length} adapters in registry)`);
})();
