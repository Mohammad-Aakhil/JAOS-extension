/**
 * adapters/bamboohr-v2.js — BambooHR ATS adapter (v2 architecture)
 *
 * BambooHR uses Fabric UI (MUI wrappers) with standard HTML inputs,
 * but State/Country use custom fab-SelectToggle widgets (searchable dropdown).
 * The hidden native <select> is aria-hidden, readonly, zero-size — NOT fillable.
 *
 * Flow: detect → waitForDomStable → scan → augmentScan → LLM map → fill → afterFill
 */
(function () {
  const registry = (window.__jaosAtsAdaptersV2 =
    window.__jaosAtsAdaptersV2 || []);

  // ── Detection ──────────────────────────────────────────────────────

  const detect = () => {
    return /\.bamboohr\.com$/i.test(window.location.hostname);
  };

  // ── Form root ──────────────────────────────────────────────────────

  const FORM_FIELD_CHECK = 'input:not([type="hidden"]), select, textarea';

  const getFormRoot = () => {
    const candidates = [
      document.querySelector(".ReferralForm"),
      document.querySelector(".ApplicationForm"),
      document.querySelector('form[method="post"]'),
      document.querySelector("form"),
    ];

    for (const el of candidates) {
      if (el && el.querySelector(FORM_FIELD_CHECK)) return el;
    }
    return document.body;
  };

  // ── Fabric UI helpers ────────────────────────────────────────────

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Fill a Fabric UI fab-SelectToggle widget by clicking it, searching, and selecting.
   * DOM structure:
   *   div.fab-Select
   *     button.fab-SelectToggle [aria-label="State ..."]
   *       div.fab-SelectToggle__content → current value or "--Select--"
   *     select[aria-hidden="true"] ← hidden backing store, NOT fillable
   *
   * When button clicked:
   *   aside (overlay)
   *     div.fab-MenuVessel [data-fabric-component="Menu"]
   *       input.fab-MenuSearch__input [aria-label="Search"]
   *       div.fab-MenuList [role="menu"]
   *         div.fab-MenuOption (clickable items)
   */
  const fillFabSelect = async (toggleBtn, searchValue) => {
    if (!toggleBtn || !searchValue) return false;

    // 1. Open the dropdown — Fabric UI uses PointerEvent listeners.
    //    Try multiple strategies: pointer events → mouse events → native click → keyboard
    toggleBtn.scrollIntoView({ block: "center" });
    toggleBtn.focus();
    await delay(100);

    // Strategy A: PointerEvent sequence (modern Fabric UI / React)
    for (const type of ["pointerdown", "pointerup"]) {
      toggleBtn.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1 }));
    }
    toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    // Check if menu opened
    await delay(300);
    let searchInput = document.querySelector("input.fab-MenuSearch__input, input[aria-label='Search']");
    if (!searchInput) {
      console.log("[JAOS BambooHR] PointerEvent didn't open menu, trying native click...");
      // Strategy B: Native .click()
      toggleBtn.click();
      await delay(300);
      searchInput = document.querySelector("input.fab-MenuSearch__input, input[aria-label='Search']");
    }
    if (!searchInput) {
      console.log("[JAOS BambooHR] Native click didn't open menu, trying Enter key...");
      // Strategy C: Keyboard — Enter/Space opens most accessible dropdowns
      toggleBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      toggleBtn.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
      await delay(300);
      searchInput = document.querySelector("input.fab-MenuSearch__input, input[aria-label='Search']");
    }
    if (!searchInput) {
      console.log("[JAOS BambooHR] Enter key didn't open menu, trying Space key...");
      // Strategy D: Space bar
      toggleBtn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", keyCode: 32, bubbles: true }));
      toggleBtn.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", keyCode: 32, bubbles: true }));
    }

    console.log("[JAOS BambooHR] Dispatched events on fab-SelectToggle, polling for menu...");

    // 2. Poll for the search input if strategies above didn't find it yet
    if (!searchInput) {
      for (let i = 0; i < 15; i++) {
        await delay(200); // 15 × 200ms = 3s max
        searchInput = document.querySelector("input.fab-MenuSearch__input, input[aria-label='Search']");
        if (searchInput) break;
      }
    }

    if (!searchInput) {
      console.warn("[JAOS BambooHR] fab-MenuSearch__input not found after 3s of polling");
      document.body.click();
      return false;
    }
    console.log("[JAOS BambooHR] Found search input, typing:", searchValue);

    // 3. Type the search value with proper event sequence
    searchInput.focus();
    searchInput.value = "";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await delay(100);
    searchInput.value = searchValue;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(500);

    // 4. Find and click the first matching option
    const menuList = document.querySelector("div.fab-MenuList[role='menu'], [role='menu'].fab-MenuList");
    if (!menuList) {
      // Broader fallback — find any menu option container
      const anyOption = document.querySelector(".fab-MenuOption, [role='menuitem']");
      if (!anyOption) {
        console.warn("[JAOS BambooHR] fab-MenuList and options not found");
        document.body.click();
        return false;
      }
    }

    const options = document.querySelectorAll(".fab-MenuOption, [role='menuitem']");
    const target = searchValue.toLowerCase();
    let bestMatch = null;

    for (const opt of options) {
      const text = (opt.textContent || "").trim().toLowerCase();
      if (text === target) { bestMatch = opt; break; }
      if (!bestMatch && text.includes(target)) bestMatch = opt;
    }

    // Fallback: click the first option if search narrowed results
    if (!bestMatch && options.length > 0 && options.length <= 5) {
      bestMatch = options[0];
    }

    if (bestMatch) {
      bestMatch.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      bestMatch.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      bestMatch.click();
      await delay(200);
      console.log(`[JAOS BambooHR] fab-Select filled: "${searchValue}" → "${bestMatch.textContent.trim()}"`);
      return true;
    }

    console.warn(`[JAOS BambooHR] No matching option for "${searchValue}" in ${options.length} options`);
    document.body.click();
    return false;
  };

  // ── US state abbreviation → full name map ──
  // BambooHR fab-Select options show full state names, but profile often has abbreviations
  const US_STATES = {
    AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",
    CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",
    HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",
    KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",
    MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",
    MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",
    NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",
    OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",
    SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",
    VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",
    DC:"District of Columbia",AS:"American Samoa",GU:"Guam",MP:"Northern Mariana Islands",
    PR:"Puerto Rico",VI:"Virgin Islands",
  };

  // ── Guess profile value for a Fabric select based on its label ──

  const guessFabSelectValue = (label, profile) => {
    const l = (label || "").toLowerCase();
    if (/state|province|region/i.test(l)) {
      const raw = profile.state || profile.province || "";
      // Convert 2-letter abbreviation to full name for fab-Select search
      const upper = raw.toUpperCase().trim();
      return US_STATES[upper] || raw;
    }
    if (/city|town/i.test(l)) return profile.city || "";
    if (/country/i.test(l)) return profile.country || "United States";
    if (/county/i.test(l)) return profile.county || "";
    return "";
  };

  // ── Flow ───────────────────────────────────────────────────────────

  const getFlow = () => {
    return [
      {
        id: "application",
        label: "Application Form",

        waitFor: async (ctx) => {
          const formRoot = getFormRoot();
          await ctx.utils.waitForElement(
            "input, select, textarea",
            formRoot,
            8000
          );
          await ctx.utils.waitForDomStable(400, 3000);
        },

        getFormRoot: () => getFormRoot(),

        // [BambooHR] Clean scan results before sending to LLM
        augmentScan: async (ctx, scanResult) => {
          const before = scanResult.fields.length;

          scanResult.fields = scanResult.fields.filter((f) => {
            const el = f.element;

            // Remove hidden backing <select> elements (Fabric UI pattern)
            // These have aria-hidden="true" and are zero-size — the real widget is fab-SelectToggle
            if (el.getAttribute("aria-hidden") === "true") {
              console.log(`[JAOS BambooHR] Removed hidden backing element: "${f.label}"`);
              return false;
            }

            // Remove honeypot / spam trap fields
            if (/leave this field blank|please leave this/i.test(f.label || "")) {
              console.log(`[JAOS BambooHR] Removed honeypot field: "${f.label}"`);
              return false;
            }

            // Remove file inputs (resume upload handled separately)
            if (f.isFileInput) {
              console.log(`[JAOS BambooHR] Removed file input: "${f.label}"`);
              return false;
            }

            return true;
          });

          const removed = before - scanResult.fields.length;
          if (removed > 0) {
            console.log(`[JAOS BambooHR] augmentScan: removed ${removed} fields (${scanResult.fields.length} remain)`);
          }
        },

        // [BambooHR] After fill: handle Fabric UI selects (State, Country, etc.)
        afterFill: async (ctx) => {
          const formRoot = getFormRoot();

          // Find ALL fab-SelectToggle buttons (State, Country, etc.)
          const toggleBtns = formRoot.querySelectorAll("button.fab-SelectToggle");
          console.log(`[JAOS BambooHR] afterFill: found ${toggleBtns.length} fab-SelectToggle buttons`);

          for (const btn of toggleBtns) {
            const contentEl = btn.querySelector(".fab-SelectToggle__content");
            const currentText = (contentEl?.textContent || "").trim();

            // Skip already-filled selects — check for actual value (not placeholder).
            // BambooHR placeholder uses en-dash "–Select–" not "--Select--", so check broadly.
            const isPlaceholder = !currentText ||
              /^[-–—].*select/i.test(currentText) ||
              /^select/i.test(currentText) ||
              currentText === "";
            if (!isPlaceholder) {
              console.log(`[JAOS BambooHR] fab-Select already filled: "${currentText}", skipping`);
              continue;
            }

            // Get label from aria-label, nearby label, or parent wrapper
            const ariaLabel = btn.getAttribute("aria-label") || "";
            const selectWrapper = btn.closest("[data-fabric-component]") ||
              btn.closest(".fab-Select") || btn.parentElement;
            const nearbyLabel = selectWrapper?.closest("[data-fabric-component*='InputWrapper'], [data-fabric-component*='SelectField']")
              ?.querySelector("label")?.textContent?.trim();
            // Also check: walk up to find a sibling label
            let siblingLabel = "";
            if (!nearbyLabel) {
              let parent = btn.parentElement;
              for (let i = 0; i < 5 && parent; i++) {
                const lbl = parent.querySelector("label");
                if (lbl && !btn.contains(lbl)) {
                  siblingLabel = (lbl.textContent || "").replace(/\*/g, "").trim();
                  break;
                }
                parent = parent.parentElement;
              }
            }
            const label = nearbyLabel || siblingLabel || ariaLabel || "";
            console.log(`[JAOS BambooHR] Unfilled fab-Select: label="${label}", aria="${ariaLabel}", content="${currentText}"`);

            const profileValue = guessFabSelectValue(label, ctx.profile);
            if (!profileValue) {
              console.log(`[JAOS BambooHR] No profile value for fab-Select "${label}", skipping`);
              continue;
            }

            console.log(`[JAOS BambooHR] Filling fab-Select "${label}" → "${profileValue}"`);
            await fillFabSelect(btn, profileValue);
          }
        },
      },
    ];
  };

  // ── Register adapter ───────────────────────────────────────────────

  if (registry.some((a) => a.name === "bamboohr")) return;

  registry.push({
    name: "bamboohr",
    detect,
    getFormRoot,
    getFlow,
    shouldOverwrite: () => false,
  });
})();
