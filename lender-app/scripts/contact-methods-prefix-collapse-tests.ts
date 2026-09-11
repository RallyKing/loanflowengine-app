/**
 * Regression: progressive email/phone typing must not create one row per keystroke.
 */
import assert from "node:assert/strict";
import {
  collapsePrefixContactMethodValues,
  mergeScalarsIntoContactMethods,
  normalizeContactMethods,
  resolveContactEmails,
  type ContactEmailEntry,
} from "../lib/contact/contactMethods";

const key = (e: string) => e.trim().toLowerCase() || null;

function run() {
  const steps = [
    "M",
    "MP",
    "MPu",
    "MPus",
    "MPush",
    "MPushy",
    "MPushye",
    "MPushye@gmail.com",
  ];

  let contact: {
    email: string;
    emails?: ContactEmailEntry[];
    phone: string;
    phones?: undefined;
  } = { email: "", emails: undefined, phone: "", phones: undefined };

  for (const typed of steps) {
    const next = mergeScalarsIntoContactMethods(
      contact,
      { email: typed },
      key,
    );
    contact = {
      email: next.email,
      emails: next.emails,
      phone: next.phone,
      phones: undefined,
    };
  }

  assert.equal(contact.emails?.length, 1, "mergeScalars keeps one email row");
  assert.equal(contact.emails?.[0]?.email, "MPushye@gmail.com");

  const junk: ContactEmailEntry[] = steps.map((email, i) => ({
    id: String(i),
    label: "Work",
    email,
    isPrimary: i === 0,
  }));

  const collapsed = collapsePrefixContactMethodValues(junk, (e) => e.email);
  assert.equal(collapsed.length, 1);
  assert.equal(collapsed[0]?.email, "MPushye@gmail.com");

  const resolved = resolveContactEmails({ email: "", emails: junk });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.email, "MPushye@gmail.com");

  const normalized = normalizeContactMethods({ emails: junk }, key);
  assert.equal(normalized.emails.length, 1);
  assert.equal(normalized.email, "MPushye@gmail.com");

  // Distinct emails still allowed.
  const multi = normalizeContactMethods(
    {
      emails: [
        {
          id: "1",
          label: "Work",
          email: "a@example.com",
          isPrimary: true,
        },
        {
          id: "2",
          label: "Personal",
          email: "b@example.com",
          isPrimary: false,
        },
      ],
    },
    key,
  );
  assert.equal(multi.emails.length, 2);

  // Phone typing extension updates primary; distinct number appends.
  let phoneContact = mergeScalarsIntoContactMethods(
    { email: "", phone: "", emails: undefined, phones: undefined },
    { phone: "555" },
    key,
  );
  phoneContact = mergeScalarsIntoContactMethods(
    {
      email: phoneContact.email,
      emails: phoneContact.emails,
      phone: phoneContact.phone,
      phones: phoneContact.phones,
    },
    { phone: "5551234" },
    key,
  );
  assert.equal(phoneContact.phones.length, 1);
  assert.equal(phoneContact.phones[0]?.number, "5551234");

  phoneContact = mergeScalarsIntoContactMethods(
    {
      email: phoneContact.email,
      emails: phoneContact.emails,
      phone: phoneContact.phone,
      phones: phoneContact.phones,
    },
    { phone: "2155559999" },
    key,
  );
  assert.equal(phoneContact.phones.length, 2);

  console.log("contact-methods-prefix-collapse-tests: ok");
}

run();
