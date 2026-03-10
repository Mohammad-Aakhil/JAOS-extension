const JAOS_API_BASE_URL = "http://localhost:8000";

const TOGGLE_MESSAGE = { type: "JAOS_TOGGLE_PANEL" };
const OPEN_MESSAGE = { type: "JAOS_OPEN_PANEL" };
const AUTOFILL_MESSAGE_TYPE = "AUTOFILL_JOB";
const AUTO_OPEN_FLAG_KEY = "jaos_auto_open_panel_next_page";
const AUTO_OPEN_TTL_MS = 2 * 60 * 1000;
const PROFILE_CACHE_TTL_MS = 60 * 1000;

let _profileCache = null;
let _profileCacheExpiry = 0;

const sendMessageToTab = (tabId, message) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });

const injectContentScript = async (tabId) => {
  // Inject MAIN world bridge first (React Fiber access for react-select fills)
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["engine/fiber-bridge.js"],
    world: "MAIN",
  });
  // Then inject ISOLATED world content scripts
  return chrome.scripting.executeScript({
    target: { tabId },
    files: [
      // V1 adapters (legacy — still used for non-v2 portals)
      "adapters/greenhouse.js",
      "adapters/lever.js",
      "adapters/workday.js",
      "adapters/icims.js",
      "adapters/smartrecruiters.js",
      "adapters/ashby.js",
      "adapters/bamboohr.js",
      "adapters/paylocity.js",
      "adapters/taleo.js",
      "adapters/jobvite.js",
      // V2 engine modules (must load before orchestrator and v2 adapters)
      "engine/scanner.js",
      "engine/filler.js",
      "engine/mapper.js",
      "engine/orchestrator.js",
      // V2 adapters
      "adapters/greenhouse-v2.js",
      "adapters/workday-v2.js",
      "adapters/bamboohr-v2.js",
      "adapters/smartrecruiters-v2.js",
      "adapters/ashby-v2.js",
      "adapters/oraclecloud-v2.js",
      // Main content script (must be last)
      "content.js",
    ],
  });
};

const getActiveTabId = async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0]?.id ?? null;
};

const fetchJsonWithCookies = async (path) => {
  const response = await fetch(`${JAOS_API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_error) {
    payload = null;
  }

  return { ok: response.ok, status: response.status, payload };
};

const normalizeResumes = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.resumes)) return payload.resumes;
  return [];
};

const fetchAutofillProfile = async () => {
  if (_profileCache && Date.now() < _profileCacheExpiry) {
    return { ok: true, profile: _profileCache };
  }

  const meResult = await fetchJsonWithCookies("/api/v1/auth/me");
  if (meResult.status === 401 || meResult.status === 403) {
    return { ok: false, error: "Not authenticated" };
  }
  if (!meResult.ok || !meResult.payload) {
    return { ok: false, error: `Auth check failed (${meResult.status})` };
  }

  const [profileResult, userProfileResult, autofillPrefsResult] = await Promise.all([
    fetchJsonWithCookies("/api/v1/profile/"),
    fetchJsonWithCookies("/api/v1/user-profile/"),
    fetchJsonWithCookies("/api/v1/autofill-preferences/"),
  ]);

  const me = meResult.payload;
  const prof = profileResult.ok ? profileResult.payload || {} : {};
  const up = userProfileResult.ok ? userProfileResult.payload || {} : {};
  const ap = autofillPrefsResult.ok ? autofillPrefsResult.payload || {} : {};
  const social = up.social_links || {};
  const firstEdu =
    Array.isArray(up.education) && up.education[0] ? up.education[0] : {};
  const firstExp =
    Array.isArray(up.experience) && up.experience[0] ? up.experience[0] : {};

  const boolToYesNo = (val) =>
    val === true ? "Yes" : val === false ? "No" : "";

  const parseYearMonth = (dateStr) => {
    if (!dateStr) return { month: "", year: "" };
    const parts = String(dateStr).split("-");
    return { year: parts[0] || "", month: parts[1] || "" };
  };

  const eduStart = parseYearMonth(firstEdu.start_year);
  const eduEnd = parseYearMonth(firstEdu.end_year);
  const expStart = parseYearMonth(firstExp.start_date);
  const expEnd = parseYearMonth(
    /present|current/i.test(firstExp.end_date || "") ? "" : firstExp.end_date
  );

  const fullName = me.full_name || "";
  const nameParts = fullName.trim().split(/\s+/);

  // Normalize skill entries (may be {name: str} objects or plain strings)
  const normalizeSkills = (skills) => {
    if (!Array.isArray(skills)) return [];
    return skills.map((s) => (typeof s === "string" ? s : s.name || "")).filter(Boolean);
  };

  const profile = {
    name: fullName,
    first_name: nameParts[0] || "",
    last_name: nameParts.length > 1 ? nameParts.slice(1).join(" ") : "",
    email: me.email || "",
    phone: prof.phone || "",

    linkedin: prof.linkedin_url || social.linkedin || "",
    github: prof.github_url || social.github || "",
    portfolio: prof.portfolio_url || social.website || "",

    city: up.city || "",
    state: up.state || "",
    country: up.country || "United States",
    street_address: up.street_address || "",
    zip_code: up.zip_code || "",

    years_experience:
      up.years_experience != null ? String(up.years_experience) : "",
    current_title: up.headline || firstExp.role || "",

    summary: up.summary || "",

    // Flat fields for first entry (backward compat with heuristic fill + other adapters)
    degree: firstEdu.degree || "",
    school: firstEdu.institution || "",
    field_of_study: firstEdu.field_of_study || "",
    gpa: firstEdu.gpa || "",

    edu_start_year: eduStart.year,
    edu_start_month: eduStart.month,
    edu_end_year: eduEnd.year,
    edu_end_month: eduEnd.month,

    exp_start_year: expStart.year,
    exp_start_month: expStart.month,
    exp_end_year: expEnd.year,
    exp_end_month: expEnd.month,
    exp_is_current:
      Boolean(firstExp.is_current) ||
      /present|current/i.test(firstExp.end_date || ""),

    // Full arrays for multi-entry adapters (Workday, etc.)
    education_entries: Array.isArray(up.education) ? up.education : [],
    experience_entries: Array.isArray(up.experience) ? up.experience : [],
    internship_entries: Array.isArray(up.internships) ? up.internships : [],
    language_entries: Array.isArray(up.languages) ? up.languages : [],
    skills_list: normalizeSkills(up.skills),

    // Autofill preferences take priority, user_profile as fallback
    is_over_18: boolToYesNo(ap.is_over_18),
    work_authorization: ap.work_authorization || up.work_authorization || "",
    requires_sponsorship: boolToYesNo(ap.requires_sponsorship),
    fluent_in_english: boolToYesNo(ap.fluent_in_english),
    gender: ap.gender || up.gender || "",
    race_ethnicity: ap.race_ethnicity || "",
    veteran_status: ap.veteran_status || "",
    disability_status: ap.disability_status || "",
    hispanic_latino: ap.hispanic_latino || "",
    pronouns: ap.pronouns || "",
    willing_to_relocate: boolToYesNo(ap.willing_to_relocate),
    desired_salary: ap.desired_salary || up.salary_expectation || "",
    salary_currency: ap.salary_currency || "USD",
    salary_period: ap.salary_period || "yearly",
    notice_period: ap.notice_period || up.notice_period || "",
    available_start_date: ap.available_start_date || "",
    current_company: ap.current_employer || up.current_company || firstExp.company || "",
    referral_source: ap.referral_source || "",
    cover_letter: ap.cover_letter_default || up.cover_letter_template || "",
  };

  _profileCache = profile;
  _profileCacheExpiry = Date.now() + PROFILE_CACHE_TTL_MS;

  return { ok: true, profile };
};

const fetchJobById = async (jobId) => {
  if (!jobId || typeof jobId !== "string") {
    return { ok: false, error: "No job ID provided" };
  }
  const result = await fetchJsonWithCookies(`/api/v1/jobs/${jobId}`);
  if (!result.ok || !result.payload) {
    return { ok: false, error: `Failed to fetch job (${result.status})` };
  }
  return { ok: true, job: result.payload };
};

const sendAutofillToTab = async (tabId, jobData = {}) => {
  const profileResult = await fetchAutofillProfile();

  const payload = {
    type: AUTOFILL_MESSAGE_TYPE,
    profile: profileResult.ok ? profileResult.profile : {},
    jobTitle: typeof jobData?.jobTitle === "string" ? jobData.jobTitle : "",
    company: typeof jobData?.company === "string" ? jobData.company : "",
    forceV1: !!jobData?.forceV1,
  };

  try {
    return await sendMessageToTab(tabId, payload);
  } catch (_error) {
    await injectContentScript(tabId);
    return await sendMessageToTab(tabId, payload);
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  // ── LLM field mapping (content script → JAOS backend) ──
  // The backend fetches the user profile from DB and calls the LLM server-side,
  // so no API key configuration is needed in the extension.
  if (message.type === "JAOS_LLM_MAP_FIELDS") {
    (async () => {
      try {
        const response = await fetch(`${JAOS_API_BASE_URL}/api/v1/ai/map-fields`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: Array.isArray(message.fields) ? message.fields : [],
            widgets: Array.isArray(message.widgets) ? message.widgets : [],
            job_context: message.jobContext || null,
          }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          sendResponse({
            ok: false,
            error: `Backend returned ${response.status}: ${errText.slice(0, 200)}`,
          });
          return;
        }

        const result = await response.json();
        sendResponse(result);
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Map fields request failed",
        });
      }
    })();

    return true;
  }

  // ── Fetch profile directly (for v2 engine — content script needs profile in callback) ──
  if (message.type === "JAOS_FETCH_PROFILE") {
    (async () => {
      try {
        const result = await fetchAutofillProfile();
        if (!result.ok) {
          sendResponse({ ok: false, error: result.error || "Profile fetch failed" });
          return;
        }
        sendResponse({ ok: true, profile: result.profile });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Profile fetch failed",
        });
      }
    })();

    return true;
  }

  if (message.type === "JAOS_SET_AUTO_OPEN_MARKER") {
    (async () => {
      try {
        const marker =
          message.marker && typeof message.marker === "object"
            ? message.marker
            : {};
        const safeMarker = {
          expiresAt:
            typeof marker.expiresAt === "number" &&
            marker.expiresAt > Date.now()
              ? marker.expiresAt
              : Date.now() + AUTO_OPEN_TTL_MS,
          source: typeof marker.source === "string" ? marker.source : "",
          jobTitle: typeof marker.jobTitle === "string" ? marker.jobTitle : "",
          company: typeof marker.company === "string" ? marker.company : "",
          jobId: typeof marker.jobId === "string" ? marker.jobId : "",
        };

        await chrome.storage.local.set({ [AUTO_OPEN_FLAG_KEY]: safeMarker });
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to store auto-open marker",
        });
      }
    })();

    return true;
  }

  // ── V2 AI fill broadcast (sends to all frames in the tab) ──
  if (message.type === "JAOS_V2_FILL") {
    (async () => {
      try {
        const tabId = _sender?.tab?.id ?? (await getActiveTabId());
        if (!tabId) {
          sendResponse({ ok: false, error: "No active tab" });
          return;
        }

        // Fetch profile and attach it to the message
        const profileResult = await fetchAutofillProfile();
        const payload = {
          type: "JAOS_V2_FILL",
          profile: profileResult.ok ? profileResult.profile : {},
          jobTitle: message.jobTitle || "",
          company: message.company || "",
          jobId: message.jobId || "",
        };

        // Send to tab (reaches all frames due to all_frames: true)
        try {
          await sendMessageToTab(tabId, payload);
        } catch (_error) {
          await injectContentScript(tabId);
          await sendMessageToTab(tabId, payload);
        }

        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "V2 fill failed",
        });
      }
    })();

    return true;
  }

  // ── V2 fill completion relay (iframe → parent frame) ──
  if (message.type === "JAOS_V2_FILL_DONE") {
    (async () => {
      try {
        const tabId = _sender?.tab?.id ?? (await getActiveTabId());
        if (tabId) {
          // Relay to the top frame (where the panel is)
          await sendMessageToTab(tabId, message);
        }
      } catch (_e) { /* ignore relay errors */ }
    })();
    return false; // Don't need sendResponse
  }

  if (message.type === AUTOFILL_MESSAGE_TYPE) {
    (async () => {
      try {
        const tabId = _sender?.tab?.id ?? (await getActiveTabId());
        if (!tabId) {
          sendResponse({
            ok: false,
            error: "No active tab found for autofill",
          });
          return;
        }

        const tabResponse = await sendAutofillToTab(tabId, message);
        // Relay the content script's full response (includes filled count, warnings, etc.)
        sendResponse({ ok: true, ...(tabResponse || {}) });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Autofill failed",
        });
      }
    })();

    return true;
  }

  if (message.type === "JAOS_FETCH_JOB") {
    (async () => {
      try {
        const jobId =
          typeof message.jobId === "string" ? message.jobId : "";
        const result = await fetchJobById(jobId);
        sendResponse(result);
      } catch (error) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error ? error.message : "Failed to fetch job",
        });
      }
    })();

    return true;
  }

  if (message.type === "JAOS_FETCH_RESUME_FILE") {
    (async () => {
      try {
        const filePath =
          typeof message.filePath === "string" ? message.filePath : "";
        const filename =
          typeof message.filename === "string" ? message.filename : "resume.pdf";
        const mimeType =
          typeof message.mimeType === "string"
            ? message.mimeType
            : "application/pdf";

        if (!filePath) {
          sendResponse({ ok: false, error: "No file path provided" });
          return;
        }

        const response = await fetch(`${JAOS_API_BASE_URL}${filePath}`, {
          credentials: "include",
        });

        if (!response.ok) {
          sendResponse({
            ok: false,
            error: `Failed to fetch resume file (${response.status})`,
          });
          return;
        }

        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(",")[1] || "";
          sendResponse({
            ok: true,
            fileData: base64,
            filename,
            mimeType: blob.type || mimeType,
          });
        };
        reader.onerror = () => {
          sendResponse({ ok: false, error: "Failed to read file data" });
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch resume file",
        });
      }
    })();

    return true;
  }

  if (message.type !== "JAOS_FETCH_BOOTSTRAP") {
    return;
  }

  (async () => {
    try {
      // Fire auth check first — if it fails, skip everything else
      const meResult = await fetchJsonWithCookies("/api/v1/auth/me");

      if (meResult.status === 401 || meResult.status === 403) {
        sendResponse({ ok: true, authenticated: false });
        return;
      }

      if (!meResult.ok || !meResult.payload) {
        sendResponse({
          ok: false,
          authenticated: false,
          error: `Failed to fetch user profile (${meResult.status})`,
        });
        return;
      }

      // Run resumes, job, and user-profile fetch in parallel
      const jobId =
        typeof message.jobId === "string" ? message.jobId : "";

      const [resumesResult, jobResult, userProfileResult] = await Promise.all([
        fetchJsonWithCookies("/api/v1/resumes/").catch(() => ({ ok: false })),
        jobId
          ? fetchJobById(jobId).catch(() => ({ ok: false }))
          : Promise.resolve({ ok: false }),
        fetchJsonWithCookies("/api/v1/user-profile/").catch(() => ({ ok: false })),
      ]);

      const resumesRaw = resumesResult.ok
        ? normalizeResumes(resumesResult.payload)
        : [];
      const resumes = resumesRaw.map((resume) => ({
        id: resume.id || "",
        label: resume.filename || resume.name || "Untitled Resume",
        file_path: resume.file_path || "",
        mime_type: resume.mime_type || "",
      }));

      const job = jobResult.ok ? jobResult.job : null;
      const up = userProfileResult.ok ? userProfileResult.payload || {} : {};
      const me = meResult.payload;

      sendResponse({
        ok: true,
        authenticated: true,
        data: {
          user: {
            id: me.id || "",
            full_name: me.full_name || "",
            email: me.email || "",
            phone: me.phone || up.phone || "",
            headline: up.headline || "",
            city: up.city || "",
            state: up.state || "",
            country: up.country || "",
            skills: Array.isArray(up.skills) ? up.skills.map((s) => (typeof s === "string" ? s : s.name || "")).filter(Boolean).slice(0, 8) : [],
            years_experience: up.years_experience || 0,
          },
          resumes,
          job,
        },
      });
    } catch (error) {
      sendResponse({
        ok: false,
        authenticated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  })();

  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }

  try {
    await sendMessageToTab(tab.id, TOGGLE_MESSAGE);
  } catch (_error) {
    try {
      await injectContentScript(tab.id);
      await sendMessageToTab(tab.id, OPEN_MESSAGE);
    } catch (_injectError) {
      // Ignore unsupported pages like chrome:// and extension pages.
    }
  }
});
