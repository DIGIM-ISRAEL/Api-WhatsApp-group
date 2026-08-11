const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "data", "groups-state.json");

function readAll() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

function writeAll(state) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

// Returns the list of member phone numbers we last recorded for a group.
function getKnownMembers(chatId) {
  const state = readAll();
  return state[chatId]?.members || [];
}

function setKnownMembers(chatId, members) {
  const state = readAll();
  state[chatId] = { members, updatedAt: new Date().toISOString() };
  writeAll(state);
}

module.exports = { getKnownMembers, setKnownMembers };
