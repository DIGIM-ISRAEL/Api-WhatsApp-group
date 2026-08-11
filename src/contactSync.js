const config = require("./config");
const peach = require("./peachClient");
const logger = require("./logger");
const { formatPhone } = require("./phone");

function parseGroupsField(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function resolveNames(rawPhone, firstName, lastName) {
  return {
    firstName: firstName || config.peach.defaultFirstName,
    lastName: lastName || `${config.peach.defaultLastNamePrefix} ${rawPhone}`,
  };
}

function resolveEmail(rawPhone, email) {
  if (email) return email;
  if (!config.peach.placeholderEmailDomain) return undefined;
  return `${rawPhone}@${config.peach.placeholderEmailDomain}`;
}

/**
 * Ensures a Peach contact exists for `rawPhone` and is tagged with
 * `groupLabel` (the WhatsApp group it just joined / was found in). Creates
 * the contact if missing, otherwise adds the group without touching groups
 * it's already tagged with (a contact can be in more than one watched
 * WhatsApp group).
 */
async function upsertContactInGroup({ rawPhone, groupLabel, firstName, lastName, email }) {
  const phone = formatPhone(rawPhone);
  const names = resolveNames(rawPhone, firstName, lastName);
  const existing = await peach.findContactByPhone(phone);

  const groupPayload =
    config.peach.groupSyncMode === "nativeGroups"
      ? { groups: [groupLabel] }
      : { customProperties: { [config.peach.groupsField]: groupLabel } };

  if (!existing) {
    const created = await peach.createContact({
      firstName: names.firstName,
      lastName: names.lastName,
      phone,
      email: resolveEmail(rawPhone, email),
      ...groupPayload,
    });
    logger.info(`Created Peach contact ${created?.contactId || ""} for ${phone} in group "${groupLabel}"`);
    return { action: "created", contact: created };
  }

  if (config.peach.groupSyncMode === "nativeGroups") {
    if ((existing.groups || []).includes(groupLabel)) {
      logger.info(`Contact ${existing.contactId} already in group "${groupLabel}", skipping`);
      return { action: "unchanged", contact: existing };
    }
    const updated = await peach.updateContact(existing.contactId, { groups: [groupLabel] });
    logger.info(`Updated Peach contact ${existing.contactId}: added to group "${groupLabel}"`);
    return { action: "updated", contact: updated };
  }

  const fieldKey = config.peach.groupsField;
  const currentGroups = parseGroupsField(existing.customProperties?.[fieldKey]);
  if (currentGroups.includes(groupLabel)) {
    logger.info(`Contact ${existing.contactId} already tagged with "${groupLabel}", skipping`);
    return { action: "unchanged", contact: existing };
  }
  const updated = await peach.updateContact(existing.contactId, {
    customProperties: { [fieldKey]: [...currentGroups, groupLabel].join(", ") },
  });
  logger.info(`Updated Peach contact ${existing.contactId}: added group "${groupLabel}" to custom field`);
  return { action: "updated", contact: updated };
}

module.exports = { upsertContactInGroup };
