(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "workday",

  detect: () =>
    // {company}.wd{N}.myworkdayjobs.com (e.g., citi.wd5.myworkdayjobs.com)
    /\.wd\d+\.myworkdayjobs\.com$/i.test(window.location.hostname) ||
    // {company}.myworkdayjobs.com
    /\.myworkdayjobs\.com$/i.test(window.location.hostname) ||
    // {company}.myworkdaysite.com
    /\.myworkdaysite\.com$/i.test(window.location.hostname) ||
    // Direct workday.com subdomains
    /\.workday\.com$/i.test(window.location.hostname) ||
    // DOM fallback: Workday automation-id attributes
    !!document.querySelector(
      '[data-automation-id="legalNameSection_firstName"], [data-automation-id="jobPostingHeader"]'
    ),

  selectors: [
    // ── Legal name ──
    ['[data-automation-id="legalNameSection_firstName"] input', "first_name"],
    ['[data-automation-id="legalNameSection_lastName"] input', "last_name"],
    ['[data-automation-id="legalNameSection_middleName"] input', "middle_name"],
    ['[data-automation-id="preferredName"] input', "first_name"],

    // ── Contact ──
    ['[data-automation-id="email"] input', "email"],
    ['[data-automation-id="emailAddress"] input', "email"],
    ['[data-automation-id="phone"] input', "phone"],
    ['[data-automation-id="phoneNumber"] input', "phone"],
    ['[data-automation-id="phonePrimary"] input', "phone"],

    // ── Address ──
    ['[data-automation-id="addressSection_addressLine1"] input', "address"],
    ['[data-automation-id="addressSection_city"] input', "city"],
    ['[data-automation-id="addressSection_postalCode"] input', "zip"],

    // ── Links ──
    ['[data-automation-id="linkedInUrl"] input', "linkedin"],
    ['[data-automation-id="linkedInQuestion"] input', "linkedin"],
    ['[data-automation-id="websiteUrl"] input', "portfolio"],
    ['[data-automation-id="websiteQuestion"] input', "portfolio"],

    // ── Work experience ──
    ['[data-automation-id="previousWorkerInformation"] input', "current_company"],
    ['[data-automation-id="jobTitle"] input', "current_title"],
    ['[data-automation-id="company"] input', "current_company"],

    // ── Education ──
    ['[data-automation-id="school"] input', "school"],
    ['[data-automation-id="gpa"] input', "gpa"],

    // ── Compensation ──
    ['[data-automation-id="salary"] input', "desired_salary"],
    ['[data-automation-id="expectedSalary"] input', "desired_salary"],
    ['[data-automation-id="currentSalary"] input', "desired_salary"],
  ],

  /**
   * Workday is fully React-based. Native .value= won't trigger React state updates.
   * We need:
   *  - Native property descriptor to set values and fire input/change events
   *  - Custom handling for Workday's dropdown/combobox/multiselect components
   *  - Awareness of multi-step forms (only fill visible fields)
   */
  fillCustom: async (profile, helpers) => {
    const { toLower, fillSelectByText } = helpers;
    let filled = 0;

    // Track DOM elements already filled by multi-entry sections so the
    // generic re-fill pass (and subsequent entries) won't overwrite them.
    const filledInputs = new Set();

    // ── Helper: wait for an element to appear ──
    const waitFor = (selector, parent = document, timeout = 2000) =>
      new Promise((resolve) => {
        const el = parent.querySelector(selector);
        if (el) return resolve(el);
        let elapsed = 0;
        const iv = setInterval(() => {
          const found = parent.querySelector(selector);
          elapsed += 50;
          if (found || elapsed >= timeout) {
            clearInterval(iv);
            resolve(found || null);
          }
        }, 50);
      });

    // ── Helper: clear all existing entries in a Workday multi-entry section ──
    // Finds all "Delete" buttons within the section and clicks them in reverse order.
    const clearSectionEntries = async (headingPattern) => {
      const headings = document.querySelectorAll(
        "h2, h3, h4, legend, b, strong, " +
        '[data-automation-id*="label"], [data-automation-id*="Label"], ' +
        '[data-automation-id*="sectionHeader"]'
      );
      for (const el of headings) {
        if (!headingPattern.test(el.textContent || "")) continue;
        let ancestor = el.parentElement;
        for (let depth = 0; depth < 8 && ancestor; depth++) {
          const deleteButtons = Array.from(ancestor.querySelectorAll("button")).filter(
            (b) => /^\s*delete\s*$/i.test(b.textContent?.trim() || "")
          );
          if (deleteButtons.length === 0) {
            ancestor = ancestor.parentElement;
            continue;
          }
          // Click deletes in reverse order (bottom-up) to avoid index shifting
          for (let i = deleteButtons.length - 1; i >= 0; i--) {
            deleteButtons[i].click();
            await new Promise((r) => setTimeout(r, 600));
            // Handle potential confirmation dialog
            const confirmBtn = document.querySelector(
              'button[data-automation-id="confirmDeleteButton"], ' +
              'button[data-automation-id="deleteConfirm"], ' +
              '[role="dialog"] button:not([data-automation-id*="cancel"])'
            );
            if (confirmBtn && /yes|ok|confirm|delete/i.test(confirmBtn.textContent || "")) {
              confirmBtn.click();
              await new Promise((r) => setTimeout(r, 400));
            }
          }
          console.log(`[JAOS] Workday: cleared ${deleteButtons.length} existing entries for ${headingPattern}`);
          return;
        }
      }
    };

    // ── Helper: clear all text inputs and textareas in visible form ──
    const clearFormFields = () => {
      const inputs = document.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea'
      );
      for (const input of inputs) {
        if (input.closest("#jaos-dev-panel")) continue;
        if (input.disabled || input.readOnly || !input.value) continue;
        const proto =
          input.tagName === "TEXTAREA"
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (nativeSetter) {
          nativeSetter.call(input, "");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      // Reset selects to first option
      const selects = document.querySelectorAll("select");
      for (const sel of selects) {
        if (sel.closest("#jaos-dev-panel") || sel.disabled) continue;
        if (sel.selectedIndex > 0) {
          sel.selectedIndex = 0;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    };

    // ── STEP 0: Clear form before filling (prevents duplicates on re-autofill) ──
    clearFormFields();
    // Clear multi-entry sections in parallel
    await Promise.all([
      clearSectionEntries(/work\s*experience/i),
      clearSectionEntries(/\beducation\b/i),
      clearSectionEntries(/\blanguage/i),
      clearSectionEntries(/\bwebsite/i),
    ]);
    await new Promise((r) => setTimeout(r, 500));

    // ── Helper: set React input value ──
    const setReactInput = (input, value) => {
      if (!input || input.disabled || input.readOnly) return false;
      const proto =
        input.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (!nativeSetter) return false;

      input.focus();
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      nativeSetter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      return true;
    };

    // ── Helper: fill a Workday dropdown/combobox by data-automation-id ──
    const fillWorkdayDropdown = async (automationId, value) => {
      if (!value) return false;

      const container = document.querySelector(
        `[data-automation-id="${automationId}"]`
      );
      if (!container) return false;

      // Try clicking the dropdown trigger button
      const trigger =
        container.querySelector('[data-automation-id="arrowButton"], button[aria-haspopup]') ||
        container.querySelector('button') ||
        container.querySelector('[role="combobox"]') ||
        container.querySelector('input');
      if (!trigger) return false;

      trigger.click();
      await new Promise((r) => setTimeout(r, 400));

      // Look for the dropdown list that appeared
      const listbox =
        document.querySelector('[data-automation-id="selectWidget"] [role="listbox"]') ||
        document.querySelector('[role="listbox"]') ||
        document.querySelector('[data-automation-id="promptOption"]')?.parentElement;

      if (listbox) {
        const target = toLower(value);
        const options = Array.from(
          listbox.querySelectorAll('[role="option"], [data-automation-id="promptOption"]')
        );
        const match =
          options.find((o) => toLower(o.textContent) === target) ||
          options.find((o) => toLower(o.textContent).includes(target));

        if (match) {
          match.click();
          await new Promise((r) => setTimeout(r, 200));
          return true;
        }
      }

      // Fallback: try searchable combobox — type to filter
      const searchInput = container.querySelector('input[role="combobox"], input');
      if (searchInput) {
        setReactInput(searchInput, value);
        await new Promise((r) => setTimeout(r, 500));

        // Try selecting the first filtered result
        const filteredOption = document.querySelector(
          '[role="option"], [data-automation-id="promptOption"]'
        );
        if (filteredOption) {
          filteredOption.click();
          await new Promise((r) => setTimeout(r, 200));
          return true;
        }
      }

      // Close dropdown if we couldn't select
      document.body.click();
      await new Promise((r) => setTimeout(r, 100));
      return false;
    };

    // ── Helper: resolve label text for a Workday field section ──
    const getWorkdayLabel = (container) => {
      const label =
        container.querySelector("label") ||
        container.querySelector('[data-automation-id="formLabel"]') ||
        container.querySelector("legend");
      return toLower(label?.textContent || "");
    };

    // ── 0. Multi-entry sections: Work Experience, Education, Languages ──
    // On Workday's "My Experience" page, each section starts collapsed with
    // an "Add" button.  Clicking it reveals the first entry form (labelled
    // "Work Experience 1", "Education 1", etc.).  Subsequent entries use
    // an "Add Another" button that appears at the bottom of the section.
    //
    // Work Experience fields: Job Title*, Company*, Location,
    //   "I currently work here" checkbox, From* (MM/YYYY), To* (MM/YYYY),
    //   Role Description (textarea).
    //
    // Education fields: School or University* (searchable combobox),
    //   Degree* (select), Field of Study (searchable combobox),
    //   Overall Result (GPA) (text), From (YYYY), To (YYYY).
    //
    // Languages fields: Language (combobox), Proficiency (dropdown).

    /**
     * Find the section container that matches `headingPattern`, plus the
     * correct "Add" / "Add Another" button for the given entry index.
     */
    const findSectionButton = (headingPattern, entryIndex) => {
      const headings = document.querySelectorAll(
        "h2, h3, h4, legend, b, strong, " +
        '[data-automation-id*="label"], [data-automation-id*="Label"], ' +
        '[data-automation-id*="sectionHeader"]'
      );
      let headingFound = false;
      for (const el of headings) {
        if (!headingPattern.test(el.textContent || "")) continue;
        headingFound = true;
        console.log(`[JAOS] findSectionButton: matched heading "${el.textContent?.trim()}" for pattern ${headingPattern}`);
        // Walk up to find the section wrapper that contains the button
        let ancestor = el.parentElement;
        for (let depth = 0; depth < 8 && ancestor; depth++) {
          const buttons = Array.from(ancestor.querySelectorAll("button"));
          // First entry → "Add"; subsequent → "Add Another"
          const btn =
            entryIndex === 0
              ? buttons.find((b) => /^\s*add\s*$/i.test(b.textContent?.trim() || ""))
              : buttons.find((b) => /add\s*another/i.test(b.textContent?.trim() || ""));
          // Fallback: either button text works
          const fallback = buttons.find((b) =>
            /^\s*add(\s*another)?\s*$/i.test(b.textContent?.trim() || "")
          );
          const found = btn || fallback;
          if (found) {
            console.log(`[JAOS] findSectionButton: found button "${found.textContent?.trim()}" at depth ${depth}`);
            return { button: found, container: ancestor };
          }
          if (buttons.length > 0) {
            console.log(`[JAOS] findSectionButton: depth ${depth}, buttons found but no match:`, buttons.map(b => `"${b.textContent?.trim()}"`).slice(0, 5));
          }
          ancestor = ancestor.parentElement;
        }
      }
      if (!headingFound) {
        console.warn(`[JAOS] findSectionButton: NO heading matched pattern ${headingPattern}`);
      }
      return null;
    };

    /**
     * Fill empty text inputs/textareas inside `container` using a field map.
     * `fieldMap` is an array of [regex, value] pairs matched against
     * the combined automation-id + label text of each field's wrapper.
     * Only fills fields that are currently empty AND not already claimed
     * by a previous multi-entry fill (tracked via `filledInputs` Set).
     */
    const fillEntryFields = async (container, fieldMap) => {
      let count = 0;
      const inputs = container.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea'
      );
      for (const input of inputs) {
        if (filledInputs.has(input)) continue; // Already claimed by a previous entry
        if (input.value || input.disabled || input.readOnly) continue;
        if (input.closest("#jaos-dev-panel")) continue;

        const wrapper = input.closest("[data-automation-id]") || input.parentElement;
        const aid = wrapper?.getAttribute("data-automation-id") || "";
        const label = getWorkdayLabel(wrapper);
        const combined = toLower(aid + " " + label);

        for (const [regex, value] of fieldMap) {
          if (value && regex.test(combined)) {
            if (setReactInput(input, String(value))) {
              filledInputs.add(input);
              count++;
            }
            break;
          }
        }
      }
      return count;
    };

    /**
     * Fill a native <select> by matching option text within a scoped container.
     * `labelPattern` matches against the label near the select.
     */
    const fillScopedSelect = (container, labelPattern, value) => {
      if (!value) return false;
      const selects = container.querySelectorAll("select");
      for (const sel of selects) {
        if (sel.disabled) continue;
        const wrapper = sel.closest("[data-automation-id]") || sel.parentElement;
        const label = getWorkdayLabel(wrapper);
        const aid = wrapper?.getAttribute("data-automation-id") || "";
        if (!labelPattern.test(toLower(aid + " " + label))) continue;
        if (fillSelectByText(sel, String(value))) return true;
      }
      return false;
    };

    /**
     * Fill a Workday dropdown/combobox *within* a scoped container.
     */
    const fillScopedDropdown = async (container, idPattern, value) => {
      if (!value) return false;
      const targets = container.querySelectorAll("[data-automation-id]");
      for (const el of targets) {
        const aid = el.getAttribute("data-automation-id") || "";
        if (!idPattern.test(aid)) continue;
        return await fillWorkdayDropdown(aid, String(value));
      }
      // Fallback: match by label text on combobox inputs
      const comboInputs = container.querySelectorAll(
        'input[role="combobox"], input[aria-autocomplete]'
      );
      for (const input of comboInputs) {
        const wrapper = input.closest("[data-automation-id]") || input.parentElement;
        const label = getWorkdayLabel(wrapper);
        if (!idPattern.test(toLower(label))) continue;
        setReactInput(input, String(value));
        await new Promise((r) => setTimeout(r, 600));
        const option = document.querySelector(
          '[role="option"], [data-automation-id="promptOption"]'
        );
        if (option) {
          option.click();
          await new Promise((r) => setTimeout(r, 200));
          return true;
        }
        document.body.click();
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    };

    /**
     * Fill a Workday "promptable search list" (School, Field of Study, etc.).
     * These fields open a panel with options and optionally a separate Search
     * input at the bottom of the panel.  Uses progressive search: tries full
     * value first, then individual words (longest first), selects best match.
     */
    const fillWorkdaySearchableList = async (container, labelPattern, value) => {
      if (!value) return false;

      // Find the field input matching the label
      const inputs = container.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])'
      );
      let fieldInput = null;
      for (const inp of inputs) {
        if (inp.disabled || inp.readOnly) continue;
        const wrapper = inp.closest("[data-automation-id]") || inp.parentElement;
        const aid = wrapper?.getAttribute("data-automation-id") || "";
        const label = getWorkdayLabel(wrapper);
        if (labelPattern.test(toLower(aid + " " + label))) {
          fieldInput = inp;
          break;
        }
      }
      if (!fieldInput) return false;

      // Build progressive search terms: full value, then individual words
      const searchTerms = [value];
      const words = value.split(/\s+/).filter((w) => w.length >= 3);
      words.sort((a, b) => b.length - a.length);
      for (const w of words) {
        if (w.toLowerCase() !== value.toLowerCase()) searchTerms.push(w);
      }

      for (const term of searchTerms) {
        // Type into the field input (opens the dropdown for some field types)
        setReactInput(fieldInput, term);
        await new Promise((r) => setTimeout(r, 700));

        // Some Workday fields have a separate "Search" input inside the panel
        const panelSearch = document.querySelector('input[placeholder="Search" i]');
        if (panelSearch && panelSearch !== fieldInput) {
          setReactInput(panelSearch, term);
          await new Promise((r) => setTimeout(r, 700));
        }

        // Gather visible options (filter out "No Items." indicator)
        const options = Array.from(
          document.querySelectorAll(
            '[role="option"], [data-automation-id="promptOption"]'
          )
        ).filter((o) => {
          const text = o.textContent?.trim() || "";
          return text && !/^no\s*items?\.?$/i.test(text);
        });

        if (options.length === 0) continue; // Try next search term

        // Best match: exact → includes → reverse includes → first result
        const target = toLower(value);
        const termLow = toLower(term);
        const match =
          options.find((o) => toLower(o.textContent?.trim()) === target) ||
          options.find((o) => toLower(o.textContent?.trim()).includes(termLow)) ||
          options.find((o) => termLow.includes(toLower(o.textContent?.trim()))) ||
          options[0];

        if (match) {
          match.click();
          await new Promise((r) => setTimeout(r, 300));
          return true;
        }
      }

      // Close any open panel
      document.body.click();
      await new Promise((r) => setTimeout(r, 100));
      return false;
    };

    /**
     * Convert "2023-06" → "06/2023" (MM/YYYY for Workday date inputs).
     */
    const toMMYYYY = (dateStr) => {
      if (!dateStr) return "";
      const parts = String(dateStr).split("-");
      if (parts.length >= 2 && parts[1]) return `${parts[1]}/${parts[0]}`;
      return parts[0] || "";
    };

    // ── DEBUG: Log profile arrays to verify data is present ──
    console.log("[JAOS] Workday fillCustom called. Profile arrays:", {
      experience_entries: profile.experience_entries?.length ?? "MISSING",
      education_entries: profile.education_entries?.length ?? "MISSING",
      language_entries: profile.language_entries?.length ?? "MISSING",
      linkedin: profile.linkedin || "none",
      github: profile.github || "none",
    });

    // ── Work Experience entries ──
    const workEntries = Array.isArray(profile.experience_entries)
      ? profile.experience_entries.filter((e) => e && (e.role || e.title || e.company))
      : [];
    if (workEntries.length > 0) {
      for (let i = 0; i < workEntries.length; i++) {
        const section = findSectionButton(/work\s*experience/i, i);
        if (!section) {
          console.warn(`[JAOS] Workday: could not find Add button for work experience entry ${i + 1}`);
          break;
        }

        section.button.click();
        await new Promise((r) => setTimeout(r, 1000));

        const entry = workEntries[i];
        const isCurrent =
          Boolean(entry.is_current) || /present|current/i.test(entry.end_date || "");

        // Fill text inputs + textarea within the section
        const workFieldMap = [
          [/job.?title|position/i, entry.role || entry.title || ""],
          [/\bcompany\b|employer|organization/i, entry.company || ""],
          [/role.?description|description|responsibilit|duties/i, entry.description || ""],
          [/\blocation\b/i, entry.location || ""],
        ];
        filled += await fillEntryFields(section.container, workFieldMap);

        // "I currently work here" checkbox — only for the most recent entry (i === 0)
        // Click BEFORE filling dates so that the "To" field may be hidden/disabled
        if (i === 0 && isCurrent) {
          const cbs = section.container.querySelectorAll('input[type="checkbox"]');
          for (const cb of cbs) {
            if (cb.checked || cb.disabled) continue;
            const cbWrapper = cb.closest("[data-automation-id]") || cb.parentElement;
            const cbLabel = toLower(cbWrapper?.textContent || "");
            if (/currently\s*work|i\s*currently/i.test(cbLabel)) {
              cb.click();
              await new Promise((r) => setTimeout(r, 300));
              filled++;
              break;
            }
          }
        }

        // Date fields: From (MM/YYYY) and To (MM/YYYY)
        // These are text inputs with placeholder "MM/YYYY" and a calendar icon
        const dateFieldMap = [];
        if (entry.start_date) {
          dateFieldMap.push([/\bfrom\b|start.?date/i, toMMYYYY(entry.start_date)]);
        }
        if (entry.end_date && !isCurrent) {
          dateFieldMap.push([/\bto\b|end.?date/i, toMMYYYY(entry.end_date)]);
        }
        if (dateFieldMap.length > 0) {
          filled += await fillEntryFields(section.container, dateFieldMap);
        }

        await new Promise((r) => setTimeout(r, 400));
        console.log(`[JAOS] Workday: filled work experience ${i + 1}/${workEntries.length}`);
      }
    }

    // ── Education entries ──
    const eduEntries = Array.isArray(profile.education_entries)
      ? profile.education_entries.filter((e) => e && (e.institution || e.school || e.degree))
      : [];
    if (eduEntries.length > 0) {
      for (let i = 0; i < eduEntries.length; i++) {
        const section = findSectionButton(/\beducation\b/i, i);
        if (!section) {
          console.warn(`[JAOS] Workday: could not find Add button for education entry ${i + 1}`);
          break;
        }

        section.button.click();
        await new Promise((r) => setTimeout(r, 1000));

        const entry = eduEntries[i];

        // "School or University" — promptable search list with progressive fallback
        const schoolValue = entry.institution || entry.school || "";
        if (schoolValue) {
          if (await fillWorkdaySearchableList(
            section.container, /school|university|institution/i, schoolValue
          )) filled++;
          await new Promise((r) => setTimeout(r, 300));
        }

        // "Degree" — native <select> dropdown ("Select One")
        if (entry.degree) {
          if (fillScopedSelect(section.container, /degree/i, entry.degree)) {
            filled++;
          }
          await new Promise((r) => setTimeout(r, 300));
        }

        // "Field of Study" — promptable search list with progressive fallback
        if (entry.field_of_study) {
          if (await fillWorkdaySearchableList(
            section.container, /field.?of.?study|major/i, entry.field_of_study
          )) filled++;
          await new Promise((r) => setTimeout(r, 300));
        }

        // "Overall Result (GPA)" + date fields (YYYY text inputs)
        const eduFieldMap = [
          [/gpa|overall.?result|grade/i, entry.gpa || ""],
          [/\bfrom\b|start/i, entry.start_year || ""],
          [/\bto\b|end|expected|actual/i, entry.end_year || ""],
        ];
        filled += await fillEntryFields(section.container, eduFieldMap);

        await new Promise((r) => setTimeout(r, 400));
        console.log(`[JAOS] Workday: filled education ${i + 1}/${eduEntries.length}`);
      }
    }

    // ── Language entries ──
    // Workday Languages form: Language* (select), "I am fluent in this language."
    // (checkbox), Reading* (select), Speaking* (select), Writing* (select).
    const langEntries = Array.isArray(profile.language_entries)
      ? profile.language_entries.filter((e) => e && e.language)
      : [];
    if (langEntries.length > 0) {
      for (let i = 0; i < langEntries.length; i++) {
        const section = findSectionButton(/\blanguage/i, i);
        if (!section) {
          console.warn(`[JAOS] Workday: could not find Add button for language entry ${i + 1}`);
          break;
        }

        section.button.click();
        await new Promise((r) => setTimeout(r, 1000));

        const entry = langEntries[i];

        // "Language" — native <select> dropdown
        if (entry.language) {
          if (fillScopedSelect(section.container, /\blanguage\b/i, entry.language)) {
            filled++;
          }
          await new Promise((r) => setTimeout(r, 300));
        }

        // Map proficiency to Workday's Reading/Speaking/Writing levels
        // Native/Fluent → "Advanced", Advanced → "Advanced",
        // Intermediate → "Intermediate", Basic → "Beginner"
        const profToLevel = (prof) => {
          const p = toLower(prof || "");
          if (/native|fluent|advanced/.test(p)) return "Advanced";
          if (/intermediate/.test(p)) return "Intermediate";
          if (/basic|beginner|elementary/.test(p)) return "Beginner";
          return prof || "";
        };

        const level = profToLevel(entry.proficiency);

        // "I am fluent in this language." checkbox
        if (/native|fluent/i.test(entry.proficiency || "")) {
          const cbs = section.container.querySelectorAll('input[type="checkbox"]');
          for (const cb of cbs) {
            if (cb.checked || cb.disabled) continue;
            const cbWrapper = cb.closest("[data-automation-id]") || cb.parentElement;
            const cbLabel = toLower(cbWrapper?.textContent || "");
            if (/fluent/i.test(cbLabel)) {
              cb.click();
              await new Promise((r) => setTimeout(r, 200));
              filled++;
              break;
            }
          }
        }

        // Reading, Speaking, Writing — native <select> dropdowns
        if (level) {
          if (fillScopedSelect(section.container, /\breading\b/i, level)) filled++;
          await new Promise((r) => setTimeout(r, 200));
          if (fillScopedSelect(section.container, /\bspeaking\b/i, level)) filled++;
          await new Promise((r) => setTimeout(r, 200));
          if (fillScopedSelect(section.container, /\bwriting\b/i, level)) filled++;
          await new Promise((r) => setTimeout(r, 200));
        }

        await new Promise((r) => setTimeout(r, 400));
        console.log(`[JAOS] Workday: filled language ${i + 1}/${langEntries.length}`);
      }
    }

    // ── Websites section: LinkedIn, GitHub, Portfolio URLs ──
    // Workday's "Websites" section uses "Add" / "Add Another" with a single
    // URL* text input per entry.  We add one entry per social link.
    const websiteUrls = [
      profile.linkedin,
      profile.github,
      profile.portfolio,
    ].filter(Boolean);

    if (websiteUrls.length > 0) {
      for (let i = 0; i < websiteUrls.length; i++) {
        const section = findSectionButton(/\bwebsite/i, i);
        if (!section) {
          // Websites section may not exist on all Workday forms
          break;
        }

        section.button.click();
        await new Promise((r) => setTimeout(r, 800));

        filled += await fillEntryFields(section.container, [
          [/url|website|link/i, websiteUrls[i]],
        ]);

        await new Promise((r) => setTimeout(r, 400));
        console.log(`[JAOS] Workday: filled website URL ${i + 1}/${websiteUrls.length}`);
      }
    }

    // ── 1. Re-fill all text inputs using React-safe setter ──
    //    The selector pass uses setControlValue which already does this,
    //    but Workday sometimes needs a second pass after React re-renders.
    //    SKIP inputs already claimed by multi-entry sections above.
    const allInputContainers = document.querySelectorAll(
      '[data-automation-id]:has(input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]))'
    );
    for (const container of allInputContainers) {
      const input = container.querySelector(
        'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])'
      );
      if (!input || input.disabled || input.readOnly || input.value) continue;
      if (input.closest("#jaos-dev-panel")) continue;
      if (filledInputs.has(input)) continue;

      const automationId = container.getAttribute("data-automation-id") || "";
      const labelText = getWorkdayLabel(container) || toLower(automationId);

      let value = null;
      if (/firstName|first.?name/i.test(automationId)) value = profile.first_name;
      else if (/lastName|last.?name/i.test(automationId)) value = profile.last_name;
      else if (/email/i.test(automationId)) value = profile.email;
      else if (/phone|phoneNumber/i.test(automationId)) value = profile.phone;
      else if (/addressLine1|address/i.test(automationId)) value = profile.address;
      else if (/city/i.test(automationId)) value = profile.city;
      else if (/postalCode|zip/i.test(automationId)) value = profile.zip;
      else if (/linkedIn/i.test(automationId)) value = profile.linkedin;
      else if (/website|portfolio/i.test(automationId)) value = profile.portfolio;
      else if (/github/i.test(automationId)) value = profile.github;
      else if (/school|university/i.test(automationId)) value = profile.school;
      else if (/gpa/i.test(automationId)) value = profile.gpa;
      else if (/jobTitle|currentTitle/i.test(automationId)) value = profile.current_title;
      else if (/company|employer|previousWorker/i.test(automationId)) value = profile.current_company;
      else if (/salary|compensation/i.test(automationId)) value = profile.desired_salary;
      // Label-based fallback for fields without clear automation IDs
      else if (/\b(years?.?(of)?.?exp)\b/.test(labelText)) value = profile.years_experience;
      else if (/\b(notice.?period)\b/.test(labelText)) value = profile.notice_period;
      else if (/\b(summary|about)\b/.test(labelText)) value = profile.summary;

      if (value && setReactInput(input, String(value))) filled++;
    }

    // ── 2. Fill textareas (cover letter, summaries) ──
    const textareas = document.querySelectorAll(
      '[data-automation-id] textarea, textarea'
    );
    for (const ta of textareas) {
      if (ta.disabled || ta.readOnly || ta.value || ta.closest("#jaos-dev-panel")) continue;

      const container = ta.closest("[data-automation-id]");
      const automationId = container?.getAttribute("data-automation-id") || "";
      const labelText = container ? getWorkdayLabel(container) : "";
      const combined = toLower(automationId + " " + labelText);

      let value = null;
      if (/cover.?letter/i.test(combined)) value = profile.cover_letter;
      else if (/summary|about|bio|objective/.test(combined)) value = profile.summary;

      if (value && setReactInput(ta, String(value))) filled++;
    }

    // ── 3. Dropdowns: country, state, degree, etc. ──
    const dropdownMappings = [
      ["addressSection_countryRegion", profile.country],
      ["addressSection_countryRegionSubdivision", profile.state],
      ["countryRegion", profile.country],
      ["state", profile.state],
      ["degree", profile.degree],
      ["fieldOfStudy", profile.field_of_study],
      ["phoneDeviceType", "Mobile"],
      ["countryPhoneCode", profile.country],
    ];

    for (const [autoId, value] of dropdownMappings) {
      if (!value) continue;
      if (await fillWorkdayDropdown(autoId, String(value))) {
        filled++;
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // ── 4. Generic labeled fields — scan for patterns in remaining unfilled fields ──
    const allSections = document.querySelectorAll(
      '[data-automation-id="questionSection"], [data-automation-id="customQuestionPanel"], [data-automation-id="formField"]'
    );
    for (const section of allSections) {
      const labelText = getWorkdayLabel(section);
      if (!labelText) continue;

      // Try select/dropdown inside this section
      const select = section.querySelector("select");
      if (select && !select.disabled && !select.value) {
        let matched = false;
        if (/\b(gender|sex)\b/.test(labelText) && profile.gender)
          matched = fillSelectByText(select, profile.gender);
        else if (/\b(race|ethnic)\b/.test(labelText) && profile.race_ethnicity)
          matched = fillSelectByText(select, profile.race_ethnicity);
        else if (/\b(hispanic|latino)\b/.test(labelText) && profile.race_ethnicity)
          matched = fillSelectByText(select, profile.race_ethnicity);
        else if (/\b(veteran|military)\b/.test(labelText) && profile.veteran_status)
          matched = fillSelectByText(select, profile.veteran_status);
        else if (/\b(disabilit)\b/.test(labelText) && profile.disability_status)
          matched = fillSelectByText(select, profile.disability_status);
        else if (/\b(sponsor)\b/.test(labelText) && profile.requires_sponsorship)
          matched = fillSelectByText(select, profile.requires_sponsorship);
        else if (/\b(work.?auth)\b/.test(labelText) && profile.work_authorization)
          matched = fillSelectByText(select, profile.work_authorization);
        else if (/\b(relocat)\b/.test(labelText) && profile.willing_to_relocate)
          matched = fillSelectByText(select, profile.willing_to_relocate);
        else if (/\b(over.?18|legal.?age)\b/.test(labelText) && profile.is_over_18)
          matched = fillSelectByText(select, profile.is_over_18);
        else if (/\b(referr|how.?did.?you)\b/.test(labelText) && profile.referral_source)
          matched = fillSelectByText(select, profile.referral_source);

        if (matched) filled++;
        continue;
      }

      // Try text input inside this section
      const input = section.querySelector(
        'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])'
      );
      if (input && !input.disabled && !input.readOnly && !input.value) {
        let value = null;
        if (/\b(years?.?(of)?.?exp)\b/.test(labelText)) value = profile.years_experience;
        else if (/\b(salary|compensation)\b/.test(labelText)) value = profile.desired_salary;
        else if (/\b(notice.?period)\b/.test(labelText)) value = profile.notice_period;
        else if (/\b(linkedin)\b/.test(labelText)) value = profile.linkedin;
        else if (/\b(github)\b/.test(labelText)) value = profile.github;
        else if (/\b(portfolio|website)\b/.test(labelText)) value = profile.portfolio;
        else if (/\b(school|university)\b/.test(labelText)) value = profile.school;
        else if (/\b(gpa|grade)\b/.test(labelText)) value = profile.gpa;

        if (value && setReactInput(input, String(value))) filled++;
      }
    }

    // ── 5. Checkboxes ──
    const checkboxes = document.querySelectorAll(
      '[data-automation-id] input[type="checkbox"]'
    );
    for (const cb of checkboxes) {
      if (cb.disabled || cb.closest("#jaos-dev-panel")) continue;

      const container = cb.closest("[data-automation-id]");
      const labelText = getWorkdayLabel(container || cb.parentElement);
      if (!labelText) continue;

      let shouldCheck = null;
      // NOTE: "currently work" checkbox is handled per-entry in the Work
      // Experience loop (only entry 0 gets checked). Do NOT re-check here.
      if (/\b(agree|acknowledge|certif|consent)\b/.test(labelText))
        shouldCheck = true;

      if (shouldCheck !== null && cb.checked !== shouldCheck) {
        cb.click();
        await new Promise((r) => setTimeout(r, 100));
        filled++;
      }
    }

    // ── 6. Radio buttons ──
    const radioGroups = document.querySelectorAll(
      '[data-automation-id] [role="radiogroup"], [data-automation-id]:has(input[type="radio"])'
    );
    for (const group of radioGroups) {
      if (group.closest("#jaos-dev-panel")) continue;

      const labelText = getWorkdayLabel(group);
      if (!labelText) continue;

      let targetValue = null;
      if (/\b(gender|sex)\b/.test(labelText)) targetValue = profile.gender;
      else if (/\b(veteran|military)\b/.test(labelText)) targetValue = profile.veteran_status;
      else if (/\b(disabilit)\b/.test(labelText)) targetValue = profile.disability_status;
      else if (/\b(hispanic|latino)\b/.test(labelText)) targetValue = profile.race_ethnicity;
      else if (/\b(sponsor)\b/.test(labelText)) targetValue = profile.requires_sponsorship;
      else if (/\b(work.?auth)\b/.test(labelText)) targetValue = profile.work_authorization;
      else if (/\b(relocat)\b/.test(labelText)) targetValue = profile.willing_to_relocate;

      if (!targetValue) continue;

      const target = toLower(targetValue);
      const radios = Array.from(group.querySelectorAll('input[type="radio"]'));
      for (const radio of radios) {
        const radioLabel = toLower(
          radio.closest("label")?.textContent ||
          document.querySelector(`label[for="${radio.id}"]`)?.textContent ||
          radio.value || ""
        );
        if (radioLabel.includes(target) || target.includes(radioLabel)) {
          if (!radio.checked) {
            radio.click();
            await new Promise((r) => setTimeout(r, 100));
            filled++;
          }
          break;
        }
      }
    }

    return filled;
  },
});
