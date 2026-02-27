/**
 * engine/llm-client.js — Centralized OpenRouter LLM client
 *
 * Runs in the background service worker context.
 * Reads API key and model from chrome.storage.local:
 *   - OPENROUTER_API_KEY
 *   - OPENROUTER_MODEL (defaults to "meta-llama/llama-3.3-70b-instruct:free")
 *
 * All LLM calls in the extension go through this single module.
 */
(() => {
  const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
  const DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";
  const REQUEST_TIMEOUT_MS = 30_000;

  /**
   * Read a value from chrome.storage.local.
   */
  const storageGet = (key) =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (result) => resolve(result?.[key] ?? null));
      } catch (_e) {
        resolve(null);
      }
    });

  /**
   * Get the configured API key and model.
   * Returns { apiKey: string|null, model: string }
   */
  const getConfig = async () => {
    const [apiKey, model] = await Promise.all([
      storageGet("OPENROUTER_API_KEY"),
      storageGet("OPENROUTER_MODEL"),
    ]);
    return {
      apiKey: apiKey || null,
      model: model || DEFAULT_MODEL,
    };
  };

  /**
   * Extract JSON from LLM response text.
   * Handles: raw JSON, markdown ```json blocks, markdown ``` blocks.
   * Returns parsed object or null if extraction fails.
   */
  const extractJSON = (text) => {
    if (!text || typeof text !== "string") return null;
    const trimmed = text.trim();

    // Try direct parse first (ideal case)
    try { return JSON.parse(trimmed); } catch (_e) { /* continue */ }

    // Try extracting from ```json ... ``` or ``` ... ``` code blocks
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
      try { return JSON.parse(codeBlockMatch[1].trim()); } catch (_e) { /* continue */ }
    }

    // Try finding the first { ... } or [ ... ] in the text
    const firstBrace = trimmed.indexOf("{");
    const firstBracket = trimmed.indexOf("[");
    const start = firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket) ? firstBrace : firstBracket;
    if (start >= 0) {
      const closer = trimmed[start] === "{" ? "}" : "]";
      const lastClose = trimmed.lastIndexOf(closer);
      if (lastClose > start) {
        try { return JSON.parse(trimmed.slice(start, lastClose + 1)); } catch (_e) { /* continue */ }
      }
    }

    return null;
  };

  /**
   * Call the OpenRouter chat completion API.
   *
   * @param {object} options
   * @param {string} options.systemPrompt — System message for the LLM
   * @param {string} options.userPrompt   — User message (field data, profile, etc.)
   * @param {number} [options.maxTokens]  — Max tokens in response (default 2048)
   * @param {number} [options.temperature] — Temperature (default 0.1 for determinism)
   * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
   */
  const callLLM = async ({ systemPrompt, userPrompt, maxTokens = 2048, temperature = 0.1 }) => {
    const { apiKey, model } = await getConfig();

    if (!apiKey) {
      return {
        ok: false,
        error: "OPENROUTER_API_KEY not configured. Set it via chrome.storage.local.set({OPENROUTER_API_KEY: 'sk-or-...'})",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(OPENROUTER_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "chrome-extension://jaos-extension",
          "X-Title": "JAOS Autofill Engine",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        return {
          ok: false,
          error: `OpenRouter API error ${response.status}: ${errBody.slice(0, 200)}`,
        };
      }

      const json = await response.json();
      const content = json.choices?.[0]?.message?.content;

      if (!content) {
        return { ok: false, error: "Empty response from LLM" };
      }

      // Parse the JSON response — handle markdown code blocks from free models
      const parsed = extractJSON(content);
      if (parsed !== null) {
        return { ok: true, data: parsed };
      }
      // If all JSON extraction fails, return raw content
      return { ok: true, data: { raw: content } };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        return { ok: false, error: "LLM request timed out" };
      }
      return { ok: false, error: err.message || "LLM request failed" };
    }
  };

  // Expose on globalThis for background.js to use
  self.__jaosLLMClient = { callLLM, getConfig };
})();
