/**
 * adapters/ashby-v2.js — Ashby ATS adapter (v2 architecture)
 *
 * Ashby is a React 18 SPA with CSS Modules. Key quirks:
 *  - No <form> tag — form root is div#form[role="tabpanel"]
 *  - System fields use _systemfield_ prefix (name, email, phone)
 *  - Yes/No questions are <button> pairs, NOT radio inputs
 *  - EEO/demographic questions ARE radio inputs (different widget)
 *  - Autofill pane has a hidden file input — must filter it out
 *  - Combobox widgets: [role="combobox"] with search dropdown
 *  - CSS Module classes are unstable — use stable ashby-* class names
 *
 * Flow: detect → waitFor → scan → augmentScan → LLM map → fill → afterFill
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 =
    window.__jaosAtsAdaptersV2 || []);

  // ── Detection ──────────────────────────────────────────────────────

  const detect = () => {
    // PRIMARY: hostname — 100% reliable across all tested portals
    if (/jobs\.ashbyhq\.com$/i.test(window.location.hostname)) return true;

    // SECONDARY: embedded Ashby forms on custom domains
    if (document.querySelector('.ashby-application-form, [class*="ashby-application"]'))
      return true;
    if (document.querySelector('[data-testid="application-form"]'))
      return true;

    return false;
  };

  // ── Form root ──────────────────────────────────────────────────────

  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';

  const getFormRoot = () => {
    const candidates = [
      document.querySelector('div#form[role="tabpanel"]'),
      document.querySelector(".ashby-application-form"),
      document.querySelector('[class*="ashby-application-form-section-container"]'),
      document.querySelector('[data-testid="application-form"]'),
    ];

    for (const el of candidates) {
      if (el && el.querySelector(FORM_FIELD_CHECK)) return el;
    }
    return document.body;
  };

  // ── Helpers ────────────────────────────────────────────────────────

  // [Ashby] Trigger React state sync after setting input value
  const triggerReactSync = (el) => {
    const tracker = el._valueTracker;
    if (tracker) tracker.setValue("");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  // ── Deterministic fills (no LLM needed) ────────────────────────────

  const SYSTEM_FIELD_FILLS = [
    { id: "_systemfield_name",  profileKey: (p) => p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() },
    { id: "_systemfield_email", profileKey: (p) => p.email },
    // _systemfield_phone doesn't exist in all portals — phone detected by type="tel" in Pass 3
  ];

  // ── Yes/No button defaults (matched by question label) ─────────────

  const YES_NO_DEFAULTS = [
    { pattern: /referred/i,                                                           value: "No" },
    { pattern: /commute|physically\s*in\s*office|able\s*to\s*be\s*onsite/i,          value: "Yes" },
    { pattern: /able\s*to\s*work\s*from|\d\s*days?\s*(per|a)\s*week.*office|hq\s*\d/i, value: "Yes" },
    { pattern: /require\s*(visa\s*)?sponsorship/i,                                    value: "No" },
    { pattern: /authorized\s*to\s*work|work\s*authorization|legally\s*authorized/i,  value: "Yes" },
    { pattern: /OPT|F1|H1-?B|M1\s*student\s*visa/i,                                  value: "Yes" },
    { pattern: /relocat/i,                                                             value: "Yes" },
    { pattern: /background\s*check/i,                                                 value: "Yes" },
    { pattern: /drug\s*(test|screen)/i,                                               value: "Yes" },
    { pattern: /18\s*years\s*(of\s*age|or\s*older)|at\s*least\s*18/i,               value: "Yes" },
    { pattern: /non-?compete/i,                                                        value: "No" },
    { pattern: /previously\s*work|prior.*employee|worked\s*here\s*before/i,           value: "No" },
  ];

  // ── EEO radio group fills ──────────────────────────────────────────

  const EEO_RADIO_FILLS = [
    { pattern: /gender/i,                      profileKey: "gender",         fallback: "Decline to self-identify" },
    { pattern: /race|ethnicity/i,              profileKey: "race_ethnicity", fallback: "Decline to self-identify" },
    { pattern: /veteran/i,                     profileKey: "veteran_status", fallback: "I am not a protected veteran" },
    { pattern: /disability|disabilities/i,     profileKey: null,             fallback: "Decline to self-identify" },
  ];

  // Click a radio option whose label text matches target
  const clickRadioByText = (container, targetText) => {
    if (!container || !targetText) return false;
    const target = targetText.toLowerCase().trim();
    const radios = container.querySelectorAll('input[type="radio"]');
    for (const r of radios) {
      const label = (
        r.closest("label")?.textContent?.trim() ||
        r.nextElementSibling?.textContent?.trim() ||
        r.labels?.[0]?.textContent?.trim() ||
        r.value || ""
      ).toLowerCase();
      if (label === target || label.includes(target) || target.includes(label)) {
        if (!r.checked) {
          r.click();
          r.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return true;
      }
    }
    return false;
  };

  // ── Yes/No button click helper ──────────────────────────────────────
  // Ashby Yes/No are <button> elements with class _option_y2cw4_33.
  // Selected state: _selected_ CSS module class added to button.

  const clickYesNoButton = (container, answer) => {
    if (!container) return false;
    // Ashby Yes/No buttons: <button class="_container_pjyt6_1 _option_y2cw4_33">
    // They do NOT have type="submit" — just default button type.
    // Also has a hidden <input type="checkbox"> sibling that tracks state.
    const buttons = container.querySelectorAll('button[class*="_option_"], button[class*="pjyt6"]');
    // Fallback: any button inside a yesno container
    const allButtons = buttons.length > 0 ? buttons : container.querySelectorAll("button");
    for (const btn of allButtons) {
      const text = (btn.textContent || "").trim().toLowerCase();
      if (text === answer.toLowerCase()) {
        const alreadySelected = [...btn.classList].some(c => c.includes("selected") || c.includes("active"));
        if (!alreadySelected) {
          btn.click();
          // Also check the hidden checkbox if it exists
          const checkbox = container.querySelector('input[type="checkbox"]');
          if (checkbox && answer.toLowerCase() === "yes" && !checkbox.checked) {
            checkbox.click();
          }
          console.log(`[JAOS Ashby] Yes/No button clicked: "${answer}"`);
        }
        return true;
      }
    }
    return false;
  };

  // Get the question label for a field container
  const getQuestionLabel = (container) => {
    if (!container) return "";
    const label = container.querySelector(
      ".ashby-application-form-question-title, label, legend, h3, h4"
    );
    return (label?.textContent || "").replace(/\*/g, "").trim();
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
          // Ashby React 18 — wait for hydration
          await ctx.utils.waitForDomStable(500, 4000);
        },

        getFormRoot: () => getFormRoot(),

        // [Ashby] Filter junk, pre-fill system fields, detect custom widgets
        augmentScan: async (ctx, scanResult) => {
          const profile = ctx.profile || {};
          const formRoot = getFormRoot();
          let preFilled = 0;
          scanResult.preFilledLabels = scanResult.preFilledLabels || [];

          const recordPreFill = (label, isRequired) => {
            if (label) {
              const clean = label.replace(/\*/g, "").trim();
              const short = clean.length > 50 ? clean.substring(0, 50).replace(/\s+\S*$/, "…") : clean;
              scanResult.preFilledLabels.push({ label: short, isRequired: !!isRequired });
            }
          };

          // ── Pass 1: Filter junk fields ──────────────────────────
          scanResult.fields = scanResult.fields.filter((f) => {
            const el = f.element;
            const name = f.name || el?.name || "";

            // Skip Ashby's autofill-from-resume pane (hidden 1×1 file input)
            if (el?.closest?.(".ashby-application-form-autofill-pane") ||
                el?.closest?.(".ashby-application-form-autofill-input-root")) {
              return false;
            }

            // Skip hidden inputs
            if (el?.type === "hidden") return false;

            // Skip reCAPTCHA
            if (name === "g-recaptcha-response" || el?.closest?.("iframe[src*='recaptcha']")) return false;

            // Skip file inputs (resume handled separately by content.js)
            if (f.isFileInput || el?.type === "file") return false;

            // Skip hidden checkboxes inside Yes/No button groups
            // Ashby puts a hidden <input type="checkbox"> alongside the Yes/No buttons
            if (el?.type === "checkbox" && el?.tabIndex === -1) {
              const parent = el?.closest?.(".ashby-application-form-field-entry, [class*='_fieldEntry_']");
              if (parent?.querySelector('button[class*="_option_"], button[class*="pjyt6"]')) return false;
            }

            return true;
          });

          // ── Pass 2: Pre-fill system fields deterministically ────
          scanResult.fields = scanResult.fields.filter((f) => {
            const el = f.element;
            const id = f.id || el?.id || "";

            for (const sf of SYSTEM_FIELD_FILLS) {
              if (id === sf.id) {
                const val = sf.profileKey(profile);
                if (val && el && !el.value) {
                  el.value = val;
                  triggerReactSync(el);
                  console.log(`[JAOS Ashby] System field "${id}" → "${val.substring(0, 40)}"`);
                }
                recordPreFill(f.label || id.replace("_systemfield_", ""), !!f.required);
                preFilled++;
                return false; // Remove from LLM scan
              }
            }
            return true;
          });

          // ── Pass 2b: Fill phone by type="tel" (no stable ID) ────
          // Ashby phone field uses a UUID as id/name — not _systemfield_phone.
          // Detect by input[type="tel"] and fill if empty.
          if (profile.phone) {
            const telInput = formRoot.querySelector('input[type="tel"]:not([id="_systemfield_phone"])');
            if (telInput && !telInput.value) {
              telInput.value = profile.phone;
              triggerReactSync(telInput);
              console.log(`[JAOS Ashby] Phone (tel input) → "${profile.phone}"`);
              recordPreFill("Phone Number", true);
              preFilled++;
              // Remove from LLM scan
              scanResult.fields = scanResult.fields.filter(f => f.element !== telInput);
            }
          }

          // ── Pass 3: Handle Yes/No button groups ─────────────────
          // These are NOT captured as form fields (they're <button> elements).
          // We scan the form for button groups and fill them deterministically.
          const fieldEntries = formRoot.querySelectorAll(
            ".ashby-application-form-field-entry, [class*='_fieldEntry_']"
          );
          for (const entry of fieldEntries) {
            // Ashby Yes/No: buttons with _option_ class, NOT type="submit"
            let buttons = entry.querySelectorAll('button[class*="_option_"], button[class*="pjyt6"]');
            if (buttons.length === 0) buttons = entry.querySelectorAll("button");
            if (buttons.length !== 2) continue;
            const texts = [...buttons].map(b => b.textContent?.trim().toLowerCase());
            if (!texts.includes("yes") || !texts.includes("no")) continue;

            const label = getQuestionLabel(entry);
            if (!label) continue;

            // Match against YES_NO_DEFAULTS
            for (const yn of YES_NO_DEFAULTS) {
              if (yn.pattern.test(label)) {
                clickYesNoButton(entry, yn.value);
                recordPreFill(label, true);
                preFilled++;
                break;
              }
            }
          }

          // ── Pass 4: Handle EEO radio groups ─────────────────────
          // Ashby EEO uses <input type="radio"> inside <fieldset> elements.
          // IMPORTANT: Ashby fieldsets have NO <legend> — label is in firstElementChild.
          const fieldsets = formRoot.querySelectorAll("fieldset");
          for (const fs of fieldsets) {
            // Ashby fieldsets have NO <legend> — label is a <label class="ashby-application-form-question-title">
            // as the first child of the fieldset. Stable class name confirmed across portals.
            const labelEl = fs.querySelector(".ashby-application-form-question-title, legend");
            const legendText = (labelEl?.textContent || fs.firstElementChild?.textContent || "")
              .replace(/\*/g, "").trim();
            if (!legendText) continue;

            const radios = fs.querySelectorAll('input[type="radio"]');
            if (radios.length === 0) continue;

            for (const eeo of EEO_RADIO_FILLS) {
              if (eeo.pattern.test(legendText)) {
                const profileVal = eeo.profileKey ? profile[eeo.profileKey] : null;
                const target = profileVal || eeo.fallback;
                if (target) {
                  const clicked = clickRadioByText(fs, target);
                  if (clicked) {
                    console.log(`[JAOS Ashby] EEO "${legendText.substring(0, 40)}" → "${target}"`);
                  } else {
                    // Try "Decline" variants
                    clickRadioByText(fs, "Decline") || clickRadioByText(fs, "Prefer not");
                    console.log(`[JAOS Ashby] EEO "${legendText.substring(0, 40)}" → Decline (fallback)`);
                  }
                }
                recordPreFill(legendText, false);
                preFilled++;

                // Remove individual radio inputs from scanResult.fields
                // so they don't get sent to LLM
                const radioNames = new Set([...radios].map(r => r.name).filter(Boolean));
                scanResult.fields = scanResult.fields.filter(f => {
                  const fname = f.name || f.element?.name || "";
                  return !radioNames.has(fname);
                });
                break;
              }
            }
          }

          // ── Pass 5: Detect combobox widgets not caught by scanner ─
          const comboboxes = formRoot.querySelectorAll(
            '[role="combobox"]:not(input):not(select):not(textarea)'
          );
          for (const cb of comboboxes) {
            const alreadyCaptured = scanResult.widgets.some(
              (w) => w.el === cb || w.element === cb
            );
            if (alreadyCaptured) continue;

            const entry = cb.closest(".ashby-application-form-field-entry, [class*='_fieldEntry_']");
            const label = getQuestionLabel(entry) ||
              cb.getAttribute("aria-label") || "";

            if (label) {
              scanResult.widgets.push({
                uid: `ashby-combo-${scanResult.widgets.length}`,
                type: "aria-combobox",
                el: cb,
                element: cb,
                label,
                placeholder: cb.getAttribute("placeholder") ||
                  cb.querySelector("input")?.placeholder || "",
                section: "",
                currentValue: cb.querySelector("input")?.value || "",
                required: !!entry?.querySelector("[class*='_required_']"),
              });
            }
          }

          console.log(`[JAOS Ashby] augmentScan: ${preFilled} pre-filled (${scanResult.preFilledLabels.length} tracked), ${scanResult.fields.length} fields + ${scanResult.widgets.length} widgets remain for LLM`);
        },

        // [Ashby] Post-fill: select combobox options + sync React state
        afterFill: async (ctx) => {
          const formRoot = getFormRoot();

          // 1. Handle combobox dropdowns — after filler typed the value,
          // the dropdown should be open with options. Click the first
          // selected/highlighted option or press Enter to commit.
          const comboInputs = formRoot.querySelectorAll(
            'input[role="combobox"], [role="combobox"] input'
          );
          for (const input of comboInputs) {
            if (!input.value) continue;

            // Check if a listbox dropdown is visible
            const listboxId = input.getAttribute("aria-controls") ||
              input.getAttribute("aria-owns");
            const listbox = listboxId
              ? document.getElementById(listboxId)
              : document.querySelector('[role="listbox"]:not([aria-hidden="true"])');

            if (listbox) {
              // Click the first option with aria-selected="true" or the first option
              const selected = listbox.querySelector('[role="option"][aria-selected="true"]') ||
                listbox.querySelector('[role="option"]');
              if (selected) {
                selected.click();
                console.log(`[JAOS Ashby] Combobox selected: "${selected.textContent?.trim()?.substring(0, 50)}"`);
                await new Promise(r => setTimeout(r, 300));
                continue;
              }
            }

            // Fallback: press Enter to select first result
            input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
            input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
            console.log(`[JAOS Ashby] Combobox Enter pressed for: "${input.value.substring(0, 40)}"`);
            await new Promise(r => setTimeout(r, 300));
          }

          // 2. Trigger React sync on all inputs that have values
          const allInputs = formRoot.querySelectorAll("input, select, textarea");
          for (const input of allInputs) {
            if (input.value || input.checked) {
              triggerReactSync(input);
            }
          }

          // Wait for React re-render to settle
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
