const express = require("express");
const config = require("./config");
const store = require("./store");
const logger = require("./logger");
const { phoneFromChatId } = require("./phone");
const { upsertContactInGroup } = require("./contactSync");

function findWatchedGroup(chatId) {
  return config.greenApi.watchedGroups.find((g) => g.chatId === chatId);
}

/**
 * GREEN-API only tells us about a group member when that member sends a
 * message (typeWebhook = "incomingMessageReceived", senderData.chatId =
 * the group). There is no dedicated "participant joined" event. This gives
 * near-real-time detection for members who post right after joining; the
 * groupPoller.js reconciliation loop is what catches silent joiners this
 * handler would otherwise miss.
 */
async function handleIncomingMessage(body) {
  const { senderData } = body;
  if (!senderData) return;

  const group = findWatchedGroup(senderData.chatId);
  if (!group) return;

  const known = new Set(store.getKnownMembers(group.chatId));
  if (known.has(senderData.sender)) return;

  const rawPhone = phoneFromChatId(senderData.sender);
  if (!rawPhone) return;

  const displayName = senderData.senderName || senderData.senderContactName;
  let firstName;
  let lastName;
  if (displayName) {
    const [first, ...rest] = displayName.split(" ");
    firstName = first;
    lastName = rest.join(" ") || undefined;
  }

  try {
    await upsertContactInGroup({ rawPhone, groupLabel: group.label, firstName, lastName });
    known.add(senderData.sender);
    store.setKnownMembers(group.chatId, [...known]);
  } catch (err) {
    logger.error(`Failed to sync ${rawPhone} from webhook`, err.response?.data || err.message);
  }
}

function createServer() {
  const app = express();
  app.use(express.json());

  app.post("/webhooks/green-api", async (req, res) => {
    if (config.webhook.sharedSecret && req.query.token !== config.webhook.sharedSecret) {
      return res.status(401).send("unauthorized");
    }

    // Respond immediately - GREEN-API expects a fast 2xx and will retry/queue otherwise.
    res.status(200).send("ok");

    const body = req.body || {};
    try {
      if (body.typeWebhook === "incomingMessageReceived") {
        await handleIncomingMessage(body);
      }
    } catch (err) {
      logger.error("Error handling webhook", err);
    }
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  return app;
}

module.exports = { createServer };
