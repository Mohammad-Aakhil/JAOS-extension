(window.__jaosAtsAdapters = window.__jaosAtsAdapters || []).push({
  name: "smartrecruiters",
  detect: () => /jobs\.smartrecruiters\.com/i.test(window.location.hostname),
  selectors: [
    ['input[name="firstName"]', "first_name"],
    ['input[name="lastName"]', "last_name"],
    ['input[name="email"]', "email"],
    ['input[name="phoneNumber"]', "phone"],
    ['input[name="location"]', "city"],
    ['input[name="linkedIn"]', "linkedin"],
    ['textarea[name="coverLetter"]', "cover_letter"],
  ],
});
