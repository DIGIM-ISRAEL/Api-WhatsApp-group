const fs = require("fs");
const path = require("path");
const config = require("./config");

const EVENTS_FILE = path.join(config.dataDir, "events.log");

// Append-only JSONL log of every create/update/skip decision, so "how many
// contacts have gone through the system, by date" can be answered later -
// groups-state.json only holds the current snapshot, not history.
function record({ chatId, groupLabel, rawPhone, action }) {
  const entry = { date: new Date().toISOString(), chatId, groupLabel, rawPhone, action };
  fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true });
  fs.appendFileSync(EVENTS_FILE, JSON.stringify(entry) + "\n");
}

function readAll() {
  let raw;
  try {
    raw = fs.readFileSync(EVENTS_FILE, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// { "2026-09-06": { created: 12, updated: 3, unchanged: 500 }, ... }
// Day boundaries are UTC (the date part of the stored ISO timestamp).
function getStatsByDay({ groupLabel } = {}) {
  const events = readAll().filter((ev) => !groupLabel || ev.groupLabel === groupLabel);
  const byDate = {};
  for (const ev of events) {
    const day = ev.date.slice(0, 10);
    byDate[day] = byDate[day] || {};
    byDate[day][ev.action] = (byDate[day][ev.action] || 0) + 1;
  }
  return byDate;
}

module.exports = { record, getStatsByDay };
