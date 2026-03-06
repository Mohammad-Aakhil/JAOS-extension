/**
 * JAOS Fiber Bridge — runs in MAIN world (page context).
 *
 * Content scripts run in Chrome's ISOLATED world and cannot access
 * React Fiber internals (__reactFiber$ properties on DOM elements).
 * This bridge script runs in the MAIN world where React Fiber is
 * accessible, and communicates with ISOLATED world scripts via
 * custom DOM events.
 *
 * Events:
 *   jaos:rs-options  → reads available options from a react-select
 *   jaos:rs-fill     → fills a react-select with a value via selectOption
 */
(function () {
  // Prevent double-init
  if (window.__jaosFiberBridge) return;
  window.__jaosFiberBridge = true;

  // ── Fiber traversal ──────────────────────────────────────────────

  const findInput = (container) =>
    container.querySelector('input[role="combobox"], input[id^="react-select"], [class*="__input"] input');

  const readFiber = (container) => {
    const input = findInput(container);
    if (!input) return null;

    const fiberKey = Object.keys(input).find((k) => k.startsWith("__reactFiber$"));
    if (!fiberKey) return null;

    let fiber = input[fiberKey];
    let options = null;
    let selectOption = null;
    let onChange = null;

    for (let i = 0; i < 30 && fiber; i++) {
      const props = fiber.memoizedProps || {};

      if (props.options && Array.isArray(props.options) && !options) {
        options = props.options;
      }
      if (fiber.stateNode?.selectOption && !selectOption) {
        selectOption = fiber.stateNode.selectOption.bind(fiber.stateNode);
      }
      if (typeof props.onChange === "function" && options && i > 5 && !onChange) {
        onChange = props.onChange;
      }

      fiber = fiber.return;
    }

    if (!options) return null;
    return { options, selectOption, onChange };
  };

  // ── Event: read options ─────────────────────────────────────────

  document.addEventListener("jaos:rs-options", (e) => {
    const { marker } = e.detail || {};
    if (!marker) return;

    const container = document.querySelector(`[data-jaos-rs="${marker}"]`);
    if (!container) {
      document.dispatchEvent(
        new CustomEvent("jaos:rs-options-result", {
          detail: { marker, success: false, options: [] },
        })
      );
      return;
    }

    const fiber = readFiber(container);
    const opts = fiber
      ? fiber.options.map((o) => ({
          label: String(o.label || ""),
          value: String(o.value ?? ""),
        }))
      : [];

    document.dispatchEvent(
      new CustomEvent("jaos:rs-options-result", {
        detail: { marker, success: !!fiber, options: opts },
      })
    );
  });

  // ── Event: fill react-select ────────────────────────────────────

  document.addEventListener("jaos:rs-fill", (e) => {
    const { marker, value } = e.detail || {};
    if (!marker || !value) return;

    const container = document.querySelector(`[data-jaos-rs="${marker}"]`);
    if (!container) {
      document.dispatchEvent(
        new CustomEvent("jaos:rs-fill-result", {
          detail: { marker, success: false, reason: "container-not-found" },
        })
      );
      return;
    }

    const fiber = readFiber(container);
    if (!fiber || (!fiber.selectOption && !fiber.onChange)) {
      document.dispatchEvent(
        new CustomEvent("jaos:rs-fill-result", {
          detail: { marker, success: false, reason: "no-fiber" },
        })
      );
      return;
    }

    const t = value.toLowerCase().trim();
    const match =
      fiber.options.find((o) => String(o.label || "").toLowerCase().trim() === t) ||
      fiber.options.find((o) => String(o.label || "").toLowerCase().includes(t)) ||
      fiber.options.find((o) => {
        const l = String(o.label || "").toLowerCase();
        return l.length > 1 && t.includes(l);
      }) ||
      fiber.options.find((o) => String(o.value || "").toLowerCase().includes(t));

    if (!match) {
      document.dispatchEvent(
        new CustomEvent("jaos:rs-fill-result", {
          detail: {
            marker,
            success: false,
            reason: "no-match",
            available: fiber.options.map((o) => o.label).slice(0, 10),
          },
        })
      );
      return;
    }

    // Prefer selectOption (react-select's own method)
    if (fiber.selectOption) {
      fiber.selectOption(match);
    } else if (fiber.onChange) {
      fiber.onChange(match);
    }

    document.dispatchEvent(
      new CustomEvent("jaos:rs-fill-result", {
        detail: { marker, success: true, selected: match.label },
      })
    );
  });
})();
