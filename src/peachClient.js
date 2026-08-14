const axios = require("axios");
const config = require("./config");
const logger = require("./logger");

const client = axios.create({
  baseURL: config.peach.baseUrl,
  timeout: config.httpTimeoutMs,
  headers: {
    Authorization: config.peach.authScheme
      ? `${config.peach.authScheme} ${config.peach.apiKey}`
      : config.peach.apiKey,
    "Content-Type": "application/json",
  },
});

// POST /getContact { phoneNumber } -> { contacts: [...] }
async function findContactByPhone(phoneNumber) {
  const { data } = await client.post("/getContact", { phoneNumber });
  return data?.contacts?.[0] || null;
}

// POST /contacts -> { contactBody, contactId, failedCustomProperties }
async function createContact(contact) {
  const { data } = await client.post("/contacts", contact);
  if (data?.failedCustomProperties && Object.keys(data.failedCustomProperties).length) {
    logger.warn("Peach rejected some custom properties on create:", data.failedCustomProperties);
  }
  return data;
}

// PUT /updateContact/{contactId} -> { success, message, contact }
async function updateContact(contactId, patch) {
  const { data } = await client.put(`/updateContact/${contactId}`, patch);
  return data;
}

module.exports = { findContactByPhone, createContact, updateContact };
