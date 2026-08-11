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

function serializeGroupsField(groups) {
  return groups.join(", ");
}

/**
 * Ensures a Peach contact exists for `rawPhone` and that its WhatsApp-groups
 * custom field includes `groupLabel`. Creates the contact if missing,
 * otherwise merges the group into the existing field value (a contact can
 * be in more than one watched group).
 */
async function upsertContactInGroup({ rawPhone, groupLabel, firstName, lastName }) {
  const phone = formatPhone(rawPhone);
  const fieldKey = config.peach.groupsField;

  const existing = await peach.findContactByPhone(phone);

  if (!existing) {
    const created = await peach.createContact({
      telephone: phone,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      customProperties: {
        [fieldKey]: serializeGroupsField([groupLabel]),
      },
    });
    logger.info(`Created Peach contact ${created?.contactId || ""} for ${phone} in group "${groupLabel}"`);
    return { action: "created", contact: created };
  }

  const currentGroups = parseGroupsField(existing.customProperties?.[fieldKey]);
  if (currentGroups.includes(groupLabel)) {
    logger.info(`Contact ${existing.contactId} already tagged with "${groupLabel}", skipping`);
    return { action: "unchanged", contact: existing };
  }

  const updatedGroups = [...currentGroups, groupLabel];
  const updated = await peach.updateContact(existing.contactId, {
    customProperties: {
      ...existing.customProperties,
      [fieldKey]: serializeGroupsField(updatedGroups),
    },
  });
  logger.info(`Updated Peach contact ${existing.contactId}: added group "${groupLabel}"`);
  return { action: "updated", contact: updated };
}

module.exports = { upsertContactInGroup };
