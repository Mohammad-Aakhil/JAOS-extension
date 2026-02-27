/**
 * engine/mapper.js — LLM-based semantic field mapper
 *
 * Content script that bridges between the scanner and the LLM (via background.js).
 * Takes scanned field metadata + user profile → sends to LLM → returns mappings.
 *
 * The LLM interprets field labels/questions semantically and decides:
 *  - Which profile value maps to which field
 *  - What option to select for dropdowns
 *  - What answer to generate for custom questions
 *
 * Registers: window.__jaosMapper
 */
(() => {
  if (window.__jaosMapper) return;

  /**
   * Send a message to background.js and get a response.
   */
  const sendToBackground = (message) =>
    new Promise((resolve) => {
      try {
        if (!chrome.runtime?.id) {
          resolve({ ok: false, error: "Extension context invalidated" });
          return;
        }
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "No response" });
        });
      } catch (err) {
        resolve({ ok: false, error: err.message });
      }
    });

  /**
   * Build the system prompt for the field mapping LLM call.
   */
  const SYSTEM_PROMPT = `You are a job application autofill assistant. Your task is to map form fields to user profile values.

You receive:
1. A list of form fields with metadata (label, placeholder, type, options, section context)
2. The user's profile data (name, email, education, work experience, etc.)

For each field, decide:
- Which profile value best matches this field (if any)
- For dropdowns/selects: which option to choose from the available options
- For text fields: what value to enter
- For checkboxes: true or false
- For custom questions: generate a concise, professional answer using the profile data
- For file inputs: skip (set to null)

Rules:
- ONLY return mappings for fields that have a clear match. Skip ambiguous fields.
- For select/dropdown fields, return the EXACT option text from the provided options list.
- For yes/no or boolean questions, return "Yes" or "No".
- For demographic/EEO fields (gender, race, veteran, disability), use the profile values if provided.
- If a field already has a value (currentValue is set), skip it unless the value is clearly wrong.
- For salary fields, use the number only (no currency symbols).
- For date fields, match the expected format from the options or placeholder.
- For "How did you hear about us" / referral source, use the profile value.
- Keep generated answers concise and professional (1-2 sentences max).
- For phone country code fields, return the appropriate country code.

IMPORTANT: Respond with ONLY raw JSON (no markdown, no code blocks, no explanation). The exact format:
{"mappings":[{"uid":"<field_uid>","value":"<value_to_fill>","confidence":<0.0-1.0>}]}

Only include fields where you have a mapping. Omit fields with no match.
Set confidence to how certain you are: 1.0 = exact match, 0.7+ = likely match, <0.5 = uncertain.
Do NOT wrap your response in \`\`\`json or any other formatting. Return ONLY the JSON object.`;

  /**
   * Build the user prompt with profile data and scanned fields.
   */
  const buildUserPrompt = (serializedFields, profile, jobContext) => {
    // Build a clean profile summary for the LLM
    const profileSummary = {
      first_name: profile.first_name,
      last_name: profile.last_name,
      full_name: profile.name,
      email: profile.email,
      phone: profile.phone,
      linkedin: profile.linkedin,
      github: profile.github,
      portfolio: profile.portfolio,
      city: profile.city,
      state: profile.state,
      country: profile.country,
      current_title: profile.current_title,
      current_company: profile.current_company,
      years_experience: profile.years_experience,
      summary: profile.summary,
      // Education
      degree: profile.degree,
      school: profile.school,
      field_of_study: profile.field_of_study,
      gpa: profile.gpa,
      edu_start_year: profile.edu_start_year,
      edu_start_month: profile.edu_start_month,
      edu_end_year: profile.edu_end_year,
      edu_end_month: profile.edu_end_month,
      // Work dates
      exp_start_year: profile.exp_start_year,
      exp_start_month: profile.exp_start_month,
      exp_end_year: profile.exp_end_year,
      exp_end_month: profile.exp_end_month,
      // Preferences
      is_over_18: profile.is_over_18,
      work_authorization: profile.work_authorization,
      requires_sponsorship: profile.requires_sponsorship,
      fluent_in_english: profile.fluent_in_english,
      gender: profile.gender,
      race_ethnicity: profile.race_ethnicity,
      veteran_status: profile.veteran_status,
      disability_status: profile.disability_status,
      willing_to_relocate: profile.willing_to_relocate,
      desired_salary: profile.desired_salary,
      notice_period: profile.notice_period,
      available_start_date: profile.available_start_date,
      referral_source: profile.referral_source,
      cover_letter: profile.cover_letter ? "(available)" : "",
      skills: profile.skills_list?.join(", ") || "",
    };

    // Remove empty values for cleaner context
    const cleanProfile = Object.fromEntries(
      Object.entries(profileSummary).filter(([, v]) => v !== "" && v !== undefined && v !== null)
    );

    const prompt = {
      job_context: jobContext || {},
      user_profile: cleanProfile,
      form_fields: serializedFields.fields || [],
      custom_widgets: serializedFields.widgets || [],
    };

    return JSON.stringify(prompt, null, 2);
  };

  /**
   * Request field mappings from the LLM via background.js.
   *
   * @param {object} serializedFields — From scanner.serializeForLLM()
   * @param {object} profile — User profile data
   * @param {object} [jobContext] — Current job context
   * @returns {Promise<{ok: boolean, mappings?: Array, error?: string}>}
   */
  const requestMappings = async (serializedFields, profile, jobContext) => {
    const userPrompt = buildUserPrompt(serializedFields, profile, jobContext);

    const response = await sendToBackground({
      type: "JAOS_LLM_MAP_FIELDS",
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: userPrompt,
    });

    if (!response.ok) {
      console.error("[JAOS Mapper] LLM call failed:", response.error);
      return { ok: false, error: response.error || "LLM mapping request failed" };
    }

    const data = response.data;
    console.log("[JAOS Mapper] LLM response data:", data);

    if (!data?.mappings || !Array.isArray(data.mappings)) {
      console.error("[JAOS Mapper] Invalid LLM response — expected {mappings:[...]}, got:", JSON.stringify(data).slice(0, 300));
      return { ok: false, error: "Invalid LLM response: missing mappings array" };
    }

    // Filter out low-confidence mappings
    const filtered = data.mappings.filter(
      (m) => m.uid && m.value !== null && m.value !== undefined && (m.confidence ?? 1) >= 0.5
    );

    return { ok: true, mappings: filtered };
  };

  /**
   * Create a uid → field/widget lookup map from a scan result.
   */
  const buildElementLookup = (scanResult) => {
    const lookup = new Map();
    for (const f of scanResult.fields) {
      lookup.set(f.uid, f);
    }
    for (const w of scanResult.widgets) {
      lookup.set(w.uid, w);
    }
    return lookup;
  };

  window.__jaosMapper = {
    requestMappings,
    buildElementLookup,
    buildUserPrompt,
    SYSTEM_PROMPT,
  };
})();
