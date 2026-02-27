(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "paylocity",
  detect: () => /recruiting\.paylocity\.com/i.test(window.location.hostname),
  selectors: [
    ['input[name*="FirstName"], input[id*="FirstName"]', "first_name"],
    ['input[name*="LastName"], input[id*="LastName"]', "last_name"],
    ['input[name*="Email"], input[id*="Email"], input[type="email"]', "email"],
    [
      'input[name*="Phone"], input[name*="Mobile"], input[id*="Phone"], input[id*="Mobile"], input[type="tel"]',
      "phone",
    ],
    ['input[name*="City"], input[id*="City"]', "city"],
    ['select[name*="State"], select[id*="State"]', "state"],
    ['input[name*="Zip"], input[id*="Zip"]', "zip"],
    ['input[name*="LinkedIn"], input[id*="LinkedIn"]', "linkedin"],
  ],
});
