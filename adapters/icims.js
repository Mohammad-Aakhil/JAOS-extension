(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "icims",
  detect: () =>
    /icims\.com/i.test(window.location.hostname) ||
    !!document.querySelector(".iCIMS_MainWrapper"),
  selectors: [
    ['input[id*="FirstName"], input[name*="FirstName"]', "first_name"],
    ['input[id*="LastName"], input[name*="LastName"]', "last_name"],
    ['input[id*="Email"], input[name*="Email"], input[type="email"]', "email"],
    ['input[id*="Phone"], input[name*="Phone"], input[type="tel"]', "phone"],
    ['input[id*="City"], input[name*="City"]', "city"],
    ['input[id*="State"], input[name*="State"]', "state"],
    ['input[id*="LinkedIn"], input[name*="LinkedIn"]', "linkedin"],
  ],
});
