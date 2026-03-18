/**
 * adapters/lever-v2.js — Lever ATS adapter (v2 architecture)
 *
 * Lever uses jQuery 3.6.1 with plain HTML forms — no React, no custom widgets.
 * Single-page form with sections: basic info, links, custom cards, EEO, consent.
 *
 * Quirks:
 *  - Location input has Lever's own autocomplete (dropdown-container/dropdown-results)
 *  - Card fields use `cards[uuid][fieldN]` naming — UUIDs change per job posting
 *  - Card field labels live in `.application-label` within parent `li.application-question`
 *  - EEO selects: eeo[gender], eeo[race], eeo[veteran] — native <select>
 *  - consent[store] checkbox — auto-check in afterFill
 *  - Resume file input: #resume-upload-input (handled separately)
 *  - hCaptcha present — skip
 *  - Pronouns: checkbox group with 9+ options — skip (optional, personal)
 *
 * Label strategy (NO LLM needed for labels):
 *  Standard fields → name attribute matching (name, email, phone, org, urls[*])
 *  Card fields → DOM walk to `.application-label` in parent `li`
 *  EEO fields → deterministic fill from profile
 *
 * Flow: detect → waitForDomStable → scan → augmentScan → LLM map → fill → afterFill
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 =
    window.__jaosAtsAdaptersV2 || []);

  // ── Detection ──────────────────────────────────────────────────────

  const detect = () => {
    if (/^jobs\.lever\.co$/i.test(window.location.hostname)) return true;
    if (document.querySelector('#application-form input[name="origin"]')) return true;
    if (document.querySelector('input[name="urls[LinkedIn]"], input[name="urls[GitHub]"]')) return true;
    return false;
  };

  // ── Form root ──────────────────────────────────────────────────────

  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';

  const getFormRoot = () => {
    const form = document.querySelector("#application-form");
    if (form && form.querySelector(FORM_FIELD_CHECK)) return form;
    const fallback = document.querySelector('form[action*="lever.co"]');
    if (fallback && fallback.querySelector(FORM_FIELD_CHECK)) return fallback;
    return document.body;
  };

  // ── Lever DOM label extraction ─────────────────────────────────────
  // Lever puts question labels in `.application-label` inside the parent
  // `li.application-question` container. This is the ONLY reliable source
  // for card fields — the input name is just `cards[uuid][fieldN]`.

  const getLeverLabel = (el) => {
    // 1. Walk up to the question container (standard Lever DOM structure)
    const question = el.closest("li.application-question, li.application-additional, div.application-question");
    if (question) {
      const lbl = question.querySelector(".application-label, label");
      if (lbl) {
        const text = (lbl.textContent || "").replace(/✱/g, "").replace(/\*/g, "").trim();
        if (text && text.length < 120) return text;
      }
    }

    // 2. Walk up to .application-field and check for sibling label
    const field = el.closest(".application-field");
    if (field) {
      const parent = field.parentElement;
      if (parent) {
        const lbl = parent.querySelector(".application-label, label");
        if (lbl && !lbl.contains(el)) {
          const text = (lbl.textContent || "").replace(/✱/g, "").replace(/\*/g, "").trim();
          if (text && text.length < 120) return text;
        }
      }
    }

    // 3. EEO survey questions + custom questions — labels live in nearby headings
    // Lever patterns: <h3>What is your gender?</h3>, <p class="application-label">
    // Checkbox/radio groups: the container is a fieldset or div wrapping all options
    const surveyContainer = el.closest(
      ".application-survey-question, fieldset, [class*='survey'], [class*='question'], " +
      "li.application-question, li.application-additional, li.application-dropdown"
    );
    if (surveyContainer) {
      const heading = surveyContainer.querySelector(
        ".application-label, h2, h3, h4, label, legend, p:first-of-type"
      );
      if (heading && !heading.querySelector("input")) {
        const text = (heading.textContent || "").replace(/✱/g, "").replace(/\*/g, "").trim();
        if (text && text.length < 120) return text;
      }
    }

    // 4. Walk up parents looking for .application-label sibling (card fields, custom questions)
    // Lever DOM: <li><div class="application-label">Question</div><div class="application-field"><input></div></li>
    let parent = el;
    for (let i = 0; i < 6 && parent; i++) {
      parent = parent.parentElement;
      if (!parent || parent.tagName === "FORM" || parent.tagName === "BODY") break;
      const lbl = parent.querySelector(".application-label");
      if (lbl && !lbl.contains(el)) {
        const text = (lbl.textContent || "").replace(/✱/g, "").replace(/\*/g, "").trim();
        if (text && text.length < 120) return text;
      }
    }

    // 5. Standard label[for] or wrapping label
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return (lbl.textContent || "").replace(/\*/g, "").trim().substring(0, 120);
    }
    const wrap = el.closest("label");
    if (wrap) return (wrap.textContent || "").replace(/\*/g, "").trim().substring(0, 80);

    return "";
  };

  // ── Deterministic field matchers ───────────────────────────────────
  // Maps name attributes to profile keys. NO LLM needed for these.

  const DETERMINISTIC_FILLS = [
    // Standard Lever fields
    { name: "name",             profileKey: (p) => p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() },
    { name: "email",            profileKey: (p) => p.email },
    { name: "phone",            profileKey: (p) => p.phone },
    { name: "org",              profileKey: (p) => p.current_company || p.company },
    { name: "urls[LinkedIn]",   profileKey: (p) => p.linkedin },
    { name: "urls[GitHub]",     profileKey: (p) => p.github },
    { name: "urls[Portfolio]",  profileKey: (p) => p.portfolio || p.website },
    { name: "urls[Twitter]",    profileKey: (p) => p.twitter },
    { name: "urls[Other]",      profileKey: (p) => p.website || p.portfolio },
  ];

  // Card fields: matched by label text (NOT name, since UUIDs change per job)
  const CARD_LABEL_FILLS = [
    { pattern: /^legal\s*first\s*name$/i,               profileKey: (p) => p.first_name },
    { pattern: /^legal\s*last\s*name$/i,                profileKey: (p) => p.last_name },
    { pattern: /^(home\s*)?phone$/i,                    profileKey: (p) => p.phone },
    { pattern: /^mailing\s*address\s*line\s*1$/i,       profileKey: (p) => p.address_line1 || p.address },
    { pattern: /^mailing\s*address\s*line\s*2$/i,       profileKey: (p) => p.address_line2 || "" },
    { pattern: /^city$/i,                               profileKey: (p) => p.city },
    { pattern: /^state$/i,                              profileKey: (p) => p.state },
    { pattern: /^zip\s*(code)?$/i,                      profileKey: (p) => p.zip || p.postal_code },
    { pattern: /^degree$/i,                             profileKey: (p) => p.education_entries?.[0]?.degree || p.degree },
    { pattern: /^(no\.?\s*of\s*)?years\s*(attend|work)/i, profileKey: () => "" }, // Let LLM decide — varies
    { pattern: /full\s*legal\s*name.*signature/i,       profileKey: (p) => p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() },
  ];

  // Radio/Yes-No question defaults (matched by label text)
  const YES_NO_DEFAULTS = [
    { pattern: /referred\s*by\s*(a\s*)?(current\s*)?employee/i,   value: "No" },
    { pattern: /previously\s*work/i,                               value: "No" },
    { pattern: /subject\s*to\s*any\s*(type\s*of\s*)?agreement/i,  value: "No" },
    { pattern: /legally\s*(eligible|authorized)\s*to\s*work/i,     value: "Yes" },
    { pattern: /require\s*(visa\s*)?sponsorship/i,                 value: "No" },
    { pattern: /graduated/i,                                        value: "Yes" },
    { pattern: /non-?compete/i,                                     value: "No" },
    { pattern: /background\s*check/i,                               value: "Yes" },
    { pattern: /drug\s*(test|screen)/i,                             value: "Yes" },
    { pattern: /18\s*years\s*(of\s*age|or\s*older)/i,              value: "Yes" },
    { pattern: /served\s*(in\s*the\s*)?military/i,                  value: "No" },
    { pattern: /disability/i,                                        value: "No" },
  ];

  // ── EEO radio/checkbox group fills ────────────────────────────────
  // Some Lever portals use radio groups or checkbox groups for EEO instead
  // of <select>. Matched by question label text, value picked from profile
  // or sensible defaults. These run on radio-group and checkbox-group types.

  const EEO_RADIO_FILLS = [
    // Gender — radio group: "Female", "Male", "Non-binary", "Decline to answer"
    { pattern: /gender/i, profileKey: "gender", fallback: "Decline to self-identify" },
    // Race/ethnicity — checkbox group: "Asian", "White", "Black or African American", etc.
    { pattern: /race|ethnicity/i, profileKey: "race_ethnicity", fallback: "Decline to Respond" },
    // Veteran — radio group: "Yes", "No", "Decline to answer"
    { pattern: /veteran|military|served/i, profileKey: "veteran_status", fallback: "No" },
    // Age range — radio group: "21 or younger", "21-29", "30-39", etc.
    { pattern: /age\s*range/i, profileKey: "age_range", fallback: null },
  ];

  // Click a radio option whose label includes the target text
  const clickRadioOrCheckboxByText = (containerEl, targetText) => {
    if (!containerEl || !targetText) return false;
    const target = targetText.toLowerCase().trim();

    // Find all radio/checkbox inputs inside the container
    const inputs = containerEl.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    for (const inp of inputs) {
      const optLabel = (
        inp.closest("label")?.textContent?.trim() ||
        inp.nextElementSibling?.textContent?.trim() ||
        inp.labels?.[0]?.textContent?.trim() ||
        inp.value || ""
      ).toLowerCase();
      if (optLabel === target || optLabel.includes(target) || target.includes(optLabel)) {
        if (!inp.checked) {
          inp.click();
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return true;
      }
    }
    return false;
  };

  // Acknowledgement/initials: fields with long legal text that need initials
  const isInitialsField = (label) =>
    /\(please\s*initial\)/i.test(label) ||
    /hereby\s*(acknowledge|certify|authorize)/i.test(label) ||
    /executed\s*authorization/i.test(label) ||
    /understand\s*that/i.test(label);

  // ── Helpers ────────────────────────────────────────────────────────

  const _matchSelectOption = (selectEl, profileValue) => {
    if (!profileValue) return "";
    const target = profileValue.toLowerCase().trim();
    // Filter out placeholder/empty options to prevent false matches
    const opts = [...selectEl.options].filter(o =>
      o.value && o.value !== "" && !/^select\s*\.{0,3}$/i.test(o.text.trim())
    );
    // 1. Exact match on text or value
    const exact = opts.find(o =>
      o.text.toLowerCase().trim() === target || o.value.toLowerCase().trim() === target
    );
    if (exact) return exact.value;
    // 2. Partial match — require minimum 3 chars to avoid garbage matches
    const partial = opts.find(o => {
      const oText = o.text.toLowerCase().trim();
      return (oText.length >= 3 && target.includes(oText)) ||
             (target.length >= 3 && oText.includes(target));
    });
    if (partial) return partial.value;
    return "";
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Location autocomplete ──────────────────────────────────────────
  // Lever uses its OWN dropdown (not Google Places):
  //   div.dropdown-container → div.dropdown-results (clickable items)
  // MUST type char-by-char — setting value directly doesn't trigger Lever's API.

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

  // [Lever] Location autocomplete — type the city, wait for dropdown to appear,
  // then leave focus on the input so the dropdown stays visible for user to click.
  // React's controlled input makes programmatic selection unreliable (isTrusted=false
  // events don't persist through React re-renders), so we type + show dropdown only.
  const fillLocationInput = async (input, value) => {
    if (!input || !value) return false;
    const cityOnly = value.split(",")[0].trim();

    input.focus();
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await delay(200);

    await simulateCharByChar(input, cityOnly);
    console.log(`[JAOS Lever] Location: typed "${cityOnly}" — user needs to pick from dropdown`);

    // Wait briefly for dropdown to appear, then leave focus on input
    // so dropdown stays visible for the user to click
    const fieldContainer = input.closest(".application-field") || input.parentElement;
    for (let i = 0; i < 20; i++) {
      await delay(200);
      const resultsDiv = fieldContainer?.querySelector(".dropdown-results") || document.querySelector(".dropdown-results");
      if (resultsDiv && resultsDiv.children.length > 0) {
        console.log(`[JAOS Lever] Location dropdown visible with ${resultsDiv.children.length} options — waiting for user pick`);
        return "needs_pick"; // Signal to progress UI
      }
    }
    return false;
  };

  // ── Click radio by name + label value ──────────────────────────────

  const clickRadioByLabel = (name, labelValue) => {
    const radios = document.querySelectorAll(`input[name="${CSS.escape(name)}"]`);
    for (const r of radios) {
      const rLabel = r.closest("label")?.textContent?.trim() || r.value || "";
      if (rLabel.toLowerCase() === labelValue.toLowerCase()) {
        if (!r.checked) {
          r.click();
          r.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return true;
      }
    }
    return false;
  };

  // ── Flow ───────────────────────────────────────────────────────────

  const getFlow = () => {
    return [
      {
        id: "application",
        label: "Application Form",

        waitFor: async (ctx) => {
          const formRoot = getFormRoot();
          await ctx.utils.waitForElement("input, select, textarea", formRoot, 8000);
          await ctx.utils.waitForDomStable(400, 3000);
        },

        getFormRoot: () => getFormRoot(),

        // [Lever] Enrich labels, pre-fill deterministic fields, filter junk
        augmentScan: async (ctx, scanResult) => {
          const profile = ctx.profile || {};
          const before = scanResult.fields.length;
          let preFilled = 0;
          let enriched = 0;

          // Track pre-filled fields for progress UI display.
          // Fields removed from scanResult.fields (return false) won't appear in
          // orchestrator's fieldLabels unless we record them here.
          scanResult.preFilledLabels = scanResult.preFilledLabels || [];

          // Helper: record a pre-filled field for progress UI
          const recordPreFill = (label, isRequired) => {
            if (label) {
              // Clean label for UI: strip long legal text, keep first sentence
              const clean = label.replace(/\*/g, "").trim();
              const short = clean.length > 50 ? clean.substring(0, 50).replace(/\s+\S*$/, "…") : clean;
              scanResult.preFilledLabels.push({ label: short, isRequired: !!isRequired });
            }
          };

          // Pass 1: Enrich labels for ALL fields from DOM before any filtering.
          // Card fields need getLeverLabel() since scanner falls back to name attr.
          // Radio/checkbox groups need getLeverLabel() since scanner may pick first option text.
          for (const f of scanResult.fields) {
            const el = f.element;
            const name = f.name || el?.name || "";
            const type = f.type || "";

            // Card fields: label falls back to "cards[uuid][fieldN]" without enrichment
            if (name.startsWith("cards[")) {
              if (f.label && f.label !== "-" && !/^cards\[/.test(f.label)) continue;
              const leverLabel = getLeverLabel(el);
              if (leverLabel) { f.label = leverLabel; enriched++; }
              continue;
            }

            // Radio/checkbox groups: scanner may pick first option text as label
            // (e.g. "SQL" instead of "Select the tools/languages...")
            // Re-extract from the question container for accuracy.
            if (type === "radio-group" || type === "checkbox-group") {
              const leverLabel = getLeverLabel(el);
              if (leverLabel && leverLabel.length > (f.label || "").length) {
                f.label = leverLabel;
                enriched++;
              }
            }

            // surveysResponses fields: scanner label is often just the name attr
            if (name.startsWith("surveysResponses[")) {
              const leverLabel = getLeverLabel(el);
              if (leverLabel) { f.label = leverLabel; enriched++; }
            }
          }
          if (enriched > 0) {
            console.log(`[JAOS Lever] Enriched ${enriched} field labels from DOM`);
          }

          // Pass 2: Filter + deterministic fill
          scanResult.fields = scanResult.fields.filter((f) => {
            const el = f.element;
            const name = f.name || el?.name || "";
            const label = f.label || "";
            const isReq = !!f.required;

            // ── Remove junk fields (no UI tracking needed) ──────────
            if (f.isFileInput || el?.type === "file") return false;
            if (el?.type === "hidden") return false;
            if (name === "h-captcha-response" || el?.id === "hcaptchaResponseInput") return false;
            if (name.startsWith("consent[")) return false;

            // Skip pronouns (optional, personal choice)
            if (name === "pronouns" || name === "useNameOnlyPronounsOption" || name === "customPronounsOption") return false;
            if (el?.closest?.(".custom-pronouns")) return false;

            // ── EEO selects — fill deterministically if profile has data ──
            // Uses _matchSelectOption which skips "Select ..." placeholders.
            // Falls back to known defaults if profile field is missing.
            if (name === "eeo[gender]") {
              if (el?.tagName === "SELECT") {
                const val = _matchSelectOption(el, profile.gender) ||
                  _matchSelectOption(el, "Decline to self-identify");
                if (val) {
                  el.value = val;
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  console.log(`[JAOS Lever] EEO gender → "${el.options?.[el.selectedIndex]?.text}"`);
                }
              }
              recordPreFill("Gender", false);
              preFilled++;
              return false;
            }
            if (name === "eeo[race]") {
              if (el?.tagName === "SELECT") {
                const val = _matchSelectOption(el, profile.race_ethnicity) ||
                  _matchSelectOption(el, "Decline to self-identify");
                if (val) {
                  el.value = val;
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  console.log(`[JAOS Lever] EEO race → "${el.options?.[el.selectedIndex]?.text}"`);
                }
              }
              recordPreFill("Race / Ethnicity", false);
              preFilled++;
              return false;
            }
            if (name === "eeo[veteran]") {
              if (el?.tagName === "SELECT") {
                const val = _matchSelectOption(el, profile.veteran_status) ||
                  _matchSelectOption(el, "I am not a veteran") ||
                  _matchSelectOption(el, "not a veteran") ||
                  _matchSelectOption(el, "Decline to self-identify");
                if (val) {
                  el.value = val;
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  console.log(`[JAOS Lever] EEO veteran → "${el.options?.[el.selectedIndex]?.text}"`);
                } else {
                  console.warn(`[JAOS Lever] EEO veteran — no matching option found`);
                }
              }
              recordPreFill("Veteran Status", false);
              preFilled++;
              return false;
            }
            if (name.startsWith("eeo[")) return false;

            // ── EEO radio/checkbox groups (surveysResponses[*]) ─────
            if (name.startsWith("surveysResponses[") && (f.type === "radio-group" || f.type === "checkbox-group")) {
              for (const eeo of EEO_RADIO_FILLS) {
                if (eeo.pattern.test(label)) {
                  const profileVal = eeo.profileKey ? profile[eeo.profileKey] : null;
                  const target = profileVal || eeo.fallback;
                  if (target) {
                    const clicked = clickRadioOrCheckboxByText(el, target);
                    if (clicked) {
                      console.log(`[JAOS Lever] EEO radio "${label.substring(0, 40)}" → "${target}"`);
                    } else {
                      const declined = clickRadioOrCheckboxByText(el, "Decline") ||
                        clickRadioOrCheckboxByText(el, "Prefer not");
                      if (declined) console.log(`[JAOS Lever] EEO radio "${label.substring(0, 40)}" → Decline (fallback)`);
                      else console.warn(`[JAOS Lever] EEO radio "${label.substring(0, 40)}" — no matching option for "${target}"`);
                    }
                  }
                  recordPreFill(label, isReq);
                  preFilled++;
                  return false;
                }
              }
              return false;
            }
            if (name.startsWith("surveysResponses[")) return false;

            // ── Standard fields — fill by name attribute ──────────
            for (const df of DETERMINISTIC_FILLS) {
              if (name === df.name) {
                const val = df.profileKey(profile);
                if (val && el && !el.value) {
                  el.value = val;
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  console.log(`[JAOS Lever] Filled "${name}" → "${val.substring(0, 40)}"`);
                }
                // Use readable label: "Full name", "Email", "Phone" etc.
                const readableLabel = label || name.replace(/^urls\[|\]$/g, "").replace(/([A-Z])/g, " $1").trim();
                recordPreFill(readableLabel, isReq);
                preFilled++;
                return false;
              }
            }

            // ── Card fields — fill by label pattern ──────────────
            if (name.startsWith("cards[") && label) {
              // Initials / acknowledgement fields
              if (isInitialsField(label)) {
                const initials = profile.first_name && profile.last_name
                  ? `${profile.first_name[0]}.${profile.last_name[0]}.`
                  : profile.full_name?.split(" ").map(w => w[0]).join(".") + "." || "";
                if (initials && el && !el.value) {
                  el.value = initials;
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  console.log(`[JAOS Lever] Initials "${label.substring(0, 40)}..." → "${initials}"`);
                }
                recordPreFill("Initials", isReq);
                preFilled++;
                return false;
              }

              // Signature field
              if (/full\s*legal\s*name.*signature/i.test(label)) {
                const sig = profile.full_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
                if (sig && el && !el.value) {
                  el.value = sig;
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  console.log(`[JAOS Lever] Signature → "${sig}"`);
                }
                recordPreFill("Legal Signature", isReq);
                preFilled++;
                return false;
              }

              // Label-matched card fills
              for (const clf of CARD_LABEL_FILLS) {
                if (clf.pattern.test(label)) {
                  const val = clf.profileKey(profile);
                  if (val && el && !el.value) {
                    el.value = val;
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                    console.log(`[JAOS Lever] Card fill "${label}" → "${val.substring(0, 40)}"`);
                  }
                  recordPreFill(label, isReq);
                  preFilled++;
                  return false;
                }
              }
            }

            // ── Yes/No radio defaults (cards AND non-card) ──────────
            if (f.type === "radio-group" && label) {
              for (const yn of YES_NO_DEFAULTS) {
                if (yn.pattern.test(label)) {
                  const clicked = clickRadioByLabel(name, yn.value) ||
                    clickRadioOrCheckboxByText(el, yn.value);
                  if (clicked) {
                    console.log(`[JAOS Lever] Radio "${label.substring(0, 50)}" → "${yn.value}"`);
                  } else {
                    console.warn(`[JAOS Lever] Radio "${label.substring(0, 50)}" — couldn't click "${yn.value}"`);
                  }
                  recordPreFill(label, isReq);
                  preFilled++;
                  return false;
                }
              }
            }

            // ── Checkbox groups with skills/tools ────────────────────
            if (f.type === "checkbox-group" && label && /tools|languages|skills|technologies/i.test(label)) {
              const skills = profile.skills_list || profile.skills || [];
              if (skills.length > 0) {
                const inputs = el.querySelectorAll?.('input[type="checkbox"]') || [];
                let matched = 0;
                for (const inp of inputs) {
                  const optText = (
                    inp.closest("label")?.textContent?.trim() ||
                    inp.nextElementSibling?.textContent?.trim() ||
                    inp.value || ""
                  ).toLowerCase();
                  if (skills.some(s => optText.includes(s.toLowerCase()) || s.toLowerCase().includes(optText))) {
                    if (!inp.checked) {
                      inp.click();
                      inp.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                    matched++;
                  }
                }
                console.log(`[JAOS Lever] Checkbox skills "${label.substring(0, 40)}" → ${matched} matched`);
                recordPreFill(label, isReq);
                preFilled++;
                return false;
              }
            }

            // ── Location input — handled in afterFill, remove from LLM scan
            if (name === "location" || el?.id === "location-input") {
              recordPreFill("Current Location", isReq);
              return false;
            }

            // ── OpportunityLocation select ───────────────────────────
            if (name === "opportunityLocationId") {
              if (el?.tagName === "SELECT" && el.options.length > 1 && !el.value) {
                const profileLoc = `${profile.city || ""} ${profile.state || ""}`.toLowerCase();
                let matched = false;
                for (const opt of el.options) {
                  if (opt.value && opt.text.toLowerCase().includes(profileLoc.split(" ")[0])) {
                    el.value = opt.value;
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                    console.log(`[JAOS Lever] Location select → "${opt.text}"`);
                    matched = true;
                    break;
                  }
                }
                if (!matched && el.options.length === 2) {
                  el.value = el.options[1].value;
                  el.dispatchEvent(new Event("change", { bubbles: true }));
                  console.log(`[JAOS Lever] Location select (only option) → "${el.options[1].text}"`);
                }
              }
              recordPreFill("Which location are you applying for?", isReq);
              preFilled++;
              return false;
            }

            // Everything else → send to LLM
            return true;
          });

          const removed = before - scanResult.fields.length;
          console.log(`[JAOS Lever] augmentScan: ${enriched} labels enriched, ${preFilled} pre-filled (${scanResult.preFilledLabels.length} tracked for UI), ${removed} removed (${scanResult.fields.length} remain for LLM)`);
        },

        // [Lever] After fill: location autocomplete + consent checkboxes
        afterFill: async (ctx) => {
          const formRoot = getFormRoot();
          const profile = ctx.profile || {};

          // 1. Handle location autocomplete — type city + show dropdown.
          // User must click to select (React controlled input can't be set programmatically).
          const locationInput = formRoot.querySelector("#location-input, input[name='location']");
          if (locationInput) {
            const hiddenLoc = document.querySelector("#selected-location");
            const hiddenVal = hiddenLoc?.value || "";
            // Only fill if hidden input is empty or has no real selection
            if (!hiddenVal || hiddenVal === '{"name":""}') {
              const locValue = profile.city && profile.state
                ? `${profile.city}, ${profile.state}`
                : profile.location || profile.city || "";
              if (locValue) {
                console.log(`[JAOS Lever] Filling location: "${locValue}"`);
                await fillLocationInput(locationInput, locValue);
              }
            }
          }

          // 2. Auto-check ALL consent checkboxes
          const consentBoxes = formRoot.querySelectorAll(
            'input[type="checkbox"][name*="consent["]'
          );
          for (const cb of consentBoxes) {
            if (!cb.checked) {
              cb.click();
              console.log(`[JAOS Lever] Consent checked: "${cb.name}"`);
            }
          }

          await delay(500);
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

  console.log(`[JAOS Lever] v2 adapter registered`);
})();
