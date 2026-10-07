const axios = require("axios");
const config = require("./config");
const logger = require("./logger");

const { idInstance, apiTokenInstance, baseUrl } = config.greenApi;

const client = axios.create({ timeout: config.httpTimeoutMs });

function url(method) {
  return `${baseUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}`;
}

// Returns { participants: [{ id: "972501234567@c.us", isAdmin: bool }, ...], ... }
async function getGroupData(groupId) {
  const { data } = await client.post(url("getGroupData"), { groupId });
  return data;
}

async function getContactInfo(chatId) {
  try {
    const { data } = await client.post(url("getContactInfo"), { chatId });
    return data;
  } catch (err) {
    logger.warn("getContactInfo failed for", chatId, err.response?.data || err.message);
    return null;
  }
}

// Lists every group the instance's phone is in, with its chatId (…@g.us) and name.
async function listGroups() {
  const { data } = await client.get(url("getContacts"));
  return (data || []).filter((c) => c.id?.endsWith("@g.us")).map((c) => ({ id: c.id, name: c.name }));
}

module.exports = { getGroupData, getContactInfo, listGroups };
