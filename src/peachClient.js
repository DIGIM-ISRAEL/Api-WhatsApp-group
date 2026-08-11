const axios = require("axios");
const config = require("./config");

const client = axios.create({
  baseURL: config.peach.baseUrl,
  headers: {
    Authorization: `Bearer ${config.peach.apiKey}`,
    "Content-Type": "application/json",
  },
});

/**
 * Looks up a contact by phone number.
 * NOTE: confirm the exact query param / path against the live Peach docs
 * (https://peach-organization.gitbook.io/peach/api-reference/contacts/get-contact) -
 * this sandbox could not reach that host to verify it. PEACH_PHONE_QUERY_PARAM
 * lets you adjust the param name without touching code.
 */
async function findContactByPhone(phone) {
  const { data } = await client.get("/contacts", {
    params: { [config.peach.phoneQueryParam]: phone },
  });
  const results = Array.isArray(data) ? data : data?.results || data?.data || [];
  return results[0] || null;
}

async function createContact(contact) {
  const { data } = await client.post("/contacts", contact);
  return data;
}

async function updateContact(contactId, patch) {
  const { data } = await client.patch(`/contacts/${contactId}`, patch);
  return data;
}

module.exports = { findContactByPhone, createContact, updateContact };
