(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "greenhouse",

  detect: () => {
    // Direct Greenhouse hostnames — always detect
    if (/boards\.greenhouse\.io|job-boards\.greenhouse\.io|my\.greenhouse\.io/i.test(
      window.location.hostname
    )) return true;

    // Greenhouse-specific field naming convention (definitive signal)
    if (document.querySelector(
      'input[name^="job_application["], select[name^="job_application["], textarea[name^="job_application["]'
    )) return true;

    // Greenhouse form containers — only detect if they contain actual form fields.
    // On white-labeled sites, #grnhse_app may be an empty iframe wrapper.
    const container = document.querySelector(
      "#grnhse_app, #application_form.job-application, #application.job-application"
    );
    if (container && container.querySelector('input:not([type="hidden"]), select, textarea')) return true;

    // Embed patterns (iframe/script/link) alone are NOT enough —
    // if the form is in an iframe, the content script in that iframe handles detection.
    return false;
  },

  selectors: [
    // ── Identity ──
    ["#first_name", "first_name"],
    ["#last_name", "last_name"],
    ['input[name="job_application[first_name]"]', "first_name"],
    ['input[name="job_application[last_name]"]', "last_name"],
    ["#email", "email"],
    ['input[name="job_application[email]"]', "email"],
    ["#phone", "phone"],
    ['input[name="job_application[phone]"]', "phone"],

    // ── Location ──
    ["#job_application_location", "city"],
    ['input[name="job_application[location]"]', "city"],

    // ── Links ──
    ['[name="job_application[urls][LinkedIn]"]', "linkedin"],
    ['[name="job_application[urls][LinkedIn Profile]"]', "linkedin"],
    ['input[autocomplete="linkedin"]', "linkedin"],
    ['[name="job_application[urls][GitHub]"]', "github"],
    ['[name="job_application[urls][GitHub URL]"]', "github"],
    ['[name="job_application[urls][Portfolio]"]', "portfolio"],
    ['[name="job_application[urls][Portfolio URL]"]', "portfolio"],
    ['[name="job_application[urls][Website]"]', "portfolio"],
    ['[name="job_application[urls][Website URL]"]', "portfolio"],
    ['[name="job_application[urls][Other]"]', "portfolio"],

    // ── Cover letter ──
    ["#cover_letter", "cover_letter"],
    ['textarea[name="job_application[cover_letter]"]', "cover_letter"],

    // ── Employment ──
    ['input[name*="company_name"]', "current_company"],
    ['input[name*="title"]', "current_title"],
    ['input[name*="current_company"]', "current_company"],

    // ── Education (text inputs) ──
    ['input[name*="school_name"]', "school"],
    ['input[name*="degree"]', "degree"],
    ['input[name*="discipline"]', "field_of_study"],

    // ── Compensation ──
    ['input[name*="salary"]', "desired_salary"],
    ['input[name*="compensation"]', "desired_salary"],
  ],

  /**
   * Custom async fill for Greenhouse controls that aren't simple inputs:
   *  1. react-select dropdowns (rendered as div trees, not native <select>)
   *  2. native <select> fields for demographics / preferences
   *  3. text/textarea custom question fields matched by label keywords
   */
  fillCustom: async (profile, helpers) => {
    const {
      toLower,
      isInSection,
      monthName,
      genderToPronouns,
      setControlValue,
      fillSelectByText,
      fillGenderSelect,
    } = helpers;
    let filled = 0;

    // Normalize country: "US" / "USA" → "United States" for dropdown matching
    const normalizeCountry = (c) => {
      if (!c) return "United States";
      if (/^(us|usa)$/i.test(c.trim())) return "United States";
      return c;
    };
    const countryFull = normalizeCountry(profile.country);

    // ── 0. Phone country code dropdown ──
    // Greenhouse renders phone with a separate country code <select> next to the tel input
    const phoneInputs = document.querySelectorAll(
      '#phone, input[name="phone"], input[name="job_application[phone]"], input[type="tel"]'
    );
    for (const phoneInput of phoneInputs) {
      if (phoneInput.closest("#jaos-dev-panel")) continue;
      const phoneContainer =
        phoneInput.closest(".field, .form-field, [class*='phone']") ||
        phoneInput.parentElement?.parentElement;
      if (!phoneContainer) continue;

      // a) Native <select> for country code (common in Greenhouse embedded forms)
      const countryCodeSelect = phoneContainer.querySelector("select");
      if (countryCodeSelect && !countryCodeSelect.disabled) {
        const usOption = Array.from(countryCodeSelect.options).find(
          (o) =>
            /united states/i.test(o.textContent) ||
            /^us$/i.test(o.value) ||
            /\+1\b/.test(o.textContent) ||
            o.value === "US" ||
            o.value === "us"
        );
        if (usOption && countryCodeSelect.value !== usOption.value) {
          setControlValue(countryCodeSelect, usOption.value);
          filled++;
        }
      }

      // b) intl-tel-input library pattern (flag dropdown, not a <select>)
      const itiFlag = phoneContainer.querySelector(
        ".iti__selected-flag, [class*='flag-container'], [class*='country-selector']"
      );
      if (itiFlag) {
        itiFlag.click();
        await new Promise((r) => setTimeout(r, 300));
        const usList = document.querySelector(
          '.iti__country[data-country-code="us"], [data-dial-code="1"][data-country-code="us"]'
        );
        if (usList) {
          usList.click();
          filled++;
        } else {
          document.body.click(); // close dropdown
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      // c) React-select style phone country code
      const reactCountryCode = phoneContainer.querySelector(
        '[class*="-container"]:has([class*="__control"])'
      );
      if (reactCountryCode) {
        const ctrl = reactCountryCode.querySelector('[class*="__control"]');
        if (ctrl) {
          ctrl.click();
          await new Promise((r) => setTimeout(r, 300));
          const menu = reactCountryCode.querySelector('[class*="__menu"]');
          if (menu) {
            const opts = Array.from(menu.querySelectorAll('[class*="__option"]'));
            const usOpt =
              opts.find((o) => /united states.*\+1|us.*\+1|\+1.*us/i.test(o.textContent)) ||
              opts.find((o) => /united states/i.test(o.textContent));
            if (usOpt) {
              usOpt.click();
              filled++;
            } else {
              document.body.click();
            }
          }
          await new Promise((r) => setTimeout(r, 150));
        }
      }
    }

    // ── A. Native <select> fields ──
    const selects = document.querySelectorAll(
      "#grnhse_app select, #application_form select, .field select"
    );
    for (const sel of selects) {
      if (sel.disabled || sel.closest("#jaos-dev-panel")) continue;

      const labelEl =
        sel.closest(".field, .form-field")?.querySelector("label, legend") ||
        document.querySelector(`label[for="${sel.id}"]`);
      const labelText = toLower(labelEl?.textContent || sel.name || sel.id || "");
      if (!labelText) continue;

      let matched = false;
      if (/\b(gender|sex)\b/.test(labelText) && profile.gender) {
        matched = fillGenderSelect(sel, profile.gender);
      } else if (/\b(race|ethnic)\b/.test(labelText) && profile.race_ethnicity) {
        matched = fillSelectByText(sel, profile.race_ethnicity);
      } else if (/\b(hispanic|latino)\b/.test(labelText) && profile.race_ethnicity) {
        matched = fillSelectByText(sel, profile.race_ethnicity);
      } else if (/\b(veteran|military)\b/.test(labelText) && profile.veteran_status) {
        matched = fillSelectByText(sel, profile.veteran_status);
      } else if (/\b(disabilit)\b/.test(labelText) && profile.disability_status) {
        matched = fillSelectByText(sel, profile.disability_status);
      } else if (/\b(sponsor)\b/.test(labelText) && profile.requires_sponsorship) {
        matched = fillSelectByText(sel, profile.requires_sponsorship);
      } else if (/\b(work.?auth)\b/.test(labelText) && profile.work_authorization) {
        matched = fillSelectByText(sel, profile.work_authorization);
      } else if (/\b(relocat)\b/.test(labelText) && profile.willing_to_relocate) {
        matched = fillSelectByText(sel, profile.willing_to_relocate);
      } else if (/\b(pronoun)\b/.test(labelText) && profile.gender) {
        matched = fillSelectByText(sel, genderToPronouns(profile.gender));
      } else if (/\b(country)\b/.test(labelText)) {
        matched = fillSelectByText(sel, countryFull);
      } else if (/\b(state|province)\b/.test(labelText) && profile.state) {
        matched = fillSelectByText(sel, profile.state);
      } else if (/\b(over.?18|legal.?age)\b/.test(labelText) && profile.is_over_18) {
        matched = fillSelectByText(sel, profile.is_over_18);
      } else if (/\b(fluent.?in.?english|english.?proficien)\b/.test(labelText) && profile.fluent_in_english) {
        matched = fillSelectByText(sel, profile.fluent_in_english);
      } else if (/\b(referr|how.?did.?you.?(hear|find))\b/.test(labelText) && profile.referral_source) {
        matched = fillSelectByText(sel, profile.referral_source);
      } else if (/\b(degree)\b/.test(labelText) && profile.degree) {
        matched = fillSelectByText(sel, profile.degree);
      }

      if (matched) filled++;
    }

    // ── B. Text / textarea custom question fields ──
    const customFields = document.querySelectorAll(
      '.field input[type="text"]:not([id="first_name"]):not([id="last_name"]):not([id="email"]):not([id="phone"]), .field textarea:not([id="cover_letter"]), .field input[type="number"], .field input[type="tel"]'
    );
    for (const field of customFields) {
      if (field.disabled || field.value || field.closest("#jaos-dev-panel")) continue;

      const labelEl =
        field.closest(".field, .form-field")?.querySelector("label, legend") ||
        document.querySelector(`label[for="${field.id}"]`);
      const labelText = toLower(
        (labelEl?.textContent || "") + " " + (field.name || "") + " " + (field.placeholder || "")
      );
      if (!labelText.trim()) continue;

      let value = null;
      if (/\b(years?.?(of)?.?exp|experience.?years?)\b/.test(labelText)) value = profile.years_experience;
      else if (/\b(salary|compensation|pay)\b/.test(labelText)) value = profile.desired_salary;
      else if (/\b(notice.?period)\b/.test(labelText)) value = profile.notice_period;
      else if (/\b(gpa|grade)\b/.test(labelText)) value = profile.gpa;
      else if (/\b(current.?company|current.?employer|employer)\b/.test(labelText)) value = profile.current_company;
      else if (/\b(current.?title|job.?title|headline)\b/.test(labelText)) value = profile.current_title;
      else if (/\b(school|university|college|institution)\b/.test(labelText)) value = profile.school;
      else if (/\b(field.?of.?study|major|discipline)\b/.test(labelText)) value = profile.field_of_study;
      else if (/\b(city)\b/.test(labelText) && !field.value) value = profile.city;
      else if (/\b(state|province)\b/.test(labelText)) value = profile.state;
      else if (/\b(zip|postal)\b/.test(labelText)) value = profile.zip;
      else if (/\b(address)\b/.test(labelText)) value = profile.address;
      else if (/\b(start.?date|available.?to.?start|earliest.?start)\b/.test(labelText) && !/\b(month|year)\b/.test(labelText))
        value = profile.available_start_date;
      else if (/\b(summary|about|bio|objective)\b/.test(labelText) && !/\b(company|job)\b/.test(labelText))
        value = profile.summary;

      if (value) {
        if (setControlValue(field, String(value))) filled++;
      }
    }

    // ── C. React-select dropdowns ──
    const containers = document.querySelectorAll(
      '[class*="-container"]:has([class*="__control"])'
    );

    for (const container of containers) {
      if (container.closest("#jaos-dev-panel")) continue;

      const labelEl =
        container.closest("label") ||
        container
          .closest(".field, .form-field, [class*='field']")
          ?.querySelector("label, legend") ||
        container.previousElementSibling;
      const labelText = toLower(labelEl?.textContent || "");
      if (!labelText) continue;

      // Skip if already has a selected value
      const singleValue = container.querySelector('[class*="__single-value"]');
      if (singleValue && singleValue.textContent.trim()) continue;

      let value = null;
      if (/\b(school|university|college|institution)\b/.test(labelText))
        value = profile.school;
      else if (/\b(degree)\b/.test(labelText)) value = profile.degree;
      else if (/\b(discipline|field.?of.?study|major)\b/.test(labelText))
        value = profile.field_of_study;
      else if (/\b(country)\b/.test(labelText)) value = countryFull;
      else if (/\b(state|province)\b/.test(labelText)) value = profile.state;
      else if (/\b(gender|sex)\b/.test(labelText)) value = profile.gender;
      else if (/\b(hispanic|latino)\b/.test(labelText))
        value = profile.race_ethnicity;
      else if (/\b(race|ethnic)\b/.test(labelText))
        value = profile.race_ethnicity;
      else if (/\b(veteran|military)\b/.test(labelText))
        value = profile.veteran_status;
      else if (/\b(disabilit)\b/.test(labelText))
        value = profile.disability_status;
      else if (/\b(pronoun)\b/.test(labelText))
        value = genderToPronouns(profile.gender);
      else if (/\b(sponsor)\b/.test(labelText))
        value = profile.requires_sponsorship;
      else if (/\b(work.?auth)\b/.test(labelText))
        value = profile.work_authorization;
      else if (/\b(relocat)\b/.test(labelText))
        value = profile.willing_to_relocate;
      else if (/\b(over.?18|legal.?age)\b/.test(labelText))
        value = profile.is_over_18;
      else if (/\b(fluent.?in.?english)\b/.test(labelText))
        value = profile.fluent_in_english;
      else if (/\b(referr|how.?did.?you.?(hear|find))\b/.test(labelText))
        value = profile.referral_source;
      else if (/\b(start.?date.?month)\b/.test(labelText)) {
        value = isInSection(container, /education|school/i)
          ? monthName(profile.edu_start_month)
          : monthName(profile.exp_start_month);
      } else if (/\b(end.?date.?month)\b/.test(labelText)) {
        value = isInSection(container, /education|school/i)
          ? monthName(profile.edu_end_month)
          : monthName(profile.exp_end_month);
      } else if (/\b(start.?date.?year|start.?year)\b/.test(labelText)) {
        value = isInSection(container, /education|school/i)
          ? profile.edu_start_year
          : profile.exp_start_year;
      } else if (/\b(end.?date.?year|end.?year)\b/.test(labelText)) {
        value = isInSection(container, /education|school/i)
          ? profile.edu_end_year
          : profile.exp_end_year;
      }

      if (!value) continue;

      const control = container.querySelector('[class*="__control"]');
      if (!control) continue;

      control.click();

      // Wait for dropdown menu to appear (max ~2s)
      const menu = await new Promise((resolve) => {
        let attempts = 0;
        const check = setInterval(() => {
          const m = container.querySelector('[class*="__menu"]');
          if (m || ++attempts > 40) {
            clearInterval(check);
            resolve(m || null);
          }
        }, 50);
      });
      if (!menu) continue;

      const target = toLower(value);
      const options = Array.from(
        menu.querySelectorAll('[class*="__option"]')
      );
      const match =
        options.find((o) => toLower(o.textContent) === target) ||
        options.find((o) => toLower(o.textContent).includes(target));

      if (match) {
        match.click();
        filled++;
      } else {
        // Searchable select: type into the hidden input
        const input = container.querySelector(
          '[class*="__input"] input, input[id^="react-select"]'
        );
        if (input) {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          ).set;
          nativeSetter.call(input, value);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 300));
          const filtered = container.querySelectorAll(
            '[class*="__option"]'
          );
          if (filtered.length > 0) {
            filtered[0].click();
            filled++;
          }
        } else {
          document.body.click(); // close dropdown
        }
      }

      // Let React re-render between fills
      await new Promise((r) => setTimeout(r, 150));
    }

    return filled;
  },
});
