(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "bamboohr",
  detect: () => /\.bamboohr\.com/i.test(window.location.hostname),
  selectors: [
    ['input[name="firstName"]', "first_name"],
    ['input[name="lastName"]', "last_name"],
    ['input[name="email"]', "email"],
    ['input[name="phone"]', "phone"],
    ['input[name="city"]', "city"],
    ['input[name="state"]', "state"],
    ['input[name="linkedinUrl"]', "linkedin"],
    ['textarea[name="coverLetter"]', "cover_letter"],
  ],
});
