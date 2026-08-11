const cron = require("node-cron");
const config = require("./config");
const greenApi = require("./greenApiClient");
const store = require("./store");
const logger = require("./logger");
const { phoneFromChatId } = require("./phone");
const { upsertContactInGroup } = require("./contactSync");

/**
 * GREEN-API has no webhook that fires when someone joins a group (see
 * README). This reconciliation loop is what catches members who were added
 * or who joined via invite link without ever sending a message: it polls
 * each watched group's current member list and diffs it against what we
 * saw last time.
 */
async function syncGroup({ chatId, label }) {
  const groupData = await greenApi.getGroupData(chatId);
  const currentMembers = (groupData.participants || []).map((p) => p.id);
  const known = new Set(store.getKnownMembers(chatId));
  const newMembers = currentMembers.filter((id) => !known.has(id));

  for (const memberChatId of newMembers) {
    const rawPhone = phoneFromChatId(memberChatId);
    if (!rawPhone) continue;

    let firstName;
    let lastName;
    const contactInfo = await greenApi.getContactInfo(memberChatId);
    if (contactInfo?.name) {
      const [first, ...rest] = contactInfo.name.split(" ");
      firstName = first;
      lastName = rest.join(" ") || undefined;
    }

    try {
      await upsertContactInGroup({ rawPhone, groupLabel: label, firstName, lastName });
    } catch (err) {
      logger.error(`Failed to sync ${rawPhone} into "${label}"`, err.response?.data || err.message);
    }
  }

  store.setKnownMembers(chatId, currentMembers);
  if (newMembers.length) {
    logger.info(`Group "${label}": ${newMembers.length} new member(s) synced to Peach`);
  }
}

async function syncAllGroups() {
  for (const group of config.greenApi.watchedGroups) {
    try {
      await syncGroup(group);
    } catch (err) {
      logger.error(`Failed to poll group ${group.chatId}`, err.response?.data || err.message);
    }
  }
}

function startPolling() {
  const minutes = config.greenApi.pollIntervalMinutes;
  logger.info(`Starting group poller: every ${minutes} minute(s) for ${config.greenApi.watchedGroups.length} group(s)`);
  syncAllGroups();
  cron.schedule(`*/${minutes} * * * *`, syncAllGroups);
}

module.exports = { startPolling, syncAllGroups, syncGroup };
