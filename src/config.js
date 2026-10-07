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
  // All outbound HTTP calls (GREEN-API, Peach) abort after this long instead
  // of hanging indefinitely - axios has no default timeout on its own.
  httpTimeoutMs: Number(process.env.HTTP_TIMEOUT_MS || 20000),
  // Where groups-state.json lives. On platforms with an ephemeral
  // filesystem (e.g. Railway without a mounted Volume), this file is lost
  // on every redeploy/restart, which just means the next poll re-treats
  // existing group members as "new" - harmless but wasteful. Point this at
  // a mounted volume's path in production.
  dataDir: process.env.DATA_DIR || require("path").join(__dirname, "..", "data"),
  // Teacher-join notification: when someone joins `teachersGroupId`, check
  // whether their Peach contact is linked to an education institution and,
  // if not, email the secretary.
  teacherNotify: {
    groupId: process.env.TEACHERS_GROUP_ID || "",
    secretaryEmail: process.env.SECRETARY_EMAIL || "",
    // How to recognise an institution among a contact's Peach `groups`:
    // - PEACH_INSTITUTION_GROUPS: explicit comma-separated group names, or
    // - PEACH_INSTITUTION_GROUP_PREFIX: group names starting with this text, or
    // - neither: any group that isn't one of the watched WhatsApp group labels
    //   (or in PEACH_IGNORED_GROUPS) counts as an institution.
    institutionGroups: (process.env.PEACH_INSTITUTION_GROUPS || "").split(",").map((v) => v.trim()).filter(Boolean),
    institutionGroupPrefix: process.env.PEACH_INSTITUTION_GROUP_PREFIX || "",
    ignoredGroups: (process.env.PEACH_IGNORED_GROUPS || "").split(",").map((v) => v.trim()).filter(Boolean),
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  },
  peach: {
    baseUrl: process.env.PEACH_API_BASE_URL || "https://api.peach-in.com/v4",
    apiKey: process.env.PEACH_API_KEY,
    // Docs say "include your API key in the Authorization header" without
    // showing the exact scheme. Defaults to "Bearer <key>"; set
    // PEACH_AUTH_SCHEME="" to send the raw key with no scheme if that fails.
    authScheme: process.env.PEACH_AUTH_SCHEME ?? "Bearer",
    // "nativeGroups": use Peach's built-in contact `groups` array (additive
    //   add via `groups`, `removeGroups` to remove) - this is Peach's own
    //   tagging mechanism, e.g. groups: ["VIP", "Newsletter"] in their docs.
    // "customProperty": store the joined-groups list inside a single
    //   customProperties field instead (set PEACH_WHATSAPP_GROUPS_FIELD to
    //   the custom field's key, as configured in the Peach admin UI).
    groupSyncMode: process.env.PEACH_GROUP_SYNC_MODE || "nativeGroups",
    groupsField: process.env.PEACH_WHATSAPP_GROUPS_FIELD || "whatsapp_groups",
    phoneFormat: process.env.PEACH_PHONE_FORMAT || "e164",
    // create-contact marks firstName/lastName/email with * (required).
    // WhatsApp only reliably gives us a phone number, so these fill the gap.
    // Set PEACH_PLACEHOLDER_EMAIL_DOMAIN="" to omit email instead of faking one.
    defaultFirstName: process.env.PEACH_DEFAULT_FIRST_NAME || "WhatsApp",
    defaultLastNamePrefix: process.env.PEACH_DEFAULT_LAST_NAME_PREFIX || "Contact",
    placeholderEmailDomain: process.env.PEACH_PLACEHOLDER_EMAIL_DOMAIN ?? "whatsapp.invalid",
  },
};

module.exports = config;
