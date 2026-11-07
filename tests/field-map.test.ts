import { test } from "node:test";
import assert from "node:assert/strict";
import { isCustomQuestion, mapField, pickOption, valueFor, type FieldInfo, type Profile } from "../extension/src/fieldMap";

const profile: Profile = {
  plan: "PREMIUM",
  contact: { fullName: "Priya Sharma", firstName: "Priya", lastName: "Sharma", email: "priya@example.com", phone: "+91 98111 22334", city: "Bengaluru", linkedin: "https://linkedin.com/in/priya", github: "https://github.com/priya", state: "Karnataka", pinCode: "560034" },
  work: { currentCompany: "Razorpay", currentTitle: "Senior Software Engineer", totalExperienceYears: 5.5, currentCtcLpa: 24, expectedCtcLpa: 32, noticePeriod: "30", earliestStartDate: "2026-12-15" },
  eligibility: { authorisedToWorkInIndia: true, needsVisaSponsorship: false, willingToRelocate: false },
  eeo: { gender: "Prefer not to say", disability: "Prefer not to say", veteran: "Prefer not to say" },
  education: [{ school: "VIT Vellore", degree: "B.Tech Computer Science", end: "2021" }],
};

// Field descriptors copied from real Greenhouse, Lever and Workday application forms.
const GREENHOUSE: [FieldInfo, string | null][] = [
  [{ label: "First Name *", id: "first_name", name: "job_application[first_name]" }, "firstName"],
  [{ label: "Last Name *", id: "last_name", name: "job_application[last_name]" }, "lastName"],
  [{ label: "Email *", id: "email", type: "email" }, "email"],
  [{ label: "Phone", id: "phone", type: "tel" }, "phone"],
  [{ label: "Resume/CV *", type: "file", name: "resume" }, "resume"],
  [{ label: "Cover Letter", type: "file", name: "cover_letter" }, null],
  [{ label: "LinkedIn Profile", name: "job_application[answers_attributes][0][text_value]" }, "linkedin"],
  [{ label: "Website", name: "job_application[answers_attributes][1][text_value]" }, "website"],
  [{ label: "Are you legally authorized to work in the United States?", type: "select", options: ["--", "Yes", "No"] }, null],
  [{ label: "Will you now or in the future require sponsorship for employment visa status?", type: "select", options: ["Yes", "No"] }, "sponsorship"],
  [{ label: "Gender", type: "select", options: ["Male", "Female", "Decline To Self Identify"] }, "gender"],
  [{ label: "Why do you want to work at Stripe?", type: "textarea" }, null],
];
const LEVER: [FieldInfo, string | null][] = [
  [{ label: "Full name", name: "name" }, "fullName"],
  [{ label: "Current company", name: "org" }, "currentCompany"],
  [{ label: "LinkedIn URL", name: "urls[LinkedIn]" }, "linkedin"],
  [{ label: "GitHub URL", name: "urls[GitHub]" }, "github"],
  [{ label: "Portfolio URL", name: "urls[Portfolio]" }, "website"],
  [{ label: "Current location", name: "location" }, "city"],
  [{ label: "Password", type: "password", name: "password" }, null],
];
const WORKDAY: [FieldInfo, string | null][] = [
  [{ label: "Given Name(s)", aria: "Given Name(s) Required", id: "name--legalName--firstName" }, "firstName"],
  [{ label: "Family Name", id: "name--legalName--lastName" }, "lastName"],
  [{ label: "Postal Code", id: "address--postalCode" }, "pinCode"],
  [{ label: "City", id: "address--city" }, "city"],
  [{ label: "School or University", id: "education-1--schoolName" }, "school"],
  [{ label: "Degree", type: "select", options: ["Select One", "Bachelors", "Masters"] }, "degree"],
  [{ label: "Notice Period", type: "select", options: ["Select One", "Immediate Joiner", "15 Days", "1 Month", "2 Months", "3 Months"] }, "noticePeriod"],
  [{ label: "Current CTC (in LPA)", id: "ctc-current" }, "currentCtc"],
  [{ label: "Expected CTC (in LPA)", id: "ctc-expected" }, "expectedCtc"],
  [{ label: "Total years of experience", id: "exp-years" }, "totalExperience"],
  [{ label: "Are you authorised to work in India?", type: "radio-group", options: ["Yes", "No"] }, "workAuthIndia"],
  [{ label: "Are you willing to relocate?", type: "radio-group", options: ["Yes", "No"] }, "relocate"],
];

for (const [name, form] of [["Greenhouse", GREENHOUSE], ["Lever", LEVER], ["Workday", WORKDAY]] as const) {
  test(`maps ${name} fields`, () => {
    for (const [field, want] of form) assert.equal(mapField(field), want, `${name}: ${field.label}`);
  });
}

test("never fills passwords or non resume file inputs", () => {
  assert.equal(mapField({ label: "Password", type: "password" }), null);
  assert.equal(mapField({ label: "Cover letter", type: "file" }), null);
  assert.equal(mapField({ label: "Resume", type: "text" }), null, "a resume text box is not the upload");
});

test("values come from the profile and unknowns stay empty", () => {
  assert.equal(valueFor("firstName", profile), "Priya");
  assert.equal(valueFor("expectedCtc", profile), "32");
  assert.equal(valueFor("noticePeriod", profile), "30 days");
  assert.equal(valueFor("workAuthIndia", profile), "Yes");
  assert.equal(valueFor("sponsorship", profile), "No");
  assert.equal(valueFor("gradYear", profile), "2021");
  assert.equal(valueFor("currentCtc", { ...profile, work: { ...profile.work!, currentCtcLpa: null } }), "");
});

test("picks dropdown and radio options by fuzzy match", () => {
  const notice = ["Select One", "Immediate Joiner", "15 Days", "1 Month", "2 Months", "3 Months"];
  assert.equal(pickOption(notice, "Immediate", "noticePeriod"), 1);
  assert.equal(pickOption(notice, "30 days", "noticePeriod"), 3);
  assert.equal(pickOption(notice, "90 days", "noticePeriod"), 5);
  assert.equal(pickOption(["Male", "Female", "Decline To Self Identify"], "Prefer not to say", "gender"), 2);
  assert.equal(pickOption(["Yes, I am", "No"], "Yes"), 0);
  assert.equal(pickOption(["Select", "Bengaluru", "Mumbai"], "bengaluru"), 1);
});

test("leaves a dropdown alone rather than guessing", () => {
  assert.equal(pickOption(["Select One", "Bachelors", "Masters"], "B.Tech Computer Science", "degree"), -1);
  assert.equal(pickOption(["Option A", "Option B"], "Something else"), -1);
  assert.equal(pickOption(["Yes", "No"], ""), -1);
});

test("custom questions are offered to the AI writer", () => {
  assert.ok(isCustomQuestion({ label: "Why do you want to work at Stripe?", type: "textarea" }));
  assert.ok(isCustomQuestion({ label: "Describe a project you are proud of", type: "textarea" }));
  assert.ok(!isCustomQuestion({ label: "Email", type: "text" }));
});
