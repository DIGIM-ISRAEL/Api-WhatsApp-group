const config = require("./config");
const logger = require("./logger");
const { sendMail } = require("./mailer");

function getPath(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Decides whether a Peach contact is attached to an education institution,
 * based on the field named by PEACH_INSTITUTION_LINK_FIELD. Returns
 * { linked, reason }. Without that field configured we can't tell, and
 * report linked=null so callers don't send false "unaffiliated" emails.
 */
function checkInstitution(contact) {
  const { linkField, institutionGroup } = config.teacherNotify;
  if (!linkField) return { linked: null, reason: "PEACH_INSTITUTION_LINK_FIELD not configured" };
  const raw = getPath(contact, linkField);
  const links = (Array.isArray(raw) ? raw : [raw]).filter((v) => v != null && v !== "");
  if (!links.length) return { linked: false, reason: `no value in "${linkField}"` };
  if (!institutionGroup) return { linked: true, reason: "has link" };
  const objects = links.filter((l) => typeof l === "object");
  if (!objects.length) return { linked: true, reason: "has link (no group info to verify)" };
  const ok = objects.some((l) => (l.groups || []).includes(institutionGroup));
  return { linked: ok, reason: ok ? "linked to institution" : `linked entries not in group "${institutionGroup}"` };
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
  const verdict = contact ? checkInstitution(contact) : { linked: false, reason: "contact not in Peach" };
  if (verdict.linked === null) {
    logger.warn(`Teacher ${rawPhone}: cannot check institution - ${verdict.reason}; no email sent`);
    return;
  }
  if (verdict.linked) {
    logger.info(`Teacher ${rawPhone}: already linked to an institution, no email`);
    return;
  }
  const name = [firstName || contact?.firstName, lastName || contact?.lastName].filter(Boolean).join(" ");
  await sendSecretaryMail({ name, phone: `+${rawPhone}` });
  logger.info(`Teacher ${rawPhone}: not linked to an institution (${verdict.reason}), email sent to ${config.teacherNotify.secretaryEmail}`);
}

module.exports = { checkInstitution, notifyIfUnaffiliated, sendSecretaryMail };
