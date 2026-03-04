/**
 * engine/mapper.js — LLM-based semantic field mapper
 *
 * Content script that bridges between the scanner and the JAOS backend.
 * Sends scanned field metadata to the backend, which fetches the user
 * profile from DB and calls the LLM server-side — no API key config needed.
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
   * Request field mappings from the backend via background.js.
   *
   * The backend handles:
   *  - Fetching the user profile from DB (no profile needed client-side)
   *  - Building the LLM prompt (system + user)
   *  - Calling the LLM (Anthropic/Ollama)
   *  - Parsing and filtering the response
   *
   * @param {object} serializedFields — From scanner.serializeForLLM()
   * @param {object} _profile — Unused (kept for backward compat with orchestrator)
   * @param {object} [jobContext] — Current job context (title, company, etc.)
   * @returns {Promise<{ok: boolean, mappings?: Array, error?: string}>}
   */
  const requestMappings = async (serializedFields, _profile, jobContext) => {
    const fieldCount = (serializedFields.fields || []).length;
    const widgetCount = (serializedFields.widgets || []).length;
    console.log(`[JAOS Mapper] Requesting LLM mappings for ${fieldCount} fields + ${widgetCount} widgets...`);

    const t0 = performance.now();

    const response = await sendToBackground({
      type: "JAOS_LLM_MAP_FIELDS",
      fields: serializedFields.fields || [],
      widgets: serializedFields.widgets || [],
      jobContext: jobContext || null,
    });

    const elapsed = (performance.now() - t0).toFixed(0);

    if (!response.ok) {
      console.error(`[JAOS Mapper] Backend mapping failed (${elapsed}ms):`, response.error);
      return { ok: false, error: response.error || "Field mapping request failed" };
    }

    if (!response.mappings || !Array.isArray(response.mappings)) {
      console.error(`[JAOS Mapper] Invalid response (${elapsed}ms) — expected {mappings:[...]}, got:`, JSON.stringify(response).slice(0, 300));
      return { ok: false, error: "Invalid response: missing mappings array" };
    }

    console.log(`[JAOS Mapper] Got ${response.mappings.length} mappings in ${elapsed}ms (${fieldCount} fields, ${widgetCount} widgets)`);
    return { ok: true, mappings: response.mappings };
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
  };
})();
