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
// Peach responds with an HTTP 400 (message: "contactNotFound") instead of a
// 200 with an empty array when no contact matches - that's a normal "not
// found" here, not an error, so it's translated to null instead of thrown.
async function findContactByPhone(phoneNumber) {
  try {
    const { data } = await client.post("/getContact", { phoneNumber });
    return data?.contacts?.[0] || null;
  } catch (err) {
    const errData = err.response?.data;
    const isNotFound =
      errData?.message === "contactNotFound" ||
      (Array.isArray(errData?.errors) && errData.errors.includes("contact not found"));
    if (isNotFound) return null;
    throw err;
  }
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
