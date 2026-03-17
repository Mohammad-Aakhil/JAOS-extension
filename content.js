(() => {
  const PANEL_ID = "jaos-dev-panel";
  const PANEL_HEADER_ID = "jaos-dev-panel-header";
  const PANEL_BODY_ID = "jaos-dev-panel-body";
  const LAUNCHER_WRAP_ID = "jaos-floating-launcher-wrap";
  const LAUNCHER_ID = "jaos-floating-launcher";
  const UNPIN_ID = "jaos-floating-unpin";
  const LAUNCHER_DOCK_TOP = "50%";
  const JAOS_FRONTEND_URL = "http://localhost:3000";
  const JAOS_APP_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  const AUTO_OPEN_FLAG_KEY = "jaos_auto_open_panel_next_page";
  const AUTO_OPEN_TTL_MS = 2 * 60 * 1000;
  const DEFAULT_JOB_TITLE = "Detected Job";
  const DEFAULT_COMPANY_NAME = "Current Site";
  const AUTOFILL_FIELD_SELECTOR =
    'input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="checkbox"], select, textarea';
  const ACTIVE_JOB_SESSION_KEY = "jaos_active_job_session";
  const ACTIVE_JOB_SESSION_TTL_MS = 30 * 60 * 1000;

  const isTopFrame = window === window.top;

  if (window.__jaosPanelControllerInitialized) {
    return;
  }
  window.__jaosPanelControllerInitialized = true;

  /**
   * Safe wrapper around chrome.runtime.sendMessage.
   * Catches "Extension context invalidated" errors that occur when the
   * extension is reloaded but the old content script is still in the page.
   */
  const safeSendMessage = (message, callback) => {
    try {
      if (!chrome.runtime?.id) {
        callback?.({ ok: false, error: "Extension context invalidated" });
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          callback?.({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        callback?.(response);
      });
    } catch (_err) {
      callback?.({ ok: false, error: "Extension context invalidated" });
    }
  };

  let panel = null;
  let panelBody = null;
  let launcherWrap = null;
  let isOpen = false;
  let isPinned = true;
  let applyClickListenerBound = false;
  const applyReplayBypass = new WeakSet();
  let selectedJobContextSource = "default";
  let selectedJobContext = {
    title: DEFAULT_JOB_TITLE,
    company: DEFAULT_COMPANY_NAME,
    jobId: "",
  };
  let selectedResumeData = null;

  const getMountTarget = () => document.body || document.documentElement;

  const getNormalizedPathname = () =>
    (window.location.pathname || "/").replace(/\/+$/, "") || "/";

  const isJaosAppOrigin = () => JAOS_APP_ORIGINS.has(window.location.origin);

  const isJaosJobsListPage = () =>
    isJaosAppOrigin() && getNormalizedPathname() === "/jobs";

  const isJaosJobDetailPage = () =>
    isJaosAppOrigin() && /^\/jobs\/[^/]+$/.test(getNormalizedPathname());

  const storageSet = (data) =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.set(data, () => resolve());
      } catch (_error) {
        resolve();
      }
    });

  const storageGet = (key) =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (result) => resolve(result || {}));
      } catch (_error) {
        resolve({});
      }
    });

  const storageRemove = (key) =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.remove(key, () => resolve());
      } catch (_error) {
        resolve();
      }
    });

  const getNeutralCompanyName = () => window.location.hostname || DEFAULT_COMPANY_NAME;

  const storeActiveJobSession = async (jobContext) => {
    const normalized = normalizeJobContext(jobContext);
    if (!normalized.jobId) return;
    await storageSet({
      [ACTIVE_JOB_SESSION_KEY]: {
        jobId: normalized.jobId,
        title: normalized.title,
        company: normalized.company,
        expiresAt: Date.now() + ACTIVE_JOB_SESSION_TTL_MS,
      },
    });
  };

  const readActiveJobSession = async () => {
    const result = await storageGet(ACTIVE_JOB_SESSION_KEY);
    const session = result?.[ACTIVE_JOB_SESSION_KEY];
    if (!session || typeof session !== "object") return null;
    if (!session.expiresAt || session.expiresAt < Date.now()) {
      await storageRemove(ACTIVE_JOB_SESSION_KEY);
      return null;
    }
    return normalizeJobContext({
      title: session.title,
      company: session.company,
      jobId: session.jobId,
    });
  };

  const extractJobIdFromHref = (href) => {
    if (!href || typeof href !== "string") return "";
    const match = href.match(/\/jobs\/([^/?#]+)/);
    return match ? match[1] : "";
  };

  const normalizeJobContext = (job) => ({
    title:
      typeof job?.title === "string" && job.title.trim()
        ? job.title.trim()
        : DEFAULT_JOB_TITLE,
    company:
      typeof job?.company === "string" && job.company.trim()
        ? job.company.trim()
        : getNeutralCompanyName(),
    jobId: typeof job?.jobId === "string" ? job.jobId : "",
  });

  const setSelectedJobContext = (jobContext, source = "default") => {
    selectedJobContext = normalizeJobContext(jobContext);
    selectedJobContextSource = source;
  };

  const BULLET_SEPARATOR_REGEX = /\s*(?:\u2022|\u00b7|\u00e2\u20ac\u00a2)\s*/;

  const hasTimeAgoPattern = (text) => /^\d+\s*(m|h|d|w|mo|y)\s+ago$/i.test(text);

  const cleanText = (value) => (value || "").replace(/\s+/g, " ").trim();

  const toLower = (value) => cleanText(value).toLowerCase();

  const escapeCssSelector = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return value.replace(/(["\\#.;:[\],+*~'>=|^$(){}!?])/g, "\\$1");
  };

  const getFieldLabelText = (field) => {
    const labelParts = [];

    if (field.id) {
      const forLabels = document.querySelectorAll(`label[for="${escapeCssSelector(field.id)}"]`);
      forLabels.forEach((label) => {
        const text = cleanText(label.textContent);
        if (text) {
          labelParts.push(text);
        }
      });
    }

    const wrappedLabel = field.closest("label");
    if (wrappedLabel) {
      const text = cleanText(wrappedLabel.textContent);
      if (text) {
        labelParts.push(text);
      }
    }

    const labelledBy = field.getAttribute("aria-labelledby");
    if (labelledBy) {
      labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .forEach((labelNode) => {
          const text = cleanText(labelNode.textContent);
          if (text) {
            labelParts.push(text);
          }
        });
    }

    return cleanText(labelParts.join(" "));
  };

  const buildFieldKeywordText = (field) =>
    toLower(
      [
        field.getAttribute("name"),
        field.getAttribute("id"),
        field.getAttribute("placeholder"),
        field.getAttribute("aria-label"),
        getFieldLabelText(field),
      ]
        .filter(Boolean)
        .join(" ")
    );

  const setControlValue = (field, value) => {
    if (typeof value !== "string") {
      return false;
    }
    // File inputs can only be set to empty string programmatically
    if (field instanceof HTMLInputElement && field.type === "file") {
      return false;
    }

    const prototype = Object.getPrototypeOf(field);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    const previous = field.value;

    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(field, value);
    } else {
      field.value = value;
    }

    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return previous !== value;
  };

  const fillGenderSelect = (field, genderValue) => {
    const target = toLower(genderValue || "male");
    const options = Array.from(field.options || []);
    const matched = options.find((option) => {
      const optionValue = toLower(option.value);
      const optionText = toLower(option.textContent);
      return optionValue === target || optionText === target || optionValue.includes(target) || optionText.includes(target);
    });

    if (!matched) {
      return false;
    }

    return setControlValue(field, matched.value);
  };

  const fillSelectByText = (field, value) => {
    if (!value || !(field instanceof HTMLSelectElement)) return false;
    const target = toLower(value);
    const options = Array.from(field.options || []);
    const matched =
      options.find((o) => toLower(o.value) === target || toLower(o.textContent) === target) ||
      options.find((o) => toLower(o.value).includes(target) || toLower(o.textContent).includes(target));
    if (!matched) return false;
    return setControlValue(field, matched.value);
  };

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const monthName = (m) => {
    const idx = parseInt(m, 10);
    return idx >= 1 && idx <= 12 ? MONTH_NAMES[idx - 1] : m || "";
  };

  const genderToPronouns = (gender) => {
    const g = toLower(gender || "");
    if (/\b(male|man)\b/.test(g)) return "He/Him";
    if (/\b(female|woman)\b/.test(g)) return "She/Her";
    if (/\b(non.?binary)\b/.test(g)) return "They/Them";
    return gender || "";
  };

  const isInSection = (field, sectionRegex) => {
    let el = field;
    for (let i = 0; i < 10 && el; i++) {
      el = el.parentElement;
      if (!el) break;
      const heading = el.querySelector("h2, h3, h4, legend, .section-title");
      if (heading && sectionRegex.test(heading.textContent)) return true;
    }
    return false;
  };

  // ATS adapters loaded from separate files via window.__jaosAtsAdapters registry
  // Read dynamically each time to handle adapters loaded after content.js
  const getAtsAdapters = () => window.__jaosAtsAdapters || [];

  const detectAtsPlatform = () => {
    const adapters = getAtsAdapters();
    if (adapters.length === 0) {
      console.log("[JAOS] detectAtsPlatform: no adapters registered in window.__jaosAtsAdapters");
    }
    for (const adapter of adapters) {
      try {
        if (adapter.detect()) return adapter;
      } catch (e) {
        console.log(`[JAOS] detectAtsPlatform: ${adapter.name} detect() threw:`, e.message);
        continue;
      }
    }
    return null;
  };

  const runAtsSelectorFill = (adapter, profile) => {
    let filled = 0;
    const filledElements = new Set();

    for (const [selector, profileKey] of adapter.selectors) {
      const value = profile[profileKey];
      if (!value) continue;

      const el = document.querySelector(selector);
      if (!el || filledElements.has(el)) continue;
      if (el.disabled || el.readOnly) continue;
      if (el.closest(`#${PANEL_ID}`) || el.closest(`#${LAUNCHER_WRAP_ID}`)) continue;

      if (setControlValue(el, String(value))) {
        filled++;
        filledElements.add(el);
      }
    }

    return { filled, filledElements };
  };

  const resolveProfileValueForField = (keywordText, profile, field) => {
    if (/\b(e-?mail)\b/.test(keywordText)) return profile.email;

    if (/\b(phone|mobile|tel(?:ephone)?)\b/.test(keywordText))
      return profile.phone;

    if (/\b(linkedin)\b/.test(keywordText)) return profile.linkedin;

    if (/\b(github)\b/.test(keywordText)) return profile.github;

    if (
      /\b(portfolio|website|personal.?site|url)\b/.test(keywordText) &&
      !/\b(linkedin|github)\b/.test(keywordText)
    )
      return profile.portfolio;

    if (/\b(city)\b/.test(keywordText)) return profile.city;

    if (/\b(state|province)\b/.test(keywordText)) return profile.state;

    if (/\b(country)\b/.test(keywordText)) return profile.country;

    if (
      /\b(over.?18|legal.?age|at.?least.?18|are.?you.?18)\b/.test(keywordText)
    )
      return profile.is_over_18;

    if (
      /\b(work.?auth|authorization.?status|authorized.?to.?work)\b/.test(keywordText) &&
      !/\b(sponsor)\b/.test(keywordText)
    )
      return { type: "select_match", value: profile.work_authorization };

    if (/\b(sponsor|visa.?sponsor|require.?sponsor)\b/.test(keywordText))
      return profile.requires_sponsorship;

    if (/\b(fluent.?in.?english|english.?fluency|english.?proficien)\b/.test(keywordText))
      return profile.fluent_in_english;

    if (/\b(years?.?(of)?.?exp|experience.?years?)\b/.test(keywordText))
      return profile.years_experience;

    // Current role checkbox — must be before current_title
    if (/\b(current.?role|currently.?work)\b/.test(keywordText))
      return { type: "checkbox", value: profile.exp_is_current };

    if (
      /\b(current.?title|job.?title|headline|role)\b/.test(keywordText) &&
      !/\b(company|employer|current.?role)\b/.test(keywordText)
    )
      return profile.current_title;

    if (/\b(current.?company|current.?employer|employer)\b/.test(keywordText))
      return profile.current_company;

    if (/\b(salary|compensation|pay|wage|desired.?salary)\b/.test(keywordText))
      return profile.desired_salary;

    if (/\b(notice.?period)\b/.test(keywordText))
      return profile.notice_period;

    // Education/employment date fields — must be before generic start_date matcher
    if (/\b(start.?date.?month)\b/.test(keywordText)) {
      const inEdu = field && isInSection(field, /education|school|degree/i);
      return { type: "select_match", value: inEdu ? monthName(profile.edu_start_month) : monthName(profile.exp_start_month) };
    }

    if (/\b(start.?date.?year|start.?year)\b/.test(keywordText) && !/\b(available|earliest)\b/.test(keywordText)) {
      const inEdu = field && isInSection(field, /education|school|degree/i);
      return inEdu ? profile.edu_start_year : profile.exp_start_year;
    }

    if (/\b(end.?date.?month)\b/.test(keywordText)) {
      const inEdu = field && isInSection(field, /education|school|degree/i);
      return { type: "select_match", value: inEdu ? monthName(profile.edu_end_month) : monthName(profile.exp_end_month) };
    }

    if (/\b(end.?date.?year|end.?year)\b/.test(keywordText)) {
      const inEdu = field && isInSection(field, /education|school|degree/i);
      return inEdu ? profile.edu_end_year : profile.exp_end_year;
    }

    if (/\b(start.?date|available.?to.?start|earliest.?start|availability)\b/.test(keywordText) &&
        !/\b(month|year)\b/.test(keywordText))
      return profile.available_start_date;

    if (/\b(relocat|willing.?to.?relocate|open.?to.?relocation)\b/.test(keywordText))
      return profile.willing_to_relocate;

    // Hispanic/Latino — must be before generic race/ethnicity
    if (/\b(hispanic|latino|latina|latinx)\b/.test(keywordText))
      return { type: "select_match", value: profile.hispanic_latino || profile.race_ethnicity };

    if (
      /\b(race|ethnic|race.?ethnicity)\b/.test(keywordText) &&
      !/\b(gender|sex|veteran)\b/.test(keywordText)
    )
      return { type: "select_match", value: profile.race_ethnicity };

    if (/\b(veteran|military|armed.?forces)\b/.test(keywordText))
      return { type: "select_match", value: profile.veteran_status };

    if (/\b(disabilit|disabled|handicap)\b/.test(keywordText))
      return { type: "select_match", value: profile.disability_status };

    if (/\b(referr|how.?did.?you.?(hear|find|learn)|source)\b/.test(keywordText) &&
      !/\b(open|code)\b/.test(keywordText))
      return profile.referral_source;

    if (/\b(gpa|grade)\b/.test(keywordText)) return profile.gpa;

    if (/\b(degree)\b/.test(keywordText)) return profile.degree;

    if (/\b(school|university|college|institution)\b/.test(keywordText))
      return profile.school;

    if (/\b(field.?of.?study|major|discipline)\b/.test(keywordText))
      return profile.field_of_study;

    // Pronouns — must be before generic gender
    if (/\b(pronoun)\b/.test(keywordText))
      return { type: "select_match", value: profile.pronouns || genderToPronouns(profile.gender) };

    if (/\b(gender|sex)\b/.test(keywordText))
      return { type: "gender", value: profile.gender };

    if (
      /\b(summary|about|bio|objective)\b/.test(keywordText) &&
      !/\b(company|job)\b/.test(keywordText)
    )
      return profile.summary;

    if (/\b(cover.?letter)\b/.test(keywordText)) return profile.cover_letter;

    // Preferred first name — must be before generic first_name
    if (/\b(preferred.?(first)?.?name|nickname|goes.?by)\b/.test(keywordText))
      return profile.first_name;

    if (/\b(first.?name|given.?name)\b/.test(keywordText))
      return profile.first_name;

    if (/\b(last.?name|family.?name|surname)\b/.test(keywordText))
      return profile.last_name;

    if (
      /\bname\b/.test(keywordText) &&
      !/\b(company|organization|user|first|last|family|given|preferred)\b/.test(keywordText)
    )
      return profile.name;

    return null;
  };

  // Shared helpers object passed to adapter fillCustom()
  const adapterHelpers = () => ({
    toLower,
    isInSection,
    monthName,
    genderToPronouns,
    setControlValue,
    fillSelectByText,
    fillGenderSelect,
    buildFieldKeywordText,
    resolveProfileValueForField,
  });

  /**
   * Run heuristic keyword-based autofill on all visible form fields.
   * Used ONLY when no ATS adapter is detected (universal fallback).
   */
  const runHeuristicFill = (profile) => {
    const fields = Array.from(document.querySelectorAll(AUTOFILL_FIELD_SELECTOR));
    let matched = 0;
    let filled = 0;

    fields.forEach((field) => {
      if (
        !(
          field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement
        )
      ) {
        return;
      }
      if (field.disabled || field.readOnly) return;
      if (field.closest(`#${PANEL_ID}`) || field.closest(`#${LAUNCHER_WRAP_ID}`)) return;

      const keywordText = buildFieldKeywordText(field);
      if (!keywordText) return;

      const resolved = resolveProfileValueForField(keywordText, profile, field);
      if (resolved == null || resolved === "") return;

      matched += 1;
      let changed = false;

      if (typeof resolved === "object" && resolved.type === "gender") {
        if (field instanceof HTMLSelectElement) {
          changed = fillGenderSelect(field, resolved.value);
        } else {
          changed = setControlValue(field, resolved.value || "");
        }
      } else if (typeof resolved === "object" && resolved.type === "select_match") {
        if (field instanceof HTMLSelectElement) {
          changed = fillSelectByText(field, resolved.value);
        } else {
          changed = setControlValue(field, resolved.value || "");
        }
      } else if (typeof resolved === "object" && resolved.type === "checkbox") {
        if (field instanceof HTMLInputElement && field.type === "checkbox") {
          const shouldCheck = Boolean(resolved.value);
          if (field.checked !== shouldCheck) {
            field.checked = shouldCheck;
            field.dispatchEvent(new Event("change", { bubbles: true }));
            changed = true;
          }
        }
      } else {
        changed = setControlValue(field, String(resolved));
      }

      if (changed) filled += 1;
    });

    return { matched, filled, scanned: fields.length };
  };

  /**
   * Check if the v2 engine is available and a v2 adapter matches.
   */
  const hasV2Engine = () =>
    !!(window.__jaosOrchestrator && window.__jaosScanner && window.__jaosMapper && window.__jaosFiller);

  const hasV2AdapterMatch = () => {
    if (!window.__jaosOrchestrator) return false;
    return !!window.__jaosOrchestrator.detectPlatform();
  };

  /**
   * Run the v2 engine (LLM-powered, MutationObserver-based flow).
   * Returns a promise that resolves with fill results.
   */
  const runV2Engine = async (profile, jobContext) => {
    const orchestrator = window.__jaosOrchestrator;
    console.log("[JAOS] Running v2 engine with adapter detection");

    const result = await orchestrator.run(profile, jobContext, {
      onProgress: (progress) => {
        console.log("[JAOS v2]", progress.phase, progress);
      },
    });

    console.log(`[JAOS v2] Done: ${result.totalFilled} fields filled via ${result.adapter}`);
    return {
      matched: result.totalFilled,
      filled: result.totalFilled,
      scanned: result.steps.reduce((sum, s) => sum + s.total, 0),
      ats: result.adapter,
      v2: true,
      errors: result.errors,
      fieldLabels: result.fieldLabels || [],
    };
  };

  /**
   * Pure DOM autofill (v1 only). No LLM, no v2 engine.
   * Uses v1 ATS adapter selectors → heuristic keyword fill.
   * Returns { matched, filled, scanned, ats, warnings? }.
   */
  const runDomAutofillV1 = async (profileData) => {
    const profile =
      profileData && typeof profileData === "object" ? profileData : {};

    // ── Path A: V1 Known ATS — adapter selectors + fillCustom ──
    const ats = detectAtsPlatform();

    if (ats) {
      console.log(`[JAOS DOM] Detected ATS: ${ats.name} (frame: ${isTopFrame ? "top" : "iframe"})`);
      const { filled: selectorFilled, filledElements } = runAtsSelectorFill(ats, profile);
      console.log(`[JAOS DOM] ${ats.name} selector fill: ${selectorFilled} fields`);

      let customFilled = 0;
      let warnings = [];

      // Run adapter-specific custom fill (dropdowns, React inputs, etc.)
      if (typeof ats.fillCustom === "function") {
        const helpers = adapterHelpers();
        try {
          const result = await ats.fillCustom(profile, helpers);
          // Support both old (number) and new ({ filled, warnings }) return format
          if (typeof result === "number") {
            customFilled = result;
          } else if (result && typeof result === "object") {
            customFilled = result.filled || 0;
            warnings = Array.isArray(result.warnings) ? result.warnings : [];
          }
          if (customFilled > 0) {
            console.log(`[JAOS DOM] ${ats.name} custom fill: ${customFilled} fields`);
          }
        } catch (err) {
          console.log(`[JAOS DOM] ${ats.name} custom fill error:`, err);
        }
      }

      const totalFilled = selectorFilled + customFilled;

      return {
        matched: totalFilled,
        filled: totalFilled,
        scanned: filledElements.size,
        ats: ats.name,
        warnings,
      };
    }

    // ── Path B: Heuristic keyword fallback ──
    // Only log in top frame to reduce noise from sub-frames (tracking iframes, etc.)
    if (isTopFrame) {
      console.log("[JAOS DOM] No v1 ATS adapter matched, using heuristic fallback");
    }
    const heuristic = runHeuristicFill(profile);
    return { ...heuristic, ats: null, warnings: [] };
  };

  /**
   * Main autofill entry point. Routes to best available engine.
   *
   * @param {object} profileData
   * @param {object} [options]
   * @param {boolean} [options.forceV1] — Skip all v2/LLM paths, use pure DOM fill only
   */
  const runDomAutofill = async (profileData, options = {}) => {
    const { forceV1 = false } = options;

    if (forceV1) {
      if (isTopFrame) console.log("[JAOS] forceV1 — using pure DOM fill (no LLM)");
      return await runDomAutofillV1(profileData);
    }

    const profile =
      profileData && typeof profileData === "object" ? profileData : {};

    // ── Path A: V2 engine with matching adapter ──
    if (hasV2Engine() && hasV2AdapterMatch()) {
      const jobContext = {
        title: selectedJobContext.title,
        company: selectedJobContext.company,
        jobId: selectedJobContext.jobId,
      };

      runV2Engine(profile, jobContext).catch((err) => {
        console.log("[JAOS] v2 engine error:", err);
      });

      return {
        matched: 0,
        filled: 0,
        scanned: 0,
        ats: "v2-pending",
        v2: true,
        warnings: [],
      };
    }

    // ── Path B: V1 Known ATS — adapter is the single source of truth ──
    return await runDomAutofillV1(profile);
  };

  /**
   * Remove any pre-attached resume/CV from the ATS form (e.g. Greenhouse profile resume).
   * Clicks the "×" / "Remove" button in the resume section so the file input reappears.
   * Returns true if a removal was performed (caller should wait for DOM update).
   */
  const removeExistingResumeAttachment = () => {
    console.log("[JAOS] removeExistingResumeAttachment: scanning for pre-attached resume...");

    // ── Step 1: Find a "Remove file" button near a resume label ──
    // Greenhouse uses: <button aria-label="Remove file"> inside a file-upload container
    // that has a sibling label with id containing "resume"
    const removeButtons = document.querySelectorAll(
      '[aria-label*="Remove" i], [aria-label*="remove" i], ' +
      'button[class*="remove"], button[class*="delete"], [class*="remove-file"]'
    );
    for (const btn of removeButtons) {
      if (btn.closest(`#${PANEL_ID}`) || btn.closest(`#${LAUNCHER_WRAP_ID}`)) continue;
      // Walk up to find if this remove button is inside a resume-related container
      const container = btn.closest(
        '[class*="file-upload"], [class*="upload"], [class*="attachment"], ' +
        'fieldset, .field, .form-group, [data-field]'
      ) || btn.parentElement?.parentElement?.parentElement;
      if (!container) continue;
      const containerText = (container.textContent || "").toLowerCase();
      // Check if the container (or a sibling label) is resume-related
      const labelId = container.getAttribute("aria-labelledby") || "";
      const isResume = /resume|cv/i.test(containerText) || /resume/i.test(labelId) ||
        container.querySelector('[id*="resume" i], [class*="resume" i]');
      if (isResume) {
        console.log("[JAOS] Found resume remove button:", btn.outerHTML?.substring(0, 100));
        btn.click();
        return true;
      }
    }

    // ── Step 2: Find resume label, walk to parent, look for any × button ──
    const labels = document.querySelectorAll("label, legend, p, span, div");
    for (const el of labels) {
      if (el.closest(`#${PANEL_ID}`) || el.closest(`#${LAUNCHER_WRAP_ID}`)) continue;
      if (el.children.length > 5 || (el.textContent || "").trim().length > 50) continue;
      if (!/resume\s*\/?\s*cv|cv\s*\/?\s*resume/i.test((el.textContent || "").trim())) continue;

      // Found the resume label. Walk UP past the label to the overall upload container.
      // Key: don't stop at the label's own wrapper — go to the PARENT that contains
      // both the label AND the file display/remove button.
      let section = el.parentElement;
      // Keep walking up until we find the filename or a broad enough container
      for (let i = 0; i < 4 && section; i++) {
        if (/\.\s*(pdf|docx?|txt|rtf)\b/i.test(section.textContent || "")) break;
        section = section.parentElement;
      }
      if (!section || !/\.\s*(pdf|docx?|txt|rtf)\b/i.test(section.textContent || "")) {
        console.log("[JAOS] Resume label found but no attached file nearby");
        return false;
      }

      console.log("[JAOS] Found resume section with file:", section.className?.substring?.(0, 60));

      // Look for remove/close buttons inside this section
      const rmBtn = section.querySelector(
        '[aria-label*="Remove" i], button[class*="remove"], button[class*="delete"], ' +
        'button[class*="close"], [class*="remove-file"]'
      );
      if (rmBtn) {
        console.log("[JAOS] Clicking remove button:", rmBtn.outerHTML?.substring(0, 100));
        rmBtn.click();
        return true;
      }

      // Fallback: any element with × text
      for (const c of section.querySelectorAll("button, a, span, div, i")) {
        const t = (c.textContent || "").trim();
        if (/^[×✕✖✗xX🗙]$/.test(t) || /^remove$/i.test(t)) {
          console.log("[JAOS] Clicking × fallback:", c.tagName);
          c.click();
          return true;
        }
      }

      // SVG icon fallback
      for (const svg of section.querySelectorAll("svg")) {
        const p = svg.parentElement;
        if (p?.tagName === "BUTTON" || p?.getAttribute("role") === "button") {
          console.log("[JAOS] Clicking SVG button:", p.outerHTML?.substring(0, 80));
          p.click();
          return true;
        }
      }

      console.log("[JAOS] Resume section found but no remove button inside it");
      return false;
    }

    // ── Step 3: Last resort — clear file inputs with files in resume areas ──
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    for (const input of fileInputs) {
      if (input.closest(`#${PANEL_ID}`) || input.closest(`#${LAUNCHER_WRAP_ID}`)) continue;
      const wrap = input.closest('[class*="upload"], .field, .form-group, fieldset') ||
        input.parentElement?.parentElement || input.parentElement;
      if (/resume|cv/i.test((wrap?.textContent || "").toLowerCase()) && input.files?.length > 0) {
        console.log("[JAOS] Clearing file input directly");
        input.files = new DataTransfer().files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }

    console.log("[JAOS] No pre-attached resume found");
    return false;
  };

  const findResumeFileInputs = () => {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const resumeInputs = [];

    fileInputs.forEach((input) => {
      if (input.closest(`#${PANEL_ID}`) || input.closest(`#${LAUNCHER_WRAP_ID}`)) return;

      const accept = (input.getAttribute("accept") || "").toLowerCase();
      const isImageOnly =
        accept && /^image\b/.test(accept) && !accept.includes("pdf") && !accept.includes("doc");
      if (isImageOnly) return;

      // [OracleCloud] Skip file inputs inside the "Import your profile" section
      // These trigger LinkedIn/Indeed profile import — NOT resume upload
      const ariaLabel = (input.getAttribute("aria-label") || "").toLowerCase();
      if (ariaLabel.includes("import your profile")) return;
      if (input.classList.contains("apply-flow-profile-import-awli__file-upload")) return;
      if (input.closest('[class*="profile-import"]') || input.closest('[class*="import-awli"]')) return;

      // Check nearest container text to classify this input.
      // Greenhouse uses: <div class="file-upload" role="group" aria-labelledby="upload-label-resume">
      // BambooHR uses: <div data-fabric-component="Flex"> wraps label (<p>) + FileUpload per field
      // NOTE: Do NOT match FileUpload — it's too narrow (no label text inside).
      const nearbyContainer =
        input.closest(
          '[data-fabric-component="Flex"], ' +
          'fieldset, .field, .form-group, .upload-field, [data-field], ' +
          '[class*="file-upload"], [role="group"]'
        ) ||
        input.parentElement?.parentElement ||
        input.parentElement;
      const labelledBy = nearbyContainer?.getAttribute("aria-labelledby") || "";
      const nearbyText = (nearbyContainer?.textContent || "").toLowerCase();

      // Skip cover letter fields
      if (/cover.?letter/i.test(nearbyText) && !/resume|cv|curriculum/i.test(nearbyText)) return;

      // Skip "additional files" / "supporting documents" fields
      if (/additional\s*file|supporting\s*doc|other\s*doc|supplemental/i.test(nearbyText) &&
          !/resume|cv|curriculum/i.test(nearbyText)) return;

      // Match by: container text, aria-labelledby, or input id containing "resume"
      if (/resume|cv|curriculum/i.test(nearbyText) || /resume/i.test(labelledBy) ||
          /resume/i.test(input.id || "")) {
        resumeInputs.push(input);
      }
    });

    return resumeInputs;
  };

  /**
   * Dispatch a synthetic drop event sequence on a container.
   */
  const dispatchDropEvent = (container, dt) => {
    const makeEvent = (type) => {
      const evt = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(evt, "dataTransfer", { value: dt });
      return evt;
    };
    container.dispatchEvent(makeEvent("dragenter"));
    container.dispatchEvent(makeEvent("dragover"));
    container.dispatchEvent(makeEvent("drop"));
  };

  /**
   * Inject a File into a file input, dispatching all necessary events.
   * Handles hidden inputs, dropzone wrappers, and Greenhouse-style upload UIs.
   */
  const injectFileIntoInput = (input, file) => {
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      // Also dispatch drop on the closest wrapper for dropzone-style UIs
      const wrapper =
        input.closest(
          '[class*="dropzone"], [class*="upload"], [class*="drop"], ' +
          'label, .field, .form-group, .upload-field'
        ) || input.parentElement;
      if (wrapper && wrapper !== input) {
        const wdt = new DataTransfer();
        wdt.items.add(file);
        dispatchDropEvent(wrapper, wdt);
      }
      return true;
    } catch (_err) {
      return false;
    }
  };

  /**
   * Find cover letter file inputs (opposite of findResumeFileInputs).
   */
  const findCoverLetterFileInputs = () => {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const results = [];

    fileInputs.forEach((input) => {
      if (input.closest(`#${PANEL_ID}`) || input.closest(`#${LAUNCHER_WRAP_ID}`)) return;

      const nearbyContainer =
        input.closest("fieldset, .field, .form-group, .upload-field, [data-field]") ||
        input.parentElement?.parentElement ||
        input.parentElement;
      const nearbyText = (nearbyContainer?.textContent || "").toLowerCase();

      if (/cover.?letter/i.test(nearbyText) && !/resume|cv|curriculum/i.test(nearbyText)) {
        results.push(input);
      }
    });

    return results;
  };

  /**
   * Upload resume to the FIRST resume file input only.
   * Handles Greenhouse "Attach" button pattern (hidden file input behind a button).
   */
  const uploadResumeToFileInputs = (resumeData) =>
    new Promise((resolve) => {
      if (!resumeData || !resumeData.file_path) {
        resolve(false);
        return;
      }

      // Remove any pre-attached resume (e.g. from Greenhouse/Lever profile)
      // so we can upload the user's JAOS-selected resume instead
      const removed = removeExistingResumeAttachment();
      if (removed) {
        console.log("[JAOS] Removed profile resume, waiting for DOM update before uploading JAOS resume...");
      }

      const doUpload = () => {
        safeSendMessage(
          {
            type: "JAOS_FETCH_RESUME_FILE",
            filePath: resumeData.file_path,
            filename: resumeData.label || "resume.pdf",
            mimeType: resumeData.mime_type || "application/pdf",
          },
          (response) => {
            if (!response || !response.ok || !response.fileData) {
              console.log("[JAOS] Resume file fetch failed:", response?.error);
              resolve(false);
              return;
            }

            try {
              const binary = atob(response.fileData);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              const file = new File([bytes], response.filename, {
                type: response.mimeType,
              });

              let targets = findResumeFileInputs();
              console.log("[JAOS] findResumeFileInputs found:", targets.length, "inputs");

              // Fallback: if no labeled resume input found, look for hidden file inputs
              // inside the resume upload container (Greenhouse hides input behind "Attach" button)
              if (targets.length === 0) {
                console.log("[JAOS] No labeled resume input, searching resume upload containers...");
                const allFileInputs = document.querySelectorAll('input[type="file"]');
                for (const inp of allFileInputs) {
                  if (inp.closest(`#${PANEL_ID}`) || inp.closest(`#${LAUNCHER_WRAP_ID}`)) continue;
                  // [OracleCloud] Skip import profile file inputs in fallback too
                  const ariaLbl = (inp.getAttribute("aria-label") || "").toLowerCase();
                  if (ariaLbl.includes("import your profile")) continue;
                  if (inp.classList.contains("apply-flow-profile-import-awli__file-upload")) continue;
                  if (inp.closest('[class*="profile-import"]') || inp.closest('[class*="import-awli"]')) continue;
                  // Check the CLOSEST label container — skip if it says "cover letter"
                  // NOTE: Do NOT match FileUpload — it's too narrow (no label text).
                  const closestSection = inp.closest(
                    '[data-fabric-component="Flex"], ' +
                    'fieldset, .field, .form-group, [class*="file-upload"], [role="group"]'
                  ) || inp.parentElement;
                  const closestText = (closestSection?.textContent || "").toLowerCase();
                  if (/cover.?letter/i.test(closestText) && !/resume|cv|curriculum/i.test(closestText)) {
                    console.log("[JAOS] Skipping cover letter file input in fallback");
                    continue;
                  }
                  // Walk up to find a resume-related container
                  let parent = inp;
                  for (let i = 0; i < 6; i++) {
                    parent = parent.parentElement;
                    if (!parent || parent === document.body) break;
                    const txt = (parent.textContent || "").toLowerCase();
                    // Skip if this level says "cover letter" but not "resume"
                    if (/cover.?letter/i.test(txt) && !/resume|cv|curriculum/i.test(txt)) continue;
                    if (/resume|cv|curriculum/i.test(txt)) {
                      console.log("[JAOS] Found hidden file input in resume container:", parent.className?.substring?.(0, 50));
                      targets = [inp];
                      break;
                    }
                  }
                  if (targets.length > 0) break;
                }
              }

              if (targets.length === 0) {
                console.log("[JAOS] No resume file input found at all — cannot upload");
                resolve(false);
                return;
              }

              console.log("[JAOS] Injecting resume file into input:", response.filename);
              resolve(injectFileIntoInput(targets[0], file));
            } catch (_error) {
              console.error("[JAOS] Resume upload error:", _error);
              resolve(false);
            }
          }
        );
      };

      // If we removed a profile resume, wait for DOM to settle before uploading
      if (removed) {
        setTimeout(doUpload, 800);
      } else {
        doUpload();
      }
    });

  /**
   * Upload cover letter as a generated .txt file from profile text.
   * Only targets file inputs explicitly labeled as cover letter.
   */
  const uploadCoverLetterFile = (coverLetterText) => {
    if (!coverLetterText || typeof coverLetterText !== "string" || !coverLetterText.trim()) {
      return false;
    }

    const targets = findCoverLetterFileInputs();
    if (targets.length === 0) return false;

    const file = new File(
      [coverLetterText],
      "cover_letter.txt",
      { type: "text/plain" }
    );
    return injectFileIntoInput(targets[0], file);
  };

  /**
   * Scan the page for required form fields and check which are filled.
   * Detects required via: required attr, aria-required, asterisk (*) in
   * label/heading text, or nearby <abbr>/<span> with asterisk.
   */
  const scanRequiredFields = () => {
    const allFields = Array.from(
      document.querySelectorAll('input, select, textarea')
    );
    const required = [];
    const seen = new Set();

    /**
     * Walk up to 4 parent levels looking for asterisk markers.
     * Only check within the field's own label wrapper — stop at containers
     * that hold multiple fields to avoid false positives from sibling asterisks.
     */
    const hasNearbyAsterisk = (field) => {
      let el = field;
      for (let i = 0; i < 4; i++) {
        el = el.parentElement;
        if (!el || el.tagName === "FORM" || el.tagName === "BODY") break;

        // If this container has multiple input-like children, it's a multi-field
        // wrapper — asterisks here belong to individual fields, not all of them.
        const inputCount = el.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
        if (inputCount > 1) break;

        // Check for asterisk in <abbr>, <span>, <sup> markers
        for (const m of el.querySelectorAll("abbr, span, sup")) {
          if ((m.textContent || "").trim() === "*") return true;
        }

        // Check headings / labels inside this container for trailing *
        for (const h of el.querySelectorAll("label, h1, h2, h3, h4, h5, h6, legend, p")) {
          if (/\*\s*$/.test(h.textContent || "")) return true;
        }

        // Check the direct text of this wrapper (only compact containers)
        // Exclude page-level "* indicates a required field" boilerplate
        const directText = (el.textContent || "").substring(0, 200);
        if (/\*/.test(directText) && el.children.length < 10 &&
            !/indicat|denot|required\s+field/i.test(directText)) return true;
      }
      return false;
    };

    /**
     * Get a readable label for display. Uses existing getFieldLabelText first,
     * then falls back to walking up parents for heading text.
     */
    const getDisplayLabel = (field) => {
      const existing = getFieldLabelText(field);
      if (existing) return existing;

      // Walk parents for any heading / label text
      let el = field;
      for (let i = 0; i < 4; i++) {
        el = el.parentElement;
        if (!el || el.tagName === "FORM" || el.tagName === "BODY") break;
        const heading = el.querySelector("label, h1, h2, h3, h4, h5, h6, legend, p[data-fabric-component], p.fab-Label");
        if (heading) {
          const text = (heading.textContent || "").replace(/\*/g, "").trim();
          if (text && text.length < 50) return text;
        }
      }
      return field.placeholder || field.name || "";
    };

    allFields.forEach((field) => {
      if (field.closest(`#${PANEL_ID}`) || field.closest(`#${LAUNCHER_WRAP_ID}`)) return;
      if (field.type === "hidden" || field.type === "submit" || field.type === "button") return;

      // Skip aria-hidden backing elements (Fabric UI hidden <select>, etc.)
      if (field.getAttribute("aria-hidden") === "true") return;

      // Skip honeypot / spam trap fields
      const honeypotLabel = getFieldLabelText(field) || field.placeholder || "";
      if (/leave this field blank|please leave this/i.test(honeypotLabel)) return;

      // Skip invisible fields (hidden by CSS, collapsed sections, off-screen, etc.)
      // Exempt file inputs — they're almost always hidden behind styled upload buttons
      if (field.type !== "file") {
        if (!field.offsetParent && getComputedStyle(field).position !== "fixed") return;
        if (field.offsetWidth === 0 && field.offsetHeight === 0) return;
      }

      // Skip react-select internal inputs (they duplicate the visible dropdown)
      if (field.id && /^react-select/i.test(field.id)) return;
      if (field.closest('[class*="__value-container"], [class*="__input"]') &&
          field.closest('[class*="-container"]:has([class*="__control"])')) return;

      // Skip intl-tel-input hidden country/dial code fields
      if (field.type === "tel" && field.closest(".iti") && field.name && /country|dial/i.test(field.name)) return;

      const attrRequired =
        field.hasAttribute("required") ||
        field.getAttribute("aria-required") === "true";

      const labelText = getDisplayLabel(field);
      const asteriskInLabel = /\*/.test(labelText);
      const asteriskNearby = !asteriskInLabel && hasNearbyAsterisk(field);

      if (!attrRequired && !asteriskInLabel && !asteriskNearby) return;

      const cleanLabel = labelText
        .replace(/\*/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 40);
      const key = cleanLabel.toLowerCase() || field.name || field.id || String(Math.random());
      if (seen.has(key)) return;
      seen.add(key);

      let isFilled = false;
      if (field.type === "file") {
        isFilled = field.files && field.files.length > 0;
        if (!isFilled) {
          // Check upload zone and parent containers for filename text (e.g. "resume.pdf")
          const zone =
            field.closest('[class*="dropzone"], [class*="upload"], [class*="file-upload"], .field, .form-group, [data-fabric-component]') ||
            field.parentElement;
          if (zone) {
            isFilled = /\.(pdf|docx?|rtf|txt)\b/i.test(zone.textContent || "");
          }
          // Broader fallback: walk up to 4 parents checking for filename text
          if (!isFilled) {
            let parent = field.parentElement;
            for (let i = 0; i < 4 && parent && !isFilled; i++) {
              if (/\.(pdf|docx?|rtf|txt)\b/i.test(parent.textContent || "")) isFilled = true;
              parent = parent.parentElement;
            }
          }
        }
      } else if (field.type === "checkbox") {
        isFilled = field.checked;
      } else if (field instanceof HTMLSelectElement) {
        isFilled = field.value !== "" && field.selectedIndex > 0;
      } else {
        isFilled = (field.value || "").trim() !== "";
        // Multiselect chip detection (Workday searchable lists, etc.):
        // After selection the input is cleared but a chip with a × button appears.
        if (!isFilled) {
          const fieldWrap = field.closest(
            '[data-automation-id^="formField"], [data-automation-id*="multiselect" i]'
          );
          if (fieldWrap) {
            const hasChip = fieldWrap.querySelector(
              '[data-automation-id="DELETE"], [data-automation-id="delete"], ' +
              '[aria-label*="Remove" i], [aria-label*="Deselect" i]'
            );
            if (hasChip) isFilled = true;
          }
        }
      }

      required.push({ label: cleanLabel || "Field", isFilled });
    });

    // ── Fabric UI fab-SelectToggle widgets (BambooHR) ──
    // These replace the hidden native <select> (aria-hidden) with a visible custom widget.
    // The hidden select is skipped above, so we need to track the visible toggle button separately.
    const fabToggles = document.querySelectorAll("button.fab-SelectToggle");
    for (const btn of fabToggles) {
      if (btn.closest(`#${PANEL_ID}`) || btn.closest(`#${LAUNCHER_WRAP_ID}`)) continue;
      if (!btn.offsetParent) continue;

      // Check if the backing select is required
      const selectContainer = btn.closest(".fab-Select, [data-fabric-component*='Select']") || btn.parentElement;
      const backingSelect = selectContainer?.querySelector("select[required], select[aria-required='true']");
      const hasAsterisk = (() => {
        let el = btn;
        for (let i = 0; i < 4; i++) {
          el = el.parentElement;
          if (!el || el.tagName === "FORM" || el.tagName === "BODY") break;
          for (const m of el.querySelectorAll("abbr, span, sup")) {
            if ((m.textContent || "").trim() === "*") return true;
          }
          for (const h of el.querySelectorAll("label, legend")) {
            if (/\*/.test(h.textContent || "")) return true;
          }
        }
        return false;
      })();

      if (!backingSelect && !hasAsterisk) continue;

      // Get label
      let label = "";
      let parent = btn.parentElement;
      for (let i = 0; i < 5 && parent; i++) {
        const lbl = parent.querySelector("label");
        if (lbl && !btn.contains(lbl)) {
          label = (lbl.textContent || "").replace(/\*/g, "").trim().substring(0, 40);
          break;
        }
        parent = parent.parentElement;
      }
      if (!label) label = (btn.getAttribute("aria-label") || "").replace(/\*/g, "").trim().substring(0, 40);
      const key = label.toLowerCase() || "fab-select";
      if (seen.has(key)) continue;
      seen.add(key);

      // Check if filled: content text is NOT the placeholder
      const content = (btn.querySelector(".fab-SelectToggle__content")?.textContent || "").trim();
      const isFilled = content !== "" && !/^[-–—].*select/i.test(content) && !/^select/i.test(content);

      required.push({ label: label || "Select", isFilled });
    }

    return {
      total: required.length,
      filled: required.filter((f) => f.isFilled).length,
      fields: required,
    };
  };

  const isLikelyLocationText = (text) => {
    if (!text) {
      return false;
    }
    return (
      /\bremote\b/i.test(text) ||
      /\bunited states\b/i.test(text) ||
      /\busa\b/i.test(text) ||
      /,\s*[A-Z]{2}\b/.test(text) ||
      /,\s*[A-Za-z]{3,}/.test(text)
    );
  };

  const collectTextSnippets = (container) => {
    const snippets = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();

    while (node) {
      const raw = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (raw.length >= 2) {
        snippets.push(raw);
      }
      node = walker.nextNode();
    }

    return snippets;
  };

  const extractJobContextFromApply = (clickable) => {
    let container = clickable;
    while (container && container !== document.body) {
      const text = cleanText(container.textContent);
      const hasApply = /(^|\s)apply(\s|$)/i.test(text);
      if (hasApply && text.length > 60) {
        break;
      }
      container = container.parentElement;
    }

    if (!container || container === document.body) {
      return normalizeJobContext({});
    }

    let jobId = "";
    const jobLink = container.querySelector('a[href^="/jobs/"], a[href*="/jobs/"]');
    if (jobLink) {
      jobId = extractJobIdFromHref(jobLink.getAttribute("href"));
    }

    if (!jobId) {
      const elWithJobId = clickable.closest("[data-job-id]") || container.querySelector("[data-job-id]");
      if (elWithJobId) {
        jobId = elWithJobId.getAttribute("data-job-id") || "";
      }
    }

    if (!jobId && isJaosJobDetailPage()) {
      jobId = extractJobIdFromHref(getNormalizedPathname());
    }

    const snippets = collectTextSnippets(container).filter((text, index, arr) => {
      if (arr.indexOf(text) !== index) {
        return false;
      }
      if (/^apply$/i.test(text)) {
        return false;
      }
      if (hasTimeAgoPattern(text)) {
        return false;
      }
      if (/^auto[-\s]?detected/i.test(text)) {
        return false;
      }
      return true;
    });

    let title = "";
    const linkedTitle = container.querySelector('a[href^="/jobs/"] h3, a[href*="/jobs/"] h3');
    if (linkedTitle) {
      title = cleanText(linkedTitle.textContent);
    }
    if (!title) {
      const heading = container.querySelector("h1, h2, h3, h4");
      if (heading) {
        title = cleanText(heading.textContent);
      }
    }
    if (!title) {
      title =
        snippets.find(
          (text) =>
            text.length >= 12 &&
            !BULLET_SEPARATOR_REGEX.test(text) &&
            !/^(apply|not available)$/i.test(text)
        ) || "";
    }

    let company = "";
    const spanCandidates = Array.from(container.querySelectorAll("span"))
      .map((el) => cleanText(el.textContent))
      .filter((text) => text && !/^(?:\u2022|\u00b7|\u00e2\u20ac\u00a2)$/.test(text));

    const spanMetaLine = spanCandidates.find((text) => BULLET_SEPARATOR_REGEX.test(text));
    if (spanMetaLine) {
      company = cleanText(spanMetaLine.split(BULLET_SEPARATOR_REGEX)[0] || "");
    }
    if (!company) {
      company =
        spanCandidates.find(
          (text) =>
            text !== title &&
            !hasTimeAgoPattern(text) &&
            !isLikelyLocationText(text) &&
            !/^(apply|not available)$/i.test(text)
        ) || "";
    }

    if (!company) {
      const metaLine = snippets.find((text) => BULLET_SEPARATOR_REGEX.test(text));
      if (metaLine) {
        company = cleanText(metaLine.split(BULLET_SEPARATOR_REGEX)[0] || "");
      }
    }
    if (!company) {
      const titleIndex = snippets.indexOf(title);
      if (titleIndex >= 0 && snippets[titleIndex + 1]) {
        company = cleanText((snippets[titleIndex + 1].split(BULLET_SEPARATOR_REGEX)[0] || "").trim());
      }
    }

    if (!company) {
      company =
        snippets.find(
          (text) =>
            text.length >= 3 &&
            text.length <= 80 &&
            text !== title &&
            !hasTimeAgoPattern(text) &&
            !isLikelyLocationText(text)
        ) || "";
    }

    if (!title || title === company) {
      title =
        snippets.find(
          (text) =>
            text !== company &&
            text.length >= 12 &&
            !BULLET_SEPARATOR_REGEX.test(text) &&
            !hasTimeAgoPattern(text) &&
            !/^(apply|not available)$/i.test(text)
        ) || title;
    }

    return normalizeJobContext({ title, company, jobId });
  };

  const setAutoOpenMarkerViaBackground = (markerPayload) =>
    new Promise((resolve) => {
      safeSendMessage(
        {
          type: "JAOS_SET_AUTO_OPEN_MARKER",
          marker: markerPayload,
        },
        (response) => {
          resolve(Boolean(response && response.ok));
        }
      );
    });

  const markAutoOpenForNextPage = async (jobContext) => {
    const normalized = normalizeJobContext(jobContext);
    const markerPayload = {
      expiresAt: Date.now() + AUTO_OPEN_TTL_MS,
      source: window.location.href,
      jobTitle: normalized.title,
      company: normalized.company,
      jobId: normalized.jobId,
    };

    const savedByBackground = await setAutoOpenMarkerViaBackground(markerPayload);
    if (savedByBackground) {
      return;
    }

    await storageSet({
      [AUTO_OPEN_FLAG_KEY]: markerPayload,
    });
  };

  const consumeAutoOpenMarkerJobContext = async () => {
    const result = await storageGet(AUTO_OPEN_FLAG_KEY);
    const marker = result?.[AUTO_OPEN_FLAG_KEY];

    if (!marker || typeof marker !== "object") {
      return null;
    }

    const expiresAt = Number(marker.expiresAt || 0);
    if (!expiresAt || expiresAt < Date.now()) {
      await storageRemove(AUTO_OPEN_FLAG_KEY);
      return null;
    }

    const context = normalizeJobContext({
      title: marker.jobTitle,
      company: marker.company,
      jobId: marker.jobId || "",
    });
    await storageRemove(AUTO_OPEN_FLAG_KEY);
    return context;
  };

  const extractJobContextFromDetailPage = () => {
    if (!isJaosJobDetailPage()) {
      return null;
    }

    const pathMatch = getNormalizedPathname().match(/^\/jobs\/([^/?#]+)$/);
    const jobId = pathMatch ? pathMatch[1] : "";

    const titleElement = document.querySelector("h1");
    const title = cleanText(titleElement?.textContent);
    let company = "";

    if (titleElement && titleElement.parentElement) {
      const spanCandidates = Array.from(titleElement.parentElement.querySelectorAll("span"))
        .map((el) => cleanText(el.textContent))
        .filter(
          (text) =>
            text &&
            text !== title &&
            !hasTimeAgoPattern(text) &&
            !/^(?:\u2022|\u00b7|\u00e2\u20ac\u00a2)$/.test(text)
        );
      company =
        spanCandidates.find(
          (text) =>
            !BULLET_SEPARATOR_REGEX.test(text) &&
            !isLikelyLocationText(text) &&
            !/^(back to inbox|posted|today)$/i.test(text)
        ) || "";
    }

    if (!company) {
      const headerScope = titleElement?.parentElement?.parentElement || document.body;
      const buildingSvg = headerScope.querySelector("svg.lucide-building");
      if (buildingSvg && buildingSvg.parentElement) {
        company = cleanText(buildingSvg.parentElement.textContent);
      }
    }

    if (!company && titleElement) {
      const headerContainer = titleElement.closest("div")?.parentElement || document.body;
      const snippets = collectTextSnippets(headerContainer);
      company =
        snippets.find(
          (text) =>
            text !== title &&
            !hasTimeAgoPattern(text) &&
            !isLikelyLocationText(text) &&
            !/^(back to inbox|apply now)$/i.test(text) &&
            !BULLET_SEPARATOR_REGEX.test(text)
        ) || "";
    }

    if (!title && !company) {
      return null;
    }

    return normalizeJobContext({ title, company, jobId });
  };

  const resolveJobContextForCurrentPage = async () => {
    const markerContext = await consumeAutoOpenMarkerJobContext();
    if (markerContext) {
      setSelectedJobContext(markerContext, "marker");
      return selectedJobContext;
    }

    if (selectedJobContextSource === "marker" || selectedJobContextSource === "apply" || selectedJobContextSource === "session") {
      return selectedJobContext;
    }

    const detailPageContext = extractJobContextFromDetailPage();
    if (detailPageContext) {
      setSelectedJobContext(detailPageContext, "page");
      return selectedJobContext;
    }

    if (selectedJobContextSource !== "default") {
      return selectedJobContext;
    }

    setSelectedJobContext(
      {
        title: DEFAULT_JOB_TITLE,
        company: getNeutralCompanyName(),
        jobId: "",
      },
      "default"
    );
    return selectedJobContext;
  };

  const maybeAutoOpenPanelFromApply = async () => {
    if (isJaosJobsListPage()) {
      return;
    }

    const markerContext = await consumeAutoOpenMarkerJobContext();
    if (markerContext) {
      setSelectedJobContext(markerContext, "marker");
      void storeActiveJobSession(markerContext);
      showPanel();
      return;
    }

    const sessionContext = await readActiveJobSession();
    if (sessionContext && sessionContext.jobId) {
      setSelectedJobContext(sessionContext, "session");
      showPanel();
    }
  };

  const bindJobsApplyAutoOpen = () => {
    if (applyClickListenerBound) {
      return;
    }

    const onDocumentClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const clickable = target.closest("button, a");
      if (!clickable) {
        return;
      }

      if (applyReplayBypass.has(clickable)) {
        applyReplayBypass.delete(clickable);
        return;
      }

      if (
        clickable.closest(`#${PANEL_ID}`) ||
        clickable.closest(`#${LAUNCHER_WRAP_ID}`)
      ) {
        return;
      }

      const label = cleanText(clickable.textContent).toLowerCase();
      const ariaLabel = cleanText(clickable.getAttribute("aria-label")).toLowerCase();
      const titleAttr = cleanText(clickable.getAttribute("title")).toLowerCase();
      const combinedActionText = `${label} ${ariaLabel} ${titleAttr}`.trim();

      if (!combinedActionText.includes("apply")) {
        return;
      }

      const jobContext = extractJobContextFromApply(clickable);
      setSelectedJobContext(jobContext, "apply");

      const anchor = clickable.closest("a[href]");
      const hasModifierKeys =
        event instanceof MouseEvent &&
        (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0);

      if (!anchor || hasModifierKeys) {
        if (!(event instanceof MouseEvent) || hasModifierKeys) {
          void markAutoOpenForNextPage(jobContext);
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        void (async () => {
          await markAutoOpenForNextPage(jobContext);
          if (clickable instanceof HTMLElement) {
            applyReplayBypass.add(clickable);
            clickable.click();
          }
        })();
        return;
      }

      const href = anchor.href;
      if (!href || href.startsWith("javascript:")) {
        void markAutoOpenForNextPage(jobContext);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      void (async () => {
        await markAutoOpenForNextPage(jobContext);
        const targetAttr = (anchor.getAttribute("target") || "").toLowerCase();
        if (targetAttr === "_blank") {
          window.open(href, "_blank", "noopener,noreferrer");
          return;
        }
        window.location.assign(href);
      })();
    };

    document.addEventListener("click", onDocumentClick, true);
    applyClickListenerBound = true;
  };

  const clearPanelBody = () => {
    if (!panelBody) {
      return;
    }
    panelBody.innerHTML = "";
  };

  const createPanel = () => {
    const existingPanel = document.getElementById(PANEL_ID);
    const existingBody = document.getElementById(PANEL_BODY_ID);

    if (existingPanel && existingBody) {
      panelBody = existingBody;
      return existingPanel;
    }

    const nextPanel = document.createElement("aside");
    nextPanel.id = PANEL_ID;
    Object.assign(nextPanel.style, {
      position: "fixed",
      top: "12px",
      right: "12px",
      width: "334px",
      maxWidth: "calc(100vw - 12px)",
      maxHeight: "calc(100vh - 56px)",
      background: "#ffffff",
      borderRadius: "20px",
      border: "1px solid #e2e8f0",
      boxShadow: "0 18px 42px rgba(15, 23, 42, 0.22)",
      zIndex: "999999",
      transform: "translateX(calc(100% + 28px))",
      transition: "transform 220ms ease",
      overflow: "hidden",
    });

    const header = document.createElement("div");
    header.id = PANEL_HEADER_ID;
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "10px",
      padding: "12px 14px",
      borderBottom: "1px solid #e2e8f0",
    });

    const title = document.createElement("div");
    title.textContent = "Autofill with AI";
    Object.assign(title.style, {
      fontSize: "16px",
      fontWeight: "700",
      color: "#0f172a",
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close JAOS panel");
    Object.assign(closeBtn.style, {
      width: "38px",
      height: "38px",
      border: "none",
      borderRadius: "999px",
      background: "#e9edf4",
      color: "#0f172a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      padding: "0",
    });
    closeBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6L15 12L9 18" stroke="#0f172a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    closeBtn.addEventListener("click", () => {
      hidePanel({ forceDockLauncher: true });
    });

    header.appendChild(title);
    header.appendChild(closeBtn);
    nextPanel.appendChild(header);

    const body = document.createElement("div");
    body.id = PANEL_BODY_ID;
    Object.assign(body.style, {
      padding: "10px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      overflowY: "auto",
      overflowX: "hidden",
      background: "#f8fafc",
    });

    panelBody = body;
    nextPanel.appendChild(body);

    const mountTarget = getMountTarget();
    mountTarget.appendChild(nextPanel);
    return nextPanel;
  };

  const renderLoadingView = (message = "Syncing JAOS profile...") => {
    if (!panelBody) {
      return;
    }
    clearPanelBody();

    const loadingCard = document.createElement("section");
    Object.assign(loadingCard.style, {
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "16px",
      padding: "20px",
      color: "#475569",
      fontSize: "14px",
      fontWeight: "600",
      textAlign: "center",
    });
    loadingCard.textContent = message;
    panelBody.appendChild(loadingCard);
  };

  const openAuthPage = (path) => {
    window.open(`${JAOS_FRONTEND_URL}${path}`, "_blank", "noopener,noreferrer");
  };

  const renderAuthView = (errorMessage = "") => {
    if (!panelBody) {
      return;
    }
    clearPanelBody();

    const intro = document.createElement("section");
    Object.assign(intro.style, {
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "16px",
      padding: "14px 12px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    });

    const introTitle = document.createElement("div");
    introTitle.textContent = "Apply with JAOS";
    Object.assign(introTitle.style, {
      fontSize: "22px",
      fontWeight: "700",
      color: "#0f172a",
      textAlign: "center",
    });

    const introText = document.createElement("div");
    introText.textContent =
      "Login or create your JAOS account to sync profile details and primary resume into extension autofill.";
    Object.assign(introText.style, {
      fontSize: "14px",
      lineHeight: "1.5",
      color: "#475569",
      textAlign: "center",
    });

    intro.appendChild(introTitle);
    intro.appendChild(introText);

    if (errorMessage) {
      const errorBox = document.createElement("div");
      errorBox.textContent = errorMessage;
      Object.assign(errorBox.style, {
        marginTop: "2px",
        padding: "9px 10px",
        borderRadius: "10px",
        background: "#fef2f2",
        border: "1px solid #fecaca",
        color: "#b91c1c",
        fontSize: "12px",
        textAlign: "center",
      });
      intro.appendChild(errorBox);
    }

    const checklist = document.createElement("section");
    Object.assign(checklist.style, {
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "16px",
      padding: "12px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    });

    const checklistTitle = document.createElement("div");
    checklistTitle.textContent = "Quick Start";
    Object.assign(checklistTitle.style, {
      fontSize: "16px",
      fontWeight: "700",
      color: "#0f172a",
      marginBottom: "4px",
    });

    const makeActionRow = (label, buttonLabel, onClick) => {
      const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      padding: "8px 10px",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      background: "#f8fafc",
      });

      const text = document.createElement("span");
      text.textContent = label;
      Object.assign(text.style, {
        fontSize: "14px",
        fontWeight: "600",
        color: "#0f172a",
      });

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = buttonLabel;
      Object.assign(btn.style, {
        border: "none",
        borderRadius: "999px",
        background: "#3b82f6",
        color: "#ffffff",
        fontSize: "13px",
        fontWeight: "700",
        padding: "8px 14px",
        cursor: "pointer",
      });
      btn.addEventListener("click", onClick);

      row.appendChild(text);
      row.appendChild(btn);
      return row;
    };

    const loginRow = makeActionRow("Login to your JAOS account", "GO", () =>
      openAuthPage("/auth/login")
    );
    const registerRow = makeActionRow("Create JAOS account", "GO", () =>
      openAuthPage("/auth/register")
    );

    checklist.appendChild(checklistTitle);
    checklist.appendChild(loginRow);
    checklist.appendChild(registerRow);

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.textContent = "I have logged in - Sync now";
    Object.assign(refreshBtn.style, {
      border: "none",
      borderRadius: "12px",
      background: "#dbeafe",
      color: "#1e3a8a",
      fontSize: "14px",
      fontWeight: "700",
      padding: "10px",
      cursor: "pointer",
    });
    refreshBtn.addEventListener("click", () => {
      void loadPanelData();
    });

    panelBody.appendChild(intro);
    panelBody.appendChild(checklist);
    panelBody.appendChild(refreshBtn);
  };

  const renderMainView = (payload) => {
    if (!panelBody) return;
    clearPanelBody();

    const user = payload?.user || {};
    const resumes = Array.isArray(payload?.resumes) ? payload.resumes : [];
    selectedResumeData = resumes.length > 0 ? resumes[0] : null;
    const apiJob = payload?.job || null;
    const localJob = normalizeJobContext(selectedJobContext);

    const jobTitle = apiJob?.title || localJob.title;
    const jobCompany = apiJob?.company || localJob.company;
    const jobId = apiJob?.id || localJob.jobId;
    const qualityScore = (apiJob?.quality_metrics || {}).quality_score;
    const companyLogoUrl = apiJob?.company_logo || "";
    const jobLocation = apiJob?.location || "";

    const skills = Array.isArray(user.skills) ? user.skills : [];
    const locationParts = [user.city, user.state, user.country].filter(Boolean);
    const locationStr = locationParts.join(", ");

    // --- Helper: create a card section ---
    const card = (extra = {}) => {
      const el = document.createElement("section");
      Object.assign(el.style, {
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        ...extra,
      });
      return el;
    };

    const text = (content, styles = {}) => {
      const el = document.createElement("div");
      el.textContent = content;
      Object.assign(el.style, styles);
      return el;
    };

    const pill = (content, fg = "#1d4ed8", bg = "#dbeafe") => {
      const el = document.createElement("span");
      el.textContent = content;
      Object.assign(el.style, {
        display: "inline-block",
        fontSize: "10px",
        fontWeight: "600",
        color: fg,
        background: bg,
        borderRadius: "999px",
        padding: "2px 8px",
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      });
      return el;
    };

    // ==================== 1. PROFILE CARD ====================
    const profileCard = card();

    // Avatar row
    const avatarRow = document.createElement("div");
    Object.assign(avatarRow.style, {
      display: "flex", alignItems: "center", gap: "10px",
    });

    const avatar = document.createElement("div");
    const initials = (user.full_name || "U")
      .split(/\s+/).map((w) => w[0]).join("").substring(0, 2).toUpperCase();
    avatar.textContent = initials;
    Object.assign(avatar.style, {
      width: "36px", height: "36px", borderRadius: "50%",
      background: "linear-gradient(135deg, #2563eb, #7c3aed)",
      color: "#fff", fontWeight: "700", fontSize: "14px",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: "0",
    });

    const nameCol = document.createElement("div");
    Object.assign(nameCol.style, { display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" });
    nameCol.appendChild(
      text(user.full_name || "JAOS User", { fontSize: "13px", fontWeight: "700", color: "#111827" })
    );
    if (user.headline) {
      nameCol.appendChild(
        text(user.headline, { fontSize: "11px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })
      );
    }
    nameCol.appendChild(
      text(user.email || "", { fontSize: "10px", color: "#94a3b8" })
    );

    avatarRow.appendChild(avatar);
    avatarRow.appendChild(nameCol);
    profileCard.appendChild(avatarRow);

    // Info pills row
    const infoRow = document.createElement("div");
    Object.assign(infoRow.style, { display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" });
    if (locationStr) infoRow.appendChild(pill(locationStr));
    if (user.phone) infoRow.appendChild(pill(user.phone, "#7c3aed", "#ede9fe"));
    if (user.years_experience) infoRow.appendChild(pill(`${user.years_experience}y exp`, "#059669", "#ecfdf5"));
    if (infoRow.children.length > 0) profileCard.appendChild(infoRow);

    // Skills row
    if (skills.length > 0) {
      const skillsRow = document.createElement("div");
      Object.assign(skillsRow.style, { display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "2px" });
      skills.forEach((s) => skillsRow.appendChild(pill(s, "#475569", "#f1f5f9")));
      profileCard.appendChild(skillsRow);
    }

    // ==================== 2. JOB CARD ====================
    const jobCard = card();

    const jobTop = document.createElement("div");
    Object.assign(jobTop.style, { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" });

    const companyWrap = document.createElement("div");
    Object.assign(companyWrap.style, { display: "flex", alignItems: "center", gap: "8px", minWidth: "0" });

    const companyLogo = document.createElement("div");
    Object.assign(companyLogo.style, {
      width: "28px", height: "28px", borderRadius: "8px",
      background: "linear-gradient(135deg, #2563eb, #3b82f6)",
      color: "#fff", fontWeight: "700", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontSize: "13px", overflow: "hidden", flexShrink: "0",
    });

    if (companyLogoUrl) {
      const logoImg = document.createElement("img");
      logoImg.src = companyLogoUrl;
      logoImg.alt = jobCompany;
      Object.assign(logoImg.style, { width: "100%", height: "100%", objectFit: "cover" });
      logoImg.addEventListener("error", () => {
        logoImg.remove();
        companyLogo.textContent = (jobCompany || "J").charAt(0).toUpperCase();
      });
      companyLogo.appendChild(logoImg);
    } else {
      companyLogo.textContent = (jobCompany || "J").charAt(0).toUpperCase();
    }

    const jobInfo = document.createElement("div");
    Object.assign(jobInfo.style, { display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" });
    jobInfo.appendChild(
      text(jobTitle, { fontSize: "12px", fontWeight: "700", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" })
    );
    jobInfo.appendChild(
      text(jobCompany, { fontSize: "11px", color: "#6b7280" })
    );

    companyWrap.appendChild(companyLogo);
    companyWrap.appendChild(jobInfo);
    jobTop.appendChild(companyWrap);

    if (typeof qualityScore === "number" && qualityScore > 0) {
      const matchBadge = document.createElement("div");
      matchBadge.textContent = `${qualityScore}%`;
      Object.assign(matchBadge.style, {
        minWidth: "44px", height: "28px", borderRadius: "999px",
        border: "2px solid #3b82f6", color: "#111827", fontSize: "13px",
        fontWeight: "700", display: "flex", alignItems: "center",
        justifyContent: "center", padding: "0 6px", flexShrink: "0",
      });
      jobTop.appendChild(matchBadge);
    }

    jobCard.appendChild(jobTop);
    if (jobLocation) jobCard.appendChild(pill(jobLocation));

    // ==================== 3. RESUME SELECT ====================
    const resumeCard = card();
    resumeCard.appendChild(text("Resume", { fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.04em" }));

    const resumeSelect = document.createElement("select");
    resumeSelect.setAttribute("aria-label", "Select primary resume");
    Object.assign(resumeSelect.style, {
      width: "100%", border: "1px solid #cbd5e1", borderRadius: "8px",
      background: "#f8fafc", color: "#0f172a", fontSize: "12px",
      padding: "7px 8px", outline: "none",
    });

    if (resumes.length === 0) {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "No resumes uploaded";
      resumeSelect.appendChild(opt); resumeSelect.disabled = true;
    } else {
      resumes.forEach((r) => {
        const opt = document.createElement("option");
        opt.value = r.id || r.label; opt.textContent = r.label;
        resumeSelect.appendChild(opt);
      });
      resumeSelect.addEventListener("change", () => {
        selectedResumeData = resumes.find((r) => (r.id || r.label) === resumeSelect.value) || null;
      });
    }
    resumeCard.appendChild(resumeSelect);

    // ==================== 4. FIELD PROGRESS (live tracker) ====================
    const progressCard = card();
    progressCard.id = "jaos-field-progress";

    const renderFieldProgress = (state, fillWarnings = [], v2FieldLabels = null) => {
      // state: "idle" | "filling" | "done"
      // fillWarnings: Array<{ field, message, type }> from adapter fillCustom
      // v2FieldLabels: Array<{ label, isFilled, isRequired? }> from V2 engine
      const domScan = scanRequiredFields();
      const useV2 = v2FieldLabels && v2FieldLabels.length > 0;
      const fields = useV2 ? v2FieldLabels : domScan.fields;
      const total = useV2 ? v2FieldLabels.length : domScan.total;
      const filled = useV2 ? v2FieldLabels.filter((f) => f.isFilled).length : domScan.filled;
      progressCard.innerHTML = "";

      if (state === "idle" || (total === 0 && state !== "done")) {
        progressCard.style.display = "none";
        return;
      }
      progressCard.style.display = "flex";
      Object.assign(progressCard.style, { maxHeight: "320px", overflowY: "auto" });

      // Split into required vs optional
      const requiredFields = useV2 ? fields.filter((f) => f.isRequired) : fields;
      const optionalFields = useV2 ? fields.filter((f) => !f.isRequired) : [];
      const reqFilled = requiredFields.filter((f) => f.isFilled).length;
      const reqTotal = requiredFields.length;
      const optFilled = optionalFields.filter((f) => f.isFilled).length;
      const optTotal = optionalFields.length;

      const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
      // "missing" = unfilled REQUIRED + warnings. Optional unfilled fields are not "missing".
      const reqMissed = reqTotal - reqFilled;
      const allDone = reqMissed === 0 && fillWarnings.length === 0;
      const missedCount = reqMissed + fillWarnings.length;

      // ── Header: total fields count + status badge ──
      const headerRow = document.createElement("div");
      Object.assign(headerRow.style, { display: "flex", justifyContent: "space-between", alignItems: "center" });

      const headerLabel = document.createElement("div");
      if (state === "filling") {
        headerLabel.textContent = "Filling fields...";
      } else if (allDone) {
        headerLabel.textContent = `All ${reqTotal} required filled`;
      } else {
        headerLabel.textContent = `${reqFilled} of ${reqTotal} required filled`;
      }
      Object.assign(headerLabel.style, {
        fontSize: "12px", fontWeight: "700",
        color: allDone ? "#059669" : state === "filling" ? "#2563eb" : "#1f2937",
      });

      const statusBadge = document.createElement("div");
      if (state === "filling") {
        statusBadge.textContent = "Working...";
      } else if (allDone) {
        statusBadge.textContent = "Complete";
      } else if (fillWarnings.length > 0 && missedCount === fillWarnings.length) {
        statusBadge.textContent = `${fillWarnings.length} need attention`;
      } else {
        statusBadge.textContent = missedCount > 0 ? `${missedCount} missing` : "Done";
      }
      Object.assign(statusBadge.style, {
        fontSize: "10px", fontWeight: "600",
        color: allDone ? "#059669" : state === "filling" ? "#2563eb" : missedCount > 0 ? "#dc2626" : "#059669",
        background: allDone ? "#ecfdf5" : state === "filling" ? "#dbeafe" : missedCount > 0 ? "#fef2f2" : "#ecfdf5",
        borderRadius: "999px", padding: "2px 7px",
      });

      headerRow.appendChild(headerLabel);
      headerRow.appendChild(statusBadge);
      progressCard.appendChild(headerRow);

      // ── Overall progress bar ──
      const track = document.createElement("div");
      Object.assign(track.style, {
        width: "100%", height: "6px", borderRadius: "999px",
        background: "#e5e7eb", overflow: "hidden",
      });
      const bar = document.createElement("div");
      const reqPct = reqTotal > 0 ? Math.round((reqFilled / reqTotal) * 100) : pct;
      Object.assign(bar.style, {
        width: state === "filling" ? "60%" : `${reqPct}%`,
        height: "100%", borderRadius: "999px",
        background: allDone ? "#059669" : "linear-gradient(90deg, #2563eb, #3b82f6)",
        transition: "width 0.4s ease",
      });
      if (state === "filling") {
        bar.style.animation = "jaos-pulse 1.2s ease-in-out infinite";
      }
      track.appendChild(bar);
      progressCard.appendChild(track);

      if (state === "filling") return;

      // ── Helper: field list item (checkmark or dot) ──
      const makeFieldRow = (f, isMissed) => {
        const row = document.createElement("div");
        Object.assign(row.style, {
          display: "flex", alignItems: "center", gap: "6px",
          fontSize: "11px", lineHeight: "1.4",
          color: isMissed ? "#dc2626" : "#059669",
        });
        const icon = document.createElement("span");
        icon.textContent = isMissed ? "\u25CB" : "\u2713";
        Object.assign(icon.style, { fontSize: isMissed ? "8px" : "10px", flexShrink: "0", width: "12px", textAlign: "center" });
        const lbl = document.createElement("span");
        lbl.textContent = f.label.replace(/\*/g, "").trim();
        Object.assign(lbl.style, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
        row.appendChild(icon);
        row.appendChild(lbl);
        return row;
      };

      // ── Helper: section with header + mini bar + field list ──
      const makeSection = (title, fieldList, filledCount, totalCount, accentColor) => {
        const section = document.createElement("div");
        Object.assign(section.style, { marginTop: "8px" });

        // Section header row
        const sectionHeader = document.createElement("div");
        Object.assign(sectionHeader.style, { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" });

        const sectionLabel = document.createElement("span");
        sectionLabel.textContent = title;
        Object.assign(sectionLabel.style, { fontSize: "11px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px" });

        const sectionCount = document.createElement("span");
        const sectionAllFilled = filledCount === totalCount;
        sectionCount.textContent = `${filledCount} of ${totalCount}`;
        Object.assign(sectionCount.style, {
          fontSize: "11px", fontWeight: "600",
          color: sectionAllFilled ? "#059669" : accentColor,
        });

        sectionHeader.appendChild(sectionLabel);
        sectionHeader.appendChild(sectionCount);
        section.appendChild(sectionHeader);

        // Mini progress bar
        const miniTrack = document.createElement("div");
        Object.assign(miniTrack.style, {
          width: "100%", height: "3px", borderRadius: "999px",
          background: "#f3f4f6", overflow: "hidden", marginBottom: "4px",
        });
        const miniBar = document.createElement("div");
        const miniPct = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;
        Object.assign(miniBar.style, {
          width: `${miniPct}%`, height: "100%", borderRadius: "999px",
          background: sectionAllFilled ? "#059669" : accentColor,
          transition: "width 0.4s ease",
        });
        miniTrack.appendChild(miniBar);
        section.appendChild(miniTrack);

        // Field list
        const list = document.createElement("div");
        Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "2px" });

        // Show missed fields first, then filled
        const missedInSection = fieldList.filter((f) => !f.isFilled);
        const filledInSection = fieldList.filter((f) => f.isFilled);
        missedInSection.forEach((f) => list.appendChild(makeFieldRow(f, true)));
        filledInSection.forEach((f) => list.appendChild(makeFieldRow(f, false)));

        section.appendChild(list);
        return section;
      };

      // ── Required section ──
      // Show only missing required fields (red). If all filled, show compact summary.
      if (reqTotal > 0) {
        const missedRequired = requiredFields.filter((f) => !f.isFilled);
        if (missedRequired.length > 0) {
          // Show missed fields with full count context
          progressCard.appendChild(makeSection("Required — Missing", missedRequired, 0, missedRequired.length, "#dc2626"));
        }
        // Always show filled count in the header (handled above), no need to list filled fields individually
      }

      // ── Optional section — only show filled optional fields ──
      const filledOptionalFields = optionalFields.filter(f => f.isFilled);
      if (filledOptionalFields.length > 0) {
        progressCard.appendChild(makeSection("Optional", filledOptionalFields, filledOptionalFields.length, filledOptionalFields.length, "#8b5cf6"));
      }

      // ── Warnings — needs manual input (amber) ──
      if (fillWarnings.length > 0) {
        const warnSection = document.createElement("div");
        Object.assign(warnSection.style, { marginTop: "8px" });

        const warnHeader = document.createElement("div");
        Object.assign(warnHeader.style, {
          fontSize: "11px", fontWeight: "600", color: "#d97706", marginBottom: "3px",
        });
        warnHeader.textContent = "\u26A0 Needs manual input:";
        warnSection.appendChild(warnHeader);

        fillWarnings.forEach((w) => {
          const row = document.createElement("div");
          Object.assign(row.style, {
            fontSize: "11px", color: "#92400e",
            marginLeft: "8px", marginBottom: "3px",
            lineHeight: "1.3",
          });
          const fieldName = document.createElement("strong");
          fieldName.textContent = w.field;
          row.appendChild(fieldName);
          row.appendChild(document.createTextNode(" \u2014 " + w.message));
          warnSection.appendChild(row);
        });
        progressCard.appendChild(warnSection);
      }
    };

    // Initial scan
    renderFieldProgress("idle");

    // ==================== 5. AUTOFILL BUTTONS ====================
    let hasUploadedResume = false;

    // Shared button style helper
    const makeFillBtn = (text, bg) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = text;
      Object.assign(btn.style, {
        border: "none", borderRadius: "10px",
        background: bg,
        color: "#fff", fontSize: "13px", fontWeight: "700",
        padding: "10px 8px", cursor: "pointer",
        transition: "opacity 0.15s ease",
        flex: "1",
      });
      return btn;
    };

    // Container for the two buttons side by side
    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, {
      display: "flex", gap: "8px",
    });

    // ── DOM Fill Button (v1 — pure selectors + heuristic, no LLM) ──
    const domFillBtn = makeFillBtn("Autofill (DOM)", "linear-gradient(135deg, #2563eb, #1d4ed8)");

    // ── AI Fill Button (v2 — LLM-powered semantic mapping) ──
    const aiFillBtn = makeFillBtn("Autofill (AI)", "linear-gradient(135deg, #7c3aed, #5b21b6)");

    /**
     * Shared completion handler for both buttons.
     * @param {HTMLElement} btn - The button element
     * @param {string} defaultBg - Default background gradient
     * @param {string} defaultText - Default button label
     * @returns {function(boolean, Array?): Promise<void>}
     */
    const makeOnFillComplete = (btn, defaultBg, defaultText) => {
      return async (success, fillWarnings, v2FieldLabels) => {
        const resumeUploaded = await (hasUploadedResume
          ? Promise.resolve(true)
          : uploadResumeToFileInputs(selectedResumeData));
        if (resumeUploaded) hasUploadedResume = true;

        setTimeout(() => renderFieldProgress("done", fillWarnings || [], v2FieldLabels || null), 400);

        if (success) {
          btn.textContent = resumeUploaded ? "Done — Resume Attached" : "Done";
          btn.style.background = "#059669";
          btn.style.opacity = "1";
          setTimeout(() => {
            btn.textContent = defaultText;
            btn.style.background = defaultBg;
            btn.disabled = false;
          }, 3000);
        } else {
          btn.textContent = "Retry";
          btn.style.opacity = "1";
          btn.disabled = false;
        }
        // Re-enable the other button
        domFillBtn.disabled = false;
        domFillBtn.style.opacity = "1";
        aiFillBtn.disabled = false;
        aiFillBtn.style.opacity = "1";
      };
    };

    const disableBothBtns = () => {
      domFillBtn.disabled = true;
      domFillBtn.style.opacity = "0.7";
      aiFillBtn.disabled = true;
      aiFillBtn.style.opacity = "0.7";
    };

    // ── DOM Fill: pure v1 path, forceV1 flag, no LLM ──
    domFillBtn.addEventListener("click", () => {
      disableBothBtns();
      domFillBtn.textContent = "Filling...";
      renderFieldProgress("filling");

      console.log("[JAOS DOM] DOM Fill clicked");

      // Resume upload is handled in makeOnFillComplete after fill completes
      // (avoids duplicate uploads from both here and the completion handler)

      safeSendMessage(
        { type: "AUTOFILL_JOB", jobTitle, company: jobCompany, jobId, forceV1: true },
        async (response) => {
          const onComplete = makeOnFillComplete(domFillBtn, "linear-gradient(135deg, #2563eb, #1d4ed8)", "Autofill (DOM)");
          await onComplete(response && response.ok, response?.warnings);
        }
      );
    });

    // ── AI Fill: v2 engine with proper logging ──
    aiFillBtn.addEventListener("click", () => {
      disableBothBtns();
      aiFillBtn.textContent = "Checking...";
      renderFieldProgress("filling");

      console.log("[JAOS AI] AI Fill clicked");
      aiFillBtn.textContent = "Filling (AI)...";

      const aiBtnBg = "linear-gradient(135deg, #7c3aed, #5b21b6)";

      // Step 1: Fetch profile (LLM is handled server-side, no API key config needed)
      safeSendMessage({ type: "JAOS_FETCH_PROFILE" }, async (response) => {
        if (!response || !response.ok) {
          console.error("[JAOS AI] Profile fetch failed:", response?.error);
          const onComplete = makeOnFillComplete(aiFillBtn, aiBtnBg, "Autofill (AI)");
          await onComplete(false);
          return;
        }

        const profile = response.profile || {};
        const jobCtx = { title: jobTitle, company: jobCompany, jobId };

        console.log("[JAOS AI] Profile loaded:", profile.first_name, profile.last_name);

        // Step 2: Try v2 engine directly in current frame first
        if (hasV2Engine() && hasV2AdapterMatch()) {
          console.log("[JAOS AI] v2 adapter matched in current frame, running directly...");
          try {
            const result = await runV2Engine(profile, jobCtx);
            console.log("[JAOS AI] Fill complete:", result);
            console.log(`[JAOS AI] Filled: ${result.filled}/${result.scanned}, Errors: ${result.errors.length}`);
            if (result.errors.length > 0) console.log("[JAOS AI] Errors:", result.errors);
            if (profile.cover_letter) uploadCoverLetterFile(profile.cover_letter);
            const onComplete = makeOnFillComplete(aiFillBtn, aiBtnBg, "Autofill (AI)");
            await onComplete(result.filled > 0, [], result.fieldLabels);
            return;
          } catch (err) {
            console.error("[JAOS AI] Direct v2 engine failed:", err);
          }
        }

        // Step 3: No v2 adapter in current frame (form may be in an iframe).
        // Broadcast JAOS_V2_FILL through background → all frames will check.
        console.log("[JAOS AI] No v2 adapter in current frame, broadcasting to all frames...");

        // Listen for completion from iframe
        const onV2Done = (msg) => {
          if (msg?.type === "JAOS_V2_FILL_DONE") {
            chrome.runtime.onMessage.removeListener(onV2Done);
            clearTimeout(v2Timeout);
            console.log("[JAOS AI] Received fill result from iframe:", msg);
            const onComplete = makeOnFillComplete(aiFillBtn, aiBtnBg, "Autofill (AI)");
            onComplete(msg.filled > 0);
          }
        };
        chrome.runtime.onMessage.addListener(onV2Done);

        // Timeout: if no response in 35s, give up
        const v2Timeout = setTimeout(() => {
          chrome.runtime.onMessage.removeListener(onV2Done);
          console.log("[JAOS AI] V2 fill timed out (35s), no response from any frame");
          const onComplete = makeOnFillComplete(aiFillBtn, aiBtnBg, "Autofill (AI)");
          onComplete(false);
        }, 35000);

        safeSendMessage({
          type: "JAOS_V2_FILL",
          jobTitle, company: jobCompany, jobId,
        });
      });
    });

    btnRow.appendChild(domFillBtn);
    btnRow.appendChild(aiFillBtn);

    // Inject pulse animation for the progress bar
    if (!document.getElementById("jaos-keyframes")) {
      const style = document.createElement("style");
      style.id = "jaos-keyframes";
      style.textContent = `@keyframes jaos-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }`;
      document.head.appendChild(style);
    }

    // ==================== ASSEMBLE ====================
    panelBody.appendChild(profileCard);
    panelBody.appendChild(jobCard);
    panelBody.appendChild(btnRow);
    panelBody.appendChild(resumeCard);
    panelBody.appendChild(progressCard);
  };

  const requestBootstrap = () =>
    new Promise((resolve) => {
      safeSendMessage(
        {
          type: "JAOS_FETCH_BOOTSTRAP",
          jobId: selectedJobContext.jobId || "",
        },
        (response) => {
          resolve(response || { ok: false, authenticated: false, error: "No response" });
        }
      );
    });

  const loadPanelData = async () => {
    await resolveJobContextForCurrentPage();
    renderLoadingView();

    // Race bootstrap against a 5s timeout so the panel never hangs
    const BOOTSTRAP_TIMEOUT_MS = 5000;
    const timeout = new Promise((resolve) =>
      setTimeout(() => resolve({ ok: false, timedOut: true }), BOOTSTRAP_TIMEOUT_MS)
    );
    const result = await Promise.race([requestBootstrap(), timeout]);

    if (result && result.timedOut) {
      renderAuthView("Sync timed out. Please check your connection and try again.");
      return;
    }

    if (!result || result.ok !== true || result.authenticated !== true) {
      const errorText = result && result.error ? String(result.error) : "";
      renderAuthView(errorText);
      return;
    }

    renderMainView(result.data || {});
  };

  const createLauncher = () => {
    if (!isPinned) {
      return null;
    }

    const existingWrap = document.getElementById(LAUNCHER_WRAP_ID);
    if (existingWrap) {
      return existingWrap;
    }

    const wrap = document.createElement("div");
    wrap.id = LAUNCHER_WRAP_ID;
    Object.assign(wrap.style, {
      position: "fixed",
      right: "0px",
      top: LAUNCHER_DOCK_TOP,
      transform: "translateY(-50%)",
      width: "66px",
      height: "66px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "999999",
      transition: "opacity 140ms ease",
      touchAction: "none",
    });

    const launcher = document.createElement("button");
    launcher.id = LAUNCHER_ID;
    launcher.type = "button";
    launcher.setAttribute("aria-label", "Open JAOS panel");
    Object.assign(launcher.style, {
      width: "60px",
      height: "60px",
      border: "none",
      borderRadius: "50%",
      background: "#16a34a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: "0 8px 22px rgba(0, 0, 0, 0.22)",
      padding: "0",
    });

    const img = document.createElement("img");
    img.src = chrome.runtime.getURL("icons/icon-48.png");
    img.alt = "JAOS";
    Object.assign(img.style, {
      width: "28px",
      height: "28px",
      pointerEvents: "none",
    });
    img.addEventListener("error", () => {
      img.src = chrome.runtime.getURL("icons/icon48.png");
    });
    launcher.appendChild(img);

    const unpinBtn = document.createElement("button");
    unpinBtn.id = UNPIN_ID;
    unpinBtn.type = "button";
    unpinBtn.setAttribute("aria-label", "Unpin JAOS floating logo");
    unpinBtn.textContent = "x";
    Object.assign(unpinBtn.style, {
      position: "absolute",
      top: "-6px",
      left: "4px",
      width: "20px",
      height: "20px",
      border: "1px solid #cbd5e1",
      borderRadius: "999px",
      background: "#ffffff",
      color: "#475569",
      fontSize: "12px",
      fontWeight: "700",
      lineHeight: "1",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      opacity: "0",
      pointerEvents: "none",
      transition: "opacity 120ms ease",
    });

    wrap.addEventListener("mouseenter", () => {
      unpinBtn.style.opacity = "1";
      unpinBtn.style.pointerEvents = "auto";
    });

    wrap.addEventListener("mouseleave", () => {
      unpinBtn.style.opacity = "0";
      unpinBtn.style.pointerEvents = "none";
    });

    unpinBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      isPinned = false;
      wrap.remove();
      launcherWrap = null;
    });

    let pointerId = null;
    let isDragging = false;
    let dragStartY = 0;
    let startTopPx = 0;
    let suppressClick = false;
    let moved = false;

    const readCurrentTopPx = () => {
      const rawTop = wrap.style.top || "";
      if (rawTop.endsWith("%")) {
        return (window.innerHeight * parseFloat(rawTop)) / 100;
      }
      if (rawTop.endsWith("px")) {
        return parseFloat(rawTop);
      }
      const numeric = parseFloat(rawTop);
      return Number.isNaN(numeric) ? window.innerHeight / 2 : numeric;
    };

    launcher.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      isDragging = true;
      moved = false;
      dragStartY = event.clientY;
      startTopPx = readCurrentTopPx();
      launcher.setPointerCapture(pointerId);
      launcher.style.cursor = "grabbing";
      event.preventDefault();
    });

    launcher.addEventListener("pointermove", (event) => {
      if (!isDragging || event.pointerId !== pointerId) {
        return;
      }

      const deltaY = event.clientY - dragStartY;
      if (Math.abs(deltaY) > 3) {
        moved = true;
      }

      const half = 33;
      const minTop = half + 8;
      const maxTop = window.innerHeight - half - 8;
      const nextTop = Math.min(Math.max(startTopPx + deltaY, minTop), maxTop);
      wrap.style.top = `${nextTop}px`;
    });

    const endDrag = (event) => {
      if (!isDragging || event.pointerId !== pointerId) {
        return;
      }
      isDragging = false;
      if (launcher.hasPointerCapture(pointerId)) {
        launcher.releasePointerCapture(pointerId);
      }
      pointerId = null;
      launcher.style.cursor = "pointer";
      if (moved) {
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    };

    launcher.addEventListener("pointerup", endDrag);
    launcher.addEventListener("pointercancel", endDrag);

    launcher.addEventListener("click", () => {
      if (suppressClick) {
        return;
      }
      showPanel();
    });

    wrap.appendChild(launcher);
    wrap.appendChild(unpinBtn);

    const mountTarget = getMountTarget();
    mountTarget.appendChild(wrap);
    return wrap;
  };

  const ensureLauncher = (forcePinned = false) => {
    if (forcePinned) {
      isPinned = true;
    }
    if (!isPinned) {
      return null;
    }

    launcherWrap = launcherWrap || createLauncher();
    if (!launcherWrap) {
      return null;
    }
    if (!launcherWrap.isConnected) {
      getMountTarget().appendChild(launcherWrap);
    }
    return launcherWrap;
  };

  const showDockedLauncher = () => {
    const wrap = ensureLauncher(true);
    if (!wrap) {
      return;
    }
    wrap.style.top = LAUNCHER_DOCK_TOP;
    wrap.style.opacity = "1";
    wrap.style.pointerEvents = "auto";
  };

  const setLauncherVisible = (visible) => {
    const wrap = ensureLauncher(false);
    if (!wrap) {
      return;
    }

    wrap.style.opacity = visible ? "1" : "0";
    wrap.style.pointerEvents = visible ? "auto" : "none";
  };

  const showPanel = () => {
    panel = panel || createPanel();
    panel.style.transform = "translateX(0)";
    isOpen = true;
    setLauncherVisible(false);
    void loadPanelData();
  };

  const hidePanel = ({ forceDockLauncher = false } = {}) => {
    if (!panel) {
      panel = document.getElementById(PANEL_ID);
    }
    if (!panel) {
      isOpen = false;
      if (forceDockLauncher) {
        showDockedLauncher();
      } else {
        setLauncherVisible(true);
      }
      return;
    }

    panel.style.transform = "translateX(calc(100% + 28px))";
    isOpen = false;
    if (forceDockLauncher) {
      showDockedLauncher();
    } else {
      setLauncherVisible(true);
    }
  };

  const togglePanel = () => {
    if (isOpen) {
      hidePanel();
    } else {
      showPanel();
    }
  };

  const initialize = () => {
    if (!isTopFrame) return;
    if (isPinned) {
      launcherWrap = createLauncher();
      setLauncherVisible(true);
    }
    bindJobsApplyAutoOpen();
    void maybeAutoOpenPanelFromApply();
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "AUTOFILL_JOB") {
      if (typeof message.jobTitle === "string" || typeof message.company === "string") {
        setSelectedJobContext(
          {
            title: message.jobTitle,
            company: message.company,
            jobId: message.jobId || "",
          },
          "autofill"
        );
      }

      const profile = message.profile || {};

      // runDomAutofill is async (awaits fillCustom), so call sendResponse when done
      (async () => {
        const result = await runDomAutofill(profile, { forceV1: !!message.forceV1 });

        // Upload cover letter as .txt file if a cover-letter file input exists
        if (profile.cover_letter) {
          uploadCoverLetterFile(profile.cover_letter);
        }

        sendResponse?.({ ok: true, ...result });
      })();
      return true; // Keep message channel open for async sendResponse
    }

    // ── V2 AI fill (broadcast to all frames by background) ──
    if (message.type === "JAOS_V2_FILL") {
      // Only run in frames where v2 engine is loaded and adapter matches
      if (!hasV2Engine() || !hasV2AdapterMatch()) {
        sendResponse?.({ ok: false, skipped: true, reason: "no v2 adapter match in this frame" });
        return true;
      }

      const profile = message.profile || {};
      const jobCtx = {
        title: message.jobTitle || "",
        company: message.company || "",
        jobId: message.jobId || "",
      };

      console.log("[JAOS V2 Frame] v2 adapter matched, running AI fill in this frame");

      // Run async — respond immediately, then fill
      (async () => {
        try {
          const result = await runV2Engine(profile, jobCtx);
          console.log("[JAOS V2 Frame] Fill complete:", result);
          // Notify parent frame via background that fill is done
          try {
            chrome.runtime.sendMessage({
              type: "JAOS_V2_FILL_DONE",
              filled: result.filled,
              scanned: result.scanned,
              errors: result.errors,
              ats: result.ats,
            });
          } catch (_e) { /* ignore */ }
        } catch (err) {
          console.error("[JAOS V2 Frame] Engine error:", err);
        }
      })();

      sendResponse?.({ ok: true, started: true });
      return true;
    }

    if (!isTopFrame) return;

    if (message.type === "JAOS_TOGGLE_PANEL") {
      togglePanel();
      sendResponse?.({ ok: true, isOpen, isPinned });
      return true;
    }

    if (message.type === "JAOS_OPEN_PANEL") {
      showPanel();
      sendResponse?.({ ok: true, isOpen, isPinned });
      return true;
    }

    if (message.type === "JAOS_CLOSE_PANEL") {
      hidePanel();
      sendResponse?.({ ok: true, isOpen, isPinned });
      return true;
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
