/**
 * engine/orchestrator.js — Main autofill orchestration engine
 *
 * Content script that coordinates the full autofill pipeline:
 *
 *   Portal Detection → Load Adapter → Execute Adapter Flow
 *     → (click → waitForMutation → scan → LLM map → fill → repeat)
 *
 * Key design principles:
 *  - Adapters define explicit "flows" as sequences of interaction steps
 *  - All waits use MutationObserver, NOT arbitrary timeouts
 *  - LLM calls go through background.js (CSP-safe)
 *  - The orchestrator executes flows, adapters never touch the DOM filler directly
 *
 * Registers: window.__jaosOrchestrator
 */
(() => {
  if (window.__jaosOrchestrator) return;

  const log = (...args) => console.log("[JAOS Engine]", ...args);
  const warn = (...args) => console.warn("[JAOS Engine]", ...args);

  // ─── V2 Adapter Registry ───────────────────────────────────────────

  const getV2Adapters = () => window.__jaosAtsAdaptersV2 || [];

  const detectPlatform = () => {
    const adapters = getV2Adapters();
    for (const adapter of adapters) {
      try {
        if (adapter.detect()) return adapter;
      } catch (e) {
        warn(`Adapter ${adapter.name} detect() threw:`, e.message);
      }
    }
    return null;
  };

  const DEFAULT_ADAPTER = {
    name: "generic",
    detect: () => false,
    getFlow: () => [{ id: "main", label: "Application" }],
    getFormRoot: () => document.body,
    shouldOverwrite: () => false,
  };

  // ─── MutationObserver Utilities ─────────────────────────────────────

  /**
   * Wait for a DOM mutation matching a predicate.
   * Resolves when the predicate returns true, or rejects on timeout.
   *
   * @param {object} opts
   * @param {HTMLElement} [opts.target] — Element to observe (default: document.body)
   * @param {function} opts.predicate — (mutations) => bool | HTMLElement. Called on each mutation batch.
   * @param {number} [opts.timeoutMs] — Max wait time (default 10000)
   * @param {object} [opts.observerConfig] — MutationObserver config
   * @returns {Promise<HTMLElement|true>}
   */
  const waitForMutation = ({ target, predicate, timeoutMs = 10000, observerConfig } = {}) =>
    new Promise((resolve, reject) => {
      const observeTarget = target || document.body;
      const config = observerConfig || { childList: true, subtree: true, attributes: true };

      // Check immediately before observing
      try {
        const immediate = predicate([]);
        if (immediate) {
          resolve(immediate);
          return;
        }
      } catch (_e) { /* ignore */ }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        reject(new Error("waitForMutation timed out"));
      }, timeoutMs);

      const observer = new MutationObserver((mutations) => {
        if (settled) return;
        try {
          const result = predicate(mutations);
          if (result) {
            settled = true;
            clearTimeout(timer);
            observer.disconnect();
            resolve(result);
          }
        } catch (_e) { /* ignore, keep waiting */ }
      });

      observer.observe(observeTarget, config);
    });

  /**
   * Wait for the DOM to stabilize (no new mutations for `quietMs`).
   *
   * @param {number} [quietMs] — Quiet period in ms (default 400)
   * @param {number} [maxMs] — Max wait time (default 5000)
   * @returns {Promise<void>}
   */
  const waitForDomStable = (quietMs = 400, maxMs = 5000) =>
    new Promise((resolve) => {
      let timer = null;
      const maxTimer = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, maxMs);

      const observer = new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          clearTimeout(maxTimer);
          observer.disconnect();
          resolve();
        }, quietMs);
      });

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });

      // Start the quiet timer in case there are no mutations at all
      timer = setTimeout(() => {
        clearTimeout(maxTimer);
        observer.disconnect();
        resolve();
      }, quietMs);
    });

  /**
   * Wait for an element matching a selector to appear in the DOM.
   *
   * @param {string} selector — CSS selector
   * @param {HTMLElement} [root] — Root element (default: document)
   * @param {number} [timeoutMs] — Max wait (default 10000)
   * @returns {Promise<HTMLElement>}
   */
  const waitForElement = (selector, root, timeoutMs = 10000) => {
    const rootEl = root || document;
    // Check immediately
    const existing = rootEl.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return waitForMutation({
      target: rootEl === document ? document.body : rootEl,
      predicate: () => rootEl.querySelector(selector),
      timeoutMs,
    });
  };

  /**
   * Wait for an element to be removed from the DOM.
   */
  const waitForRemoval = (selector, root, timeoutMs = 10000) => {
    const rootEl = root || document;
    if (!rootEl.querySelector(selector)) return Promise.resolve(true);

    return waitForMutation({
      target: rootEl === document ? document.body : rootEl,
      predicate: () => !rootEl.querySelector(selector),
      timeoutMs,
    });
  };

  // ─── Flow Execution Engine ─────────────────────────────────────────

  /**
   * Execute an adapter's flow definition.
   *
   * A flow is an array of steps. Each step is an object:
   *
   * {
   *   id: "step_name",                    // Unique step identifier
   *   label: "Human-readable label",      // For progress reporting
   *
   *   // Pre-step: Wait for form to be ready
   *   waitFor: async (ctx) => {},         // Wait for DOM state (e.g., form rendered)
   *                                        // Should use MutationObserver utils
   *
   *   // Optional: Action before scanning (e.g., click a tab)
   *   action: async (ctx) => {},          // Perform an action (click, navigate)
   *
   *   // Optional: Custom form root for scanning
   *   getFormRoot: (ctx) => HTMLElement,   // Root element to scan within
   *
   *   // Optional: Augment scan results (add custom widgets, filter fields)
   *   augmentScan: async (ctx, scanResult) => {},
   *
   *   // Optional: Override whether to fill fields with existing values
   *   shouldOverwrite: (field) => bool,
   *
   *   // Optional: Post-fill (trigger validation, handle re-renders)
   *   afterFill: async (ctx, fillResult) => {},
   *
   *   // Optional: Navigate to next step (click "Next", "Continue", etc.)
   *   // Return false to stop the flow.
   *   advance: async (ctx) => bool,
   * }
   *
   * ctx = { profile, jobContext, adapter, stepResults, onProgress, utils }
   */
  const executeFlow = async (adapter, profile, jobContext, options = {}) => {
    const { onProgress } = options;

    const scanner = window.__jaosScanner;
    const mapper = window.__jaosMapper;
    const filler = window.__jaosFiller;

    if (!scanner || !mapper || !filler) {
      throw new Error("Engine modules not loaded (scanner/mapper/filler)");
    }

    // Build the flow steps from the adapter
    const flow = adapter.getFlow?.() || [{ id: "main", label: "Application" }];
    const totalSteps = flow.length;
    const allResults = [];
    const allErrors = [];
    const allFieldLabels = [];   // { label, isFilled } for UI progress
    let totalFilled = 0;

    // Shared context passed to all flow step functions
    const ctx = {
      profile,
      jobContext,
      adapter,
      stepResults: allResults,
      onProgress,
      // Expose orchestrator utils to adapters
      utils: {
        waitForMutation,
        waitForDomStable,
        waitForElement,
        waitForRemoval,
        scanner,
        filler,
      },
    };

    for (let i = 0; i < flow.length; i++) {
      const step = flow[i];
      log(`Step ${i + 1}/${totalSteps}: ${step.label || step.id}`);
      onProgress?.({ phase: "step", stepId: step.id, stepIndex: i, totalSteps, label: step.label });

      try {
        // 1. Wait for form to be ready
        if (step.waitFor) {
          onProgress?.({ phase: "waitingForForm", stepId: step.id });
          await step.waitFor(ctx);
        } else {
          await waitForDomStable();
        }

        // 2. Perform pre-scan action (e.g., click a tab, open a section)
        if (step.action) {
          await step.action(ctx);
          // Wait for DOM to settle after the action
          await waitForDomStable(300, 3000);
        }

        // 3. Scan fields
        onProgress?.({ phase: "scanning", stepId: step.id });
        const formRoot = step.getFormRoot?.(ctx) || adapter.getFormRoot?.() || document.body;
        const scanResult = scanner.scanPage(formRoot);

        // 4. Augment scan (adapter can add custom widgets, filter, etc.)
        if (step.augmentScan) {
          await step.augmentScan(ctx, scanResult);
        }

        const totalFields = scanResult.fields.length + scanResult.widgets.length;
        log(`  Found ${scanResult.fields.length} fields + ${scanResult.widgets.length} widgets`);

        if (totalFields === 0) {
          allResults.push({ stepId: step.id, filled: 0, total: 0, errors: [] });
          // Still try to advance even if no fields
          if (step.advance) {
            const advanced = await step.advance(ctx);
            if (!advanced) break;
            continue;
          }
          continue;
        }

        // 5. Serialize and filter for LLM
        const serialized = scanner.serializeForLLM(scanResult);
        const shouldOverwrite = step.shouldOverwrite || adapter.shouldOverwrite || (() => false);

        const fieldsToMap = {
          fields: serialized.fields.filter((f) => {
            if (f.isFileInput) return false;
            if (f.currentValue && !shouldOverwrite(f)) return false;
            return true;
          }),
          widgets: serialized.widgets.filter((w) => {
            if (w.currentValue && !shouldOverwrite(w)) return false;
            return true;
          }),
        };

        if (fieldsToMap.fields.length === 0 && fieldsToMap.widgets.length === 0) {
          log("  All fields already filled, skipping LLM");
          for (const f of scanResult.fields) {
            allFieldLabels.push({ label: f.label || f.placeholder || f.name || "Field", isFilled: true, isRequired: !!f.required });
          }
          for (const w of scanResult.widgets) {
            allFieldLabels.push({ label: w.label || w.placeholder || "Widget", isFilled: true, isRequired: !!w.required });
          }
          allResults.push({ stepId: step.id, filled: 0, total: totalFields, errors: [] });
        } else {
          // 6. LLM mapping
          onProgress?.({ phase: "mapping", stepId: step.id, total: totalFields });
          log(`  Requesting LLM mappings for ${fieldsToMap.fields.length + fieldsToMap.widgets.length} empty fields`);

          const mapResult = await mapper.requestMappings(fieldsToMap, profile, jobContext);

          if (!mapResult.ok) {
            const errMsg = `LLM mapping failed on step ${step.id}: ${mapResult.error}`;
            warn(errMsg);
            allErrors.push(errMsg);
            allResults.push({ stepId: step.id, filled: 0, total: totalFields, errors: [errMsg] });
          } else {
            log(`  Got ${mapResult.mappings.length} mappings from LLM`);

            // 7. Build element lookup and fill
            const lookup = mapper.buildElementLookup(scanResult);
            let stepFilled = 0;
            const stepErrors = [];
            const filledUids = new Set();

            onProgress?.({ phase: "filling", stepId: step.id, total: totalFields, mappings: mapResult.mappings.length });

            for (const mapping of mapResult.mappings) {
              const descriptor = lookup.get(mapping.uid);
              if (!descriptor) {
                warn(`  No element for uid: ${mapping.uid}`);
                continue;
              }

              try {
                // Human-like typing for the first few text fields
                const useHumanType = stepFilled < 3 &&
                  descriptor.tag !== "select" &&
                  descriptor.type !== "react-select" &&
                  descriptor.type !== "checkbox" &&
                  descriptor.type !== "radio";

                const success = await filler.fillField(descriptor, mapping.value, {
                  humanType: useHumanType,
                });

                if (success) {
                  stepFilled++;
                  filledUids.add(mapping.uid);
                  onProgress?.({ phase: "filling", stepId: step.id, filled: stepFilled, total: totalFields });
                }

                // Brief pause between fields
                await filler.delay(60, 150);
              } catch (err) {
                const msg = `Fill failed [${descriptor.label || descriptor.uid}]: ${err.message}`;
                stepErrors.push(msg);
                warn(`  ${msg}`);
              }
            }
            for (const f of scanResult.fields) {
              const label = f.label || f.placeholder || f.name || f.id || "Field";
              allFieldLabels.push({ label, isFilled: filledUids.has(f.uid) || !!(f.currentValue), isRequired: !!f.required });
            }
            for (const w of scanResult.widgets) {
              const label = w.label || w.placeholder || "Widget";
              allFieldLabels.push({ label, isFilled: filledUids.has(w.uid) || !!(w.currentValue), isRequired: !!w.required });
            }

            totalFilled += stepFilled;
            allErrors.push(...stepErrors);
            allResults.push({ stepId: step.id, filled: stepFilled, total: totalFields, errors: stepErrors });
          }
        }

        // 8. Post-fill (adapter triggers validation, handles re-renders)
        if (step.afterFill) {
          try {
            await step.afterFill(ctx, allResults[allResults.length - 1]);
          } catch (err) {
            warn(`  afterFill error: ${err.message}`);
          }
        }

        // 9. Advance to next step
        if (step.advance && i < flow.length - 1) {
          onProgress?.({ phase: "advancing", stepId: step.id });
          const advanced = await step.advance(ctx);
          if (!advanced) {
            log("  Adapter advance returned false, stopping flow");
            break;
          }
        }
      } catch (err) {
        const msg = `Step ${step.id} failed: ${err.message}`;
        allErrors.push(msg);
        warn(msg);
        allResults.push({ stepId: step.id, filled: 0, total: 0, errors: [msg] });
        // Don't break — try remaining steps
      }
    }

    onProgress?.({ phase: "done", totalFilled, adapter: adapter.name });

    return {
      ok: allErrors.length === 0,
      adapter: adapter.name,
      totalFilled,
      steps: allResults,
      errors: allErrors,
      fieldLabels: allFieldLabels,
    };
  };

  // ─── Public API ────────────────────────────────────────────────────

  /**
   * Main entry point. Detects adapter → executes flow.
   */
  const run = async (profile, jobContext, options = {}) => {
    const { onProgress } = options;

    // Detect platform
    let adapter = detectPlatform();

    if (adapter) {
      log(`Detected ATS: ${adapter.name}`);
    } else {
      log("No v2 adapter matched, using generic adapter");
      adapter = {
        ...DEFAULT_ADAPTER,
        getFlow: () => [{
          id: "main",
          label: "Application",
          waitFor: async () => waitForDomStable(),
        }],
        getFormRoot: () => document.body,
      };
    }

    onProgress?.({ phase: "detected", adapter: adapter.name });

    return executeFlow(adapter, profile, jobContext, options);
  };

  // Expose generic adapter so adapters can extend it
  const GENERIC_ADAPTER = {
    name: "generic",
    detect: () => false,
    getFlow: () => [{ id: "main", label: "Application" }],
    getFormRoot: () => document.body,
  };

  window.__jaosOrchestrator = {
    run,
    executeFlow,
    detectPlatform,
    // MutationObserver utilities — adapters use these in their flow steps
    waitForMutation,
    waitForDomStable,
    waitForElement,
    waitForRemoval,
    GENERIC_ADAPTER,
  };
})();
