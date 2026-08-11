require("dotenv").config();

function parseWatchedGroups(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [chatId, ...labelParts] = entry.split(":");
      return {
        chatId: chatId.trim(),
        label: labelParts.join(":").trim() || chatId.trim(),
      };
    });
}

const config = {
  greenApi: {
    idInstance: process.env.GREEN_API_ID_INSTANCE,
    apiTokenInstance: process.env.GREEN_API_TOKEN_INSTANCE,
    baseUrl: process.env.GREEN_API_BASE_URL || "https://api.greenapi.com",
    watchedGroups: parseWatchedGroups(process.env.GREEN_API_WATCHED_GROUPS),
    pollIntervalMinutes: Number(process.env.GROUP_POLL_INTERVAL_MINUTES || 10),
  },
  webhook: {
    sharedSecret: process.env.WEBHOOK_SHARED_SECRET || "",
    port: Number(process.env.PORT || 3000),
  },
  peach: {
    baseUrl: process.env.PEACH_API_BASE_URL,
    apiKey: process.env.PEACH_API_KEY,
    groupsField: process.env.PEACH_WHATSAPP_GROUPS_FIELD || "whatsapp_groups",
    phoneQueryParam: process.env.PEACH_PHONE_QUERY_PARAM || "telephone",
    phoneFormat: process.env.PEACH_PHONE_FORMAT || "e164",
  },
};

module.exports = config;
