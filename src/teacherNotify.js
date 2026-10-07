const config = require("./config");
const logger = require("./logger");
const { sendMail } = require("./mailer");

/**
 * A contact counts as attached to an institution when its Peach `groups`
 * (returned by getContact) contain an institution group - see config.js for
 * how institution groups are recognised. Returns { linked, reason }.
 */
function checkInstitution(contact) {
  const { institutionGroups, institutionGroupPrefix, ignoredGroups } = config.teacherNotify;
  const groups = contact?.groups || [];
  let matches;
  if (institutionGroups.length) {
    matches = groups.filter((g) => institutionGroups.includes(g));
  } else if (institutionGroupPrefix) {
    matches = groups.filter((g) => g.startsWith(institutionGroupPrefix));
  } else {
    const skip = new Set([...config.greenApi.watchedGroups.map((w) => w.label), ...ignoredGroups]);
    matches = groups.filter((g) => !skip.has(g));
  }
  return matches.length
    ? { linked: true, reason: `in institution group(s): ${matches.join(", ")}` }
    : { linked: false, reason: `groups [${groups.join(", ")}] contain no institution group` };
}

async function sendSecretaryMail({ name, phone }) {
  const text = [
    "אהלן,",
    "נכנס לקבוצה מורה שאינו משויך למוסד בפיצ'.",
    "פרטי המורה:",
    `שם: ${name || "לא ידוע"}`,
    `טלפון: ${phone}`,
  ].join("\n");
  return sendMail({
    to: config.teacherNotify.secretaryEmail,
    subject: "מורה חדש בקבוצה ללא שיוך למוסד",
    text,
  });
}

async function notifyIfUnaffiliated({ rawPhone, contact, firstName, lastName }) {
  const verdict = contact?.contactId ? checkInstitution(contact) : { linked: false, reason: "contact not in Peach" };
  if (verdict.linked) {
    logger.info(`Teacher ${rawPhone}: already linked to an institution, no email`);
    return;
  }
  const name = [firstName || contact?.firstName, lastName || contact?.lastName].filter(Boolean).join(" ");
  await sendSecretaryMail({ name, phone: `+${rawPhone}` });
  logger.info(`Teacher ${rawPhone}: not linked to an institution (${verdict.reason}), email sent to ${config.teacherNotify.secretaryEmail}`);
}

module.exports = { checkInstitution, notifyIfUnaffiliated, sendSecretaryMail };
