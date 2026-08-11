const config = require("./config");

// GREEN-API ids look like "972501234567@c.us" (contact) or "...@g.us" (group).
function phoneFromChatId(chatId) {
  if (!chatId) return null;
  const [rawPhone] = chatId.split("@");
  return rawPhone && /^\d+$/.test(rawPhone) ? rawPhone : null;
}

// rawPhone is digits only, international format without "+", e.g. "972501234567"
function formatPhone(rawPhone, format = config.peach.phoneFormat) {
  if (!rawPhone) return rawPhone;
  if (format === "local-il" && rawPhone.startsWith("972")) {
    return `0${rawPhone.slice(3)}`;
  }
  if (format === "e164") {
    return `+${rawPhone}`;
  }
  return rawPhone;
}

module.exports = { phoneFromChatId, formatPhone };
