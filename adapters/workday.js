/**
 * Workday ATS Adapter — Dynamic Discovery Approach
 *
 * Instead of hardcoded selectors, this adapter:
 *  1. DISCOVERs fields by scanning [data-automation-id] elements
 *  2. CLASSIFIEs each field type (text, dropdown, searchable, date, etc.)
 *  3. MAPs labels to profile data via fuzzy matching tables
 *  4. FILLs using the correct interaction per field type
 *  5. HANDLEs multi-entry sections generically (work exp, education, etc.)
 *
 * Uses window.__jaosFiller for React-safe value setting.
 */
(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "workday",

  detect: () =>
    /\.wd\d+\.myworkdayjobs\.com$/i.test(location.hostname) ||
    /\.myworkdayjobs\.com$/i.test(location.hostname) ||
    /\.myworkdaysite\.com$/i.test(location.hostname) ||
    /\.workday\.com$/i.test(location.hostname) ||
    !!document.querySelector(
      '[data-automation-id="legalNameSection_firstName"], [data-automation-id="jobPostingHeader"]'
    ),

  selectors: [],

  fillCustom: async (profile, helpers) => {
    const F = window.__jaosFiller;
    const { toLower } = helpers;
    const wait = (ms) => F.delay(ms, ms);
    let filled = 0;
    const warnings = [];
    const unmatchedFields = [];
    const claimed = new Set();

    // ─── Mapping Tables ──────────────────────────────────────
    const PERSONAL_MAP = [
      [/firstName|first.?name/i, "first_name"],
      [/lastName|last.?name/i, "last_name"],
      [/middleName|middle.?name/i, "middle_name"],
      [/preferredName/i, "first_name"],
      [/\bemail\b/i, "email"],
      [/phone(?!Device)|phoneNumber/i, "phone"],
      [/addressLine1|address.?line.?1/i, "address"],
      [/addressLine2|address.?line.?2/i, "address_line2"],
      [/\bcity\b/i, "city"],
      [/postalCode|postal|zip/i, "zip"],
      [/countryRegion(?!Sub)|country(?!Phone)/i, "country"],
      [/countryRegionSub|(?<!\w)state(?!\w)|province/i, "state"],
      [/countryPhoneCode/i, "country"],
      [/phoneDeviceType/i, "__mobile"],
      [/linkedIn/i, "linkedin"],
      [/github/i, "github"],
      [/portfolio|websiteUrl|websiteQuestion/i, "portfolio"],
      [/salary|compensation|expectedSalary/i, "desired_salary"],
      [/jobTitle|currentTitle/i, "current_title"],
      [/company|employer|previousWorker/i, "current_company"],
      [/school|university/i, "school"],
      [/gpa|overall.?result|grade/i, "gpa"],
      [/years?.?(?:of)?.?exp/i, "years_experience"],
      [/notice.?period/i, "notice_period"],
      [/summary|about|bio|objective/i, "summary"],
      [/cover.?letter/i, "cover_letter"],
      [/referr|how.?did.?you/i, "referral_source"],
    ];

    const QUESTION_MAP = [
      [/\b(?:gender|sex)\b/i, "gender"],
      [/\b(?:race|ethnic)\b/i, "race_ethnicity"],
      [/\b(?:hispanic|latino)\b/i, "hispanic_latino"],
      [/\b(?:pronoun)\b/i, "pronouns"],
      [/\b(?:veteran|military)\b/i, "veteran_status"],
      [/\bdisabilit/i, "disability_status"],
      [/\bsponsor/i, "requires_sponsorship"],
      [/\bwork.?auth|authorized.?to.?work/i, "work_authorization"],
      [/\brelocat/i, "willing_to_relocate"],
      [/\b(?:over.?18|legal.?age)\b/i, "is_over_18"],
      [/\bnon.?compete|non.?solicitation/i, "__no"],
      [/\buse.+workday\b|work.+on.+workday/i, "__no"],
      [/\bgovernment.?employee|employee.+(?:united\s*states|u\.?s\.?).+government/i, "__no"],
      [/\bexport.?control|(?:iran|cuba|north\s*korea|sanctions)/i, "__no"],
      [/\brelated.+(?:workday|current).+employee/i, "__no"],
      [/\brelated.+(?:customer|government\s*official)/i, "__no"],
      [/\bconvicted|felony|criminal/i, "__no"],
      [/\bpreviously.?applied|applied.?before/i, "__no"],
      [/\bcontracting.+responsibilit|contracting.+government/i, "__no"],
    ];

    // ─── Label Extraction ────────────────────────────────────
    const getLabel = (c) => {
      if (!c) return "";
      const el = c.querySelector(
        'label, [data-automation-id="formLabel"], legend, h3, h4, h5'
      );
      if (el) return toLower(el.textContent || "");
      return toLower(c.getAttribute("aria-label") || "");
    };

    const getFieldSig = (el) => {
      const c = el.closest("[data-automation-id]") || el.parentElement;
      const aid = c?.getAttribute("data-automation-id") || "";
      return toLower(aid + " " + getLabel(c));
    };

    const resolveValue = (sig, map) => {
      for (const [re, key] of map) {
        if (!re.test(sig)) continue;
        if (key === "__mobile") return "Mobile";
        if (key === "__no") return "No";
        if (key === "__yes") return "Yes";
        return profile?.[key] || null;
      }
      return null;
    };

    // ─── Workday Fill Helpers ────────────────────────────────

    /** Simulate a real user click with full event sequence for React. */
    const realClick = (el) => {
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      el.click();
    };

    /** Click a button to open a dropdown, find matching option, click it. */
    const fillButtonDropdown = async (btn, value) => {
      if (!value) return false;
      realClick(btn);
      await wait(500);

      const options = Array.from(
        document.querySelectorAll(
          'li[role="option"], [role="option"], [data-automation-id="promptOption"]'
        )
      ).filter((o) => o.offsetParent !== null);

      if (!options.length) { document.body.click(); await wait(100); return false; }

      const t = toLower(value);
      const match =
        options.find((o) => toLower(o.textContent?.trim()) === t) ||
        options.find((o) => toLower(o.textContent?.trim()).includes(t)) ||
        options.find((o) => t.includes(toLower(o.textContent?.trim())));

      if (match) {
        realClick(match);
        await wait(300);
        // Blur the button to trigger Workday validation
        btn.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        btn.dispatchEvent(new Event("change", { bubbles: true }));
        await wait(100);
        return true;
      }
      document.body.click();
      await wait(100);
      return false;
    };

    /** Searchable list (School, Field of Study): type → wait for server → click match. */
    const fillSearchableList = async (scope, fieldAid, value) => {
      if (!value) return false;
      const fc = scope.querySelector(`[data-automation-id="${fieldAid}"]`);
      if (!fc) return false;

      const input =
        fc.querySelector('[data-automation-id="multiselectInputContainer"] input') ||
        fc.querySelector('input:not([type="hidden"]):not([type="checkbox"])');
      if (!input || claimed.has(input) || input.disabled) return false;

      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!nativeSetter) return false;

      input.focus();
      input.click();
      input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      await wait(200);

      // Try full value, then longest individual words
      const terms = [value];
      value.split(/\s+/).filter((w) => w.length >= 3)
        .sort((a, b) => b.length - a.length)
        .forEach((w) => { if (w.toLowerCase() !== value.toLowerCase()) terms.push(w); });

      for (const term of terms) {
        nativeSetter.call(input, term);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        // Press Enter to trigger Workday's server-side search
        const enterEvt = { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 };
        input.dispatchEvent(new KeyboardEvent("keydown", enterEvt));
        input.dispatchEvent(new KeyboardEvent("keypress", enterEvt));
        input.dispatchEvent(new KeyboardEvent("keyup", enterEvt));
        await wait(2000); // Wait for server results

        const opts = Array.from(
          document.querySelectorAll(
            '[data-automation-id="menuItem"][role="option"], [data-automation-id="promptOption"]'
          )
        ).filter((o) => o.offsetParent !== null && !/^no\s*items?\.?$/i.test(o.textContent?.trim()));
        if (!opts.length) continue;

        const t = toLower(value);
        const match =
          opts.find((o) => toLower(o.textContent?.trim()) === t) ||
          opts.find((o) => toLower(o.textContent?.trim()).includes(toLower(term))) ||
          opts.find((o) => toLower(term).includes(toLower(o.textContent?.trim()))) ||
          opts[0];

        match.click();
        claimed.add(input);
        await wait(400);
        return true;
      }

      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      document.body.click();
      await wait(100);
      return false;
    };

    /** Fill a native <select> or button-dropdown within scope matching labelPattern. */
    const fillScopedSelect = async (scope, labelPattern, value) => {
      if (!value) return false;

      for (const sel of scope.querySelectorAll("select")) {
        if (sel.disabled) continue;
        if (!labelPattern.test(getFieldSig(sel))) continue;
        if (F.fillSelect(sel, String(value))) return true;
      }

      for (const btn of scope.querySelectorAll("button")) {
        const aria = toLower(btn.getAttribute("aria-label") || "");
        const parentAid = btn.closest("[data-automation-id]")?.getAttribute("data-automation-id") || "";
        if (!labelPattern.test(aria) && !labelPattern.test(parentAid)) continue;
        if (await fillButtonDropdown(btn, value)) return true;
      }

      return false;
    };

    // ─── Section Management ──────────────────────────────────
    const HEADING_SEL =
      'h2, h3, h4, legend, b, strong, ' +
      '[data-automation-id*="label"], [data-automation-id*="Label"], ' +
      '[data-automation-id*="sectionHeader"]';

    const findSectionButton = (headingPattern, entryIndex) => {
      for (const el of document.querySelectorAll(HEADING_SEL)) {
        if (!headingPattern.test(el.textContent || "")) continue;
        let ancestor = el.parentElement;
        for (let d = 0; d < 8 && ancestor; d++) {
          const buttons = Array.from(ancestor.querySelectorAll("button"));
          const btn =
            entryIndex === 0
              ? buttons.find((b) => /^\s*add\s*$/i.test(b.textContent?.trim()))
              : buttons.find((b) => /add\s*another/i.test(b.textContent?.trim()));
          const found =
            btn || buttons.find((b) => /^\s*add(\s*another)?\s*$/i.test(b.textContent?.trim()));
          if (found) return { button: found, container: ancestor };
          ancestor = ancestor.parentElement;
        }
      }
      return null;
    };

    const clearSectionEntries = async (pattern) => {
      for (const el of document.querySelectorAll(HEADING_SEL)) {
        if (!pattern.test(el.textContent || "")) continue;
        let ancestor = el.parentElement;
        for (let d = 0; d < 8 && ancestor; d++) {
          const delBtns = Array.from(ancestor.querySelectorAll("button")).filter(
            (b) => /^\s*delete\s*$/i.test(b.textContent?.trim())
          );
          if (!delBtns.length) { ancestor = ancestor.parentElement; continue; }
          for (let i = delBtns.length - 1; i >= 0; i--) {
            delBtns[i].click();
            await wait(600);
            const confirm = document.querySelector(
              'button[data-automation-id="confirmDeleteButton"], ' +
              'button[data-automation-id="deleteConfirm"], ' +
              '[role="dialog"] button:not([data-automation-id*="cancel"])'
            );
            if (confirm && /yes|ok|confirm|delete/i.test(confirm.textContent || "")) {
              confirm.click();
              await wait(400);
            }
          }
          return;
        }
      }
    };

    /** Check if a section heading matching the pattern is visible on the current page. */
    const isSectionVisible = (headingPattern) => {
      for (const el of document.querySelectorAll(HEADING_SEL)) {
        if (!headingPattern.test(el.textContent || "")) continue;
        if (el.offsetParent !== null || getComputedStyle(el).display !== "none") return true;
      }
      return false;
    };

    /** Generic multi-entry handler: add → fill per entry. */
    const handleMultiEntry = async (headingPattern, entries, fillEntry) => {
      if (!entries.length) return;
      for (let i = 0; i < entries.length; i++) {
        const section = findSectionButton(headingPattern, i);
        if (!section) {
          warnings.push({ field: headingPattern.source, message: `No Add button for entry ${i + 1}` });
          break;
        }
        section.button.click();
        await wait(1000);
        filled += await fillEntry(section.container, entries[i], i);
        await wait(400);
      }
    };

    // ─── Utilities ────────────────────────────────────────────

    /** Fill text fields in scope using a [regex, value] map. Only fills empty, unclaimed inputs. */
    const fillTextFields = (scope, fieldMap) => {
      let count = 0;
      const inputs = scope.querySelectorAll(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea'
      );
      for (const el of inputs) {
        if (claimed.has(el) || el.value || el.disabled || el.readOnly) continue;
        if (el.closest("#jaos-dev-panel")) continue;
        const sig = getFieldSig(el);
        for (const [re, val] of fieldMap) {
          if (val && re.test(sig) && F.setValue(el, String(val))) {
            claimed.add(el);
            count++;
            break;
          }
        }
      }
      return count;
    };

    const parseDateParts = (val) => {
      if (!val) return { year: "", month: "" };
      const s = String(val);
      if (s.includes("-")) { const [y, m] = s.split("-"); return { year: y, month: m }; }
      return { year: s, month: "" };
    };

    const normalizeDegree = (raw) => {
      if (!raw) return [];
      const cands = [raw.trim()];
      const stripped = raw.replace(/,\s*.+$/, "").trim();
      if (stripped !== raw.trim()) cands.push(stripped);
      const dl = raw.toLowerCase();
      if (/ph\.?d|doctor.*philosophy/i.test(dl)) cands.push("PhD");
      else if (/executive\s*mba/i.test(dl)) cands.push("Executive MBA", "MBA");
      else if (/m\.?b\.?a/i.test(dl)) cands.push("MBA");
      else if (/j\.?d\.?\b|juris/i.test(dl)) cands.push("J.D.");
      else if (/m\.?d\.?\b(?!.*master)|doctor.*medicine/i.test(dl)) cands.push("M.D.");
      else if (/m\.?div|divinity/i.test(dl)) cands.push("MDiv");
      else if (/master|m\.\s*[a-z]/i.test(dl)) {
        if (/science|m\.?s|m\.?sc/i.test(dl)) cands.push("M.S.", "MSc");
        if (/arts|m\.?a\.?\b/i.test(dl)) cands.push("M.A.");
        if (/engineer|m\.?eng/i.test(dl)) cands.push("M.Eng");
        if (cands.length <= 2) cands.push("M.S.", "M.A.");
      } else if (/bachelor|b\.\s*[a-z]/i.test(dl)) {
        if (/science|b\.?s|b\.?sc/i.test(dl)) cands.push("B.S.", "BSc");
        if (/arts|b\.?a\.?\b/i.test(dl)) cands.push("B.A.");
        if (/engineer|b\.?eng/i.test(dl)) cands.push("B.Eng");
        if (cands.length <= 2) cands.push("B.S.", "B.A.");
      } else if (/associate/i.test(dl)) cands.push("Associate");
      else if (/high.?school/i.test(dl)) cands.push("High School");
      else if (/\bged\b/i.test(dl)) cands.push("GED");
      else if (/diploma|dcs/i.test(dl)) cands.push("Diploma of College Studies (DCS)");
      else if (/vocation/i.test(dl)) cands.push("Vocational");
      else if (/trade\s*school/i.test(dl)) cands.push("Trade School");
      return [...new Set(cands)];
    };

    const dedupeEducation = (entries) => {
      const seen = new Map();
      for (const e of entries) {
        const key = toLower(e.institution || e.school || "") + "|" + (e.start_year || "") + "|" + (e.end_year || "");
        if (!key || key === "||") { seen.set(Math.random().toString(), e); continue; }
        const existing = seen.get(key);
        if (existing) {
          const eLen = (existing.degree || "").length + (existing.field_of_study || "").length;
          if ((e.degree || "").length + (e.field_of_study || "").length > eLen) seen.set(key, e);
        } else seen.set(key, e);
      }
      return [...seen.values()];
    };

    // ═══════════════════════════════════════════════════════════
    // EXECUTION
    // ═══════════════════════════════════════════════════════════

    console.log("[JAOS] Workday dynamic fill. Profile:", {
      experience: profile.experience_entries?.length ?? "N/A",
      education: profile.education_entries?.length ?? "N/A",
      languages: profile.language_entries?.length ?? "N/A",
    });

    // ── Step 1: Discover & fill flat fields (personal info) ──
    // Scan all inputs/textareas, resolve via PERSONAL_MAP
    const personalFieldMap = PERSONAL_MAP.map(([re, key]) => [
      re,
      key === "__mobile" ? "Mobile" : profile?.[key] || "",
    ]).filter(([, val]) => val);
    filled += fillTextFields(document, personalFieldMap);

    // Native <select> fields
    for (const sel of document.querySelectorAll("[data-automation-id] select")) {
      if (sel.disabled || sel.closest("#jaos-dev-panel") || claimed.has(sel)) continue;
      const sig = getFieldSig(sel);
      const val = resolveValue(sig, [...PERSONAL_MAP, ...QUESTION_MAP]);
      if (val && F.fillSelect(sel, String(val))) { claimed.add(sel); filled++; }
    }

    // Button-based dropdowns (country, state, phone type, etc.)
    const DROPDOWN_MAP = [
      ["addressSection_countryRegion", profile?.country],
      ["addressSection_countryRegionSubdivision", profile?.state],
      ["countryRegion", profile?.country],
      ["state", profile?.state],
      ["degree", profile?.degree],
      ["fieldOfStudy", profile?.field_of_study],
      ["phoneDeviceType", "Mobile"],
      ["countryPhoneCode", profile?.country],
    ];
    for (const [aid, val] of DROPDOWN_MAP) {
      if (!val) continue;
      const c = document.querySelector(`[data-automation-id="${aid}"]`);
      if (!c) continue;
      const btn = c.querySelector(
        'button[aria-haspopup], button, input[role="combobox"], input'
      );
      if (btn && await fillButtonDropdown(btn, String(val))) { filled++; await wait(300); }
    }

    // ── Step 2: Work Experience ──────────────────────────────
    const workEntries = (profile?.experience_entries || []).filter(
      (e) => e && (e.title || e.role || e.company)
    );
    if (isSectionVisible(/work\s*experience/i))
    await handleMultiEntry(/work\s*experience/i, workEntries, async (scope, entry, idx) => {
      let count = 0;
      const isCurrent = Boolean(entry.is_current) || /present|current/i.test(entry.end_date || "");

      count += fillTextFields(scope, [
        [/job.?title|position/i, entry.title || entry.role || ""],
        [/\bcompany\b|employer|organization/i, entry.company || ""],
        [/role.?desc|description|responsib|duties/i, entry.description || entry.role_description || ""],
        [/\blocation\b/i, entry.location || ""],
      ]);

      // "I currently work here" checkbox (entry 0 only)
      if (idx === 0 && isCurrent) {
        for (const cb of scope.querySelectorAll('input[type="checkbox"]')) {
          if (cb.checked || cb.disabled) continue;
          const lbl = toLower((cb.closest("[data-automation-id]") || cb.parentElement)?.textContent || "");
          if (/currently\s*work|i\s*currently/i.test(lbl)) { cb.click(); await wait(300); count++; break; }
        }
      }

      // Date fields: first month/year pair = From, second = To
      const months = [...scope.querySelectorAll('[data-automation-id="dateSectionMonth-input"]')].filter((i) => !claimed.has(i));
      const years = [...scope.querySelectorAll('[data-automation-id="dateSectionYear-input"]')].filter((i) => !claimed.has(i));

      if (entry.start_date && months[0] && years[0]) {
        const [sy, sm] = entry.start_date.split("-");
        if (F.setValue(months[0], sm || "")) { claimed.add(months[0]); count++; }
        if (F.setValue(years[0], sy || "")) { claimed.add(years[0]); count++; }
      }
      if (entry.end_date && !isCurrent && months[1] && years[1]) {
        const [ey, em] = entry.end_date.split("-");
        if (F.setValue(months[1], em || "")) { claimed.add(months[1]); count++; }
        if (F.setValue(years[1], ey || "")) { claimed.add(years[1]); count++; }
      }
      return count;
    });

    // ── Step 3: Education ────────────────────────────────────
    const rawEdu = (profile?.education_entries || []).filter(
      (e) => e && (e.institution || e.school || e.degree)
    );
    const eduEntries = dedupeEducation(rawEdu);
    if (isSectionVisible(/\beducation\b/i))
    await handleMultiEntry(/\beducation\b/i, eduEntries, async (scope, entry) => {
      let count = 0;

      // School — searchable list
      const school = entry.institution || entry.school || "";
      if (school) {
        if (await fillSearchableList(scope, "formField-school", school)) count++;
        else warnings.push({ field: "School", message: `"${school}" not found — select manually`, type: "manual_action" });
        await wait(300);
      }

      // Degree — button dropdown with normalization
      if (entry.degree) {
        let ok = false;
        for (const c of normalizeDegree(entry.degree)) {
          if (await fillScopedSelect(scope, /degree/i, c)) { count++; ok = true; break; }
        }
        if (!ok) warnings.push({ field: "Degree", message: `"${entry.degree}" not matched`, type: "manual_action" });
        await wait(300);
      }

      // Field of Study — searchable list
      if (entry.field_of_study) {
        if (await fillSearchableList(scope, "formField-fieldOfStudy", entry.field_of_study)) count++;
        else warnings.push({ field: "Field of Study", message: `"${entry.field_of_study}" not found`, type: "manual_action" });
        await wait(300);
      }

      // GPA — text input
      count += fillTextFields(scope, [[/gpa|overall.?result|grade/i, entry.gpa || ""]]);

      // Dates (year-only or year+month)
      const yrs = [...scope.querySelectorAll('[data-automation-id="dateSectionYear-input"]')].filter((i) => !claimed.has(i));
      const mos = [...scope.querySelectorAll('[data-automation-id="dateSectionMonth-input"]')].filter((i) => !claimed.has(i));
      const start = parseDateParts(entry.start_year || entry.start_date);
      const end = parseDateParts(entry.end_year || entry.end_date);
      if (start.year && yrs[0] && F.setValue(yrs[0], start.year)) { claimed.add(yrs[0]); count++; }
      if (start.month && mos[0] && F.setValue(mos[0], start.month)) { claimed.add(mos[0]); count++; }
      if (end.year && yrs[1] && F.setValue(yrs[1], end.year)) { claimed.add(yrs[1]); count++; }
      if (end.month && mos[1] && F.setValue(mos[1], end.month)) { claimed.add(mos[1]); count++; }
      return count;
    });

    // ── Step 4: Languages ────────────────────────────────────
    const langEntries = (profile?.language_entries || []).filter((e) => e && e.language);
    const profToLevel = (p) => {
      const s = toLower(p || "");
      if (/native|fluent|advanced/.test(s)) return "Advanced";
      if (/intermediate/.test(s)) return "Intermediate";
      if (/basic|beginner|elementary/.test(s)) return "Beginner";
      return p || "";
    };
    if (isSectionVisible(/\blanguage/i))
    await handleMultiEntry(/\blanguage/i, langEntries, async (scope, entry) => {
      let count = 0;
      if (entry.language && await fillScopedSelect(scope, /\blanguage\b/i, entry.language)) { count++; await wait(300); }
      if (/native|fluent/i.test(entry.proficiency || "")) {
        for (const cb of scope.querySelectorAll('input[type="checkbox"]')) {
          if (cb.checked || cb.disabled) continue;
          if (/fluent/i.test(toLower((cb.closest("[data-automation-id]") || cb.parentElement)?.textContent || ""))) {
            cb.click(); await wait(200); count++; break;
          }
        }
      }
      const level = profToLevel(entry.proficiency);
      if (level) {
        for (const skill of [/\breading\b/i, /\bspeaking\b/i, /\bwriting\b/i]) {
          if (await fillScopedSelect(scope, skill, level)) count++;
          await wait(200);
        }
      }
      return count;
    });

    // ── Step 5: Websites ─────────────────────────────────────
    const websiteUrls = [profile?.linkedin, profile?.github, profile?.portfolio].filter(Boolean);
    if (isSectionVisible(/\bwebsite/i))
    await handleMultiEntry(
      /\bwebsite/i,
      websiteUrls.map((url) => ({ url })),
      async (scope, entry) => fillTextFields(scope, [[/url|website|link/i, entry.url]])
    );

    // ── Step 6: Question sections (radio groups) ─────────────
    for (const group of document.querySelectorAll(
      '[role="radiogroup"], [data-automation-id]:has(input[type="radio"])'
    )) {
      if (group.closest("#jaos-dev-panel")) continue;
      const label = getLabel(group);
      if (!label) continue;
      const val = resolveValue(label, QUESTION_MAP);
      if (!val) continue;
      const t = toLower(val);
      for (const radio of group.querySelectorAll('input[type="radio"]')) {
        const rl = toLower(
          radio.closest("label")?.textContent ||
          document.querySelector(`label[for="${radio.id}"]`)?.textContent ||
          radio.value || ""
        );
        if (rl.includes(t) || t.includes(rl)) {
          if (!radio.checked) { radio.click(); await wait(100); filled++; }
          break;
        }
      }
    }

    // ── Step 6b: Question sections (button-dropdown) ─────────
    // Workday renders many questions as button[aria-haspopup="listbox"]
    // instead of radio groups. Scan all unclaimed button-dropdowns.
    for (const wrapper of document.querySelectorAll('[data-automation-id*="formField"]')) {
      if (wrapper.closest("#jaos-dev-panel")) continue;
      const btn = wrapper.querySelector('button[aria-haspopup="listbox"]');
      if (!btn || claimed.has(btn)) continue;
      // Skip if already has a value selected (not "Select One")
      const btnText = toLower(btn.textContent?.trim() || "");
      if (btnText && !/select\s*one|select|choose|--/i.test(btnText)) continue;

      const label = getLabel(wrapper);
      if (!label) continue;
      const val = resolveValue(label, QUESTION_MAP);
      if (!val) continue;

      if (await fillButtonDropdown(btn, val)) { claimed.add(btn); filled++; await wait(300); }
    }

    // ── Step 6c: Acknowledgment dropdowns ─────────────────────
    // Some Workday forms have "Please enter 'yes' if you acknowledge" with a
    // button-dropdown instead of a text input. Match by surrounding paragraph text.
    for (const wrapper of document.querySelectorAll('[data-automation-id*="formField"]')) {
      if (wrapper.closest("#jaos-dev-panel")) continue;
      const btn = wrapper.querySelector('button[aria-haspopup="listbox"]');
      if (!btn || claimed.has(btn)) continue;
      const fullText = toLower(wrapper.textContent || "");
      if (
        /acknowledge|certif|agree|consent/i.test(fullText) &&
        /enter.+yes|type.+yes|please.+yes|if you acknowledge/i.test(fullText)
      ) {
        if (await fillButtonDropdown(btn, "Yes")) { claimed.add(btn); filled++; await wait(300); }
      }
    }

    // ── Step 7: Agreement checkboxes ─────────────────────────
    for (const cb of document.querySelectorAll('[data-automation-id] input[type="checkbox"]')) {
      if (cb.disabled || cb.checked || cb.closest("#jaos-dev-panel") || claimed.has(cb)) continue;
      const lbl = getLabel(cb.closest("[data-automation-id]") || cb.parentElement);
      if (/agree|acknowledge|certif|consent/i.test(lbl)) { cb.click(); await wait(100); filled++; }
    }

    // ── Step 7b: Text-based acknowledgments ──────────────────
    // Some Workday forms have "Please enter 'yes' if you acknowledge" text inputs.
    for (const el of document.querySelectorAll(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea'
    )) {
      if (claimed.has(el) || el.value || el.disabled || el.readOnly) continue;
      if (el.closest("#jaos-dev-panel")) continue;
      const sig = getFieldSig(el);
      const wrapper = el.closest("[data-automation-id]") || el.parentElement;
      const fullText = toLower(wrapper?.textContent || "");
      if (
        (/acknowledge|certif|agree|consent/i.test(sig) || /acknowledge|certif|agree|consent/i.test(fullText)) &&
        /enter.+yes|type.+yes|please.+yes/i.test(fullText)
      ) {
        if (F.setValue(el, "yes")) { claimed.add(el); filled++; await wait(100); }
      }
    }

    // ── Step 8: Collect unmatched empty fields for V2 ────────
    document.querySelectorAll("[data-automation-id]").forEach((c) => {
      if (c.closest("#jaos-dev-panel")) return;
      const el = c.querySelector(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea, select'
      );
      if (!el || el.disabled || el.value || claimed.has(el)) return;
      const label = getLabel(c);
      const aid = c.getAttribute("data-automation-id") || "";
      if (label || aid) unmatchedFields.push({ label, aid });
    });

    console.log("[JAOS] Workday dynamic fill complete:", {
      filled,
      warnings: warnings.length,
      unmatchedFields: unmatchedFields.length,
    });
    return { filled, warnings, unmatchedFields };
  },
});
