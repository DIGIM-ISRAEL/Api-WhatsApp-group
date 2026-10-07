const express = require("express");
const config = require("./config");
const store = require("./store");
const logger = require("./logger");
const eventsLog = require("./eventsLog");
const { phoneFromChatId } = require("./phone");
const { upsertContactInGroup } = require("./contactSync");
const { syncAllGroups } = require("./groupPoller");
const greenApi = require("./greenApiClient");
const peach = require("./peachClient");
const { checkInstitution } = require("./teacherNotify");

function findWatchedGroup(chatId) {
  return config.greenApi.watchedGroups.find((g) => g.chatId === chatId);
}

function requireToken(req, res, next) {
  if (config.webhook.sharedSecret && req.query.token !== config.webhook.sharedSecret) {
    return res.status(401).send("unauthorized");
  }
  next();
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
  if (!rawPhone) {
    logger.warn(`Skipping webhook sender ${senderData.sender}: not a plain phone id`);
    return;
  }

  const displayName = senderData.senderName || senderData.senderContactName;
  let firstName;
  let lastName;
  if (displayName) {
    const [first, ...rest] = displayName.split(" ");
    firstName = first;
    lastName = rest.join(" ") || undefined;
  }

  try {
    await upsertContactInGroup({ rawPhone, groupLabel: group.label, groupChatId: group.chatId, notify: known.size > 0, firstName, lastName });
    known.add(senderData.sender);
    store.setKnownMembers(group.chatId, [...known]);
  } catch (err) {
    logger.error(`Failed to sync ${rawPhone} from webhook`, err.response?.data || err.message);
  }
}

function createServer() {
  const app = express();
  app.use(express.json());

  let lastSync = { status: "idle" };

  app.post("/webhooks/green-api", requireToken, async (req, res) => {
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

  // Manually triggers the same reconciliation the poller runs on a schedule -
  // for testing end-to-end without waiting for the interval. Protected by
  // WEBHOOK_SHARED_SECRET the same way the webhook route is.
  //
  // Runs in the background instead of blocking the response: a first sync
  // against an existing group can mean hundreds of sequential Peach/GREEN-API
  // calls, which can take much longer than an HTTP client (or a platform
  // proxy) is willing to wait on a single request. Watch server logs (or
  // GET /admin/sync-status) for progress and the final per-member result.
  app.post("/admin/sync-now", requireToken, async (req, res) => {
    if (lastSync.status === "running") {
      return res.status(409).json({ ok: false, error: "a sync is already running, check /admin/sync-status" });
    }

    lastSync = { status: "running", startedAt: new Date().toISOString(), groups: null };
    res.status(202).json({ ok: true, status: "started", note: "check server logs or GET /admin/sync-status for progress" });

    try {
      const summaries = await syncAllGroups();
      lastSync = { status: "done", startedAt: lastSync.startedAt, finishedAt: new Date().toISOString(), groups: summaries };
      logger.info("Manual sync-now finished");
    } catch (err) {
      lastSync = { status: "error", startedAt: lastSync.startedAt, finishedAt: new Date().toISOString(), error: err.message };
      logger.error("Manual sync-now failed", err);
    }
  });

  app.get("/admin/sync-status", requireToken, (req, res) => {
    res.json(lastSync);
  });

  // How many contacts were created/updated/left unchanged, grouped by
  // calendar day (UTC) - optionally filtered to one group with ?group=<label>.
  // Only reflects activity since this endpoint was deployed; there's no
  // history log of what happened before it existed.
  app.get("/admin/history", requireToken, (req, res) => {
    res.json({ byDate: eventsLog.getStatsByDay({ groupLabel: req.query.group }) });
  });

  // Lists all WhatsApp groups of the instance with their chatId - use it to
  // find the id of "כלכלה ויהדות במערכת החינוך".
  app.get("/admin/groups", requireToken, async (req, res) => {
    try {
      const groups = await greenApi.listGroups();
      const q = req.query.q;
      res.json(q ? groups.filter((g) => g.name?.includes(q)) : groups);
    } catch (err) {
      res.status(502).json({ error: err.response?.data || err.message });
    }
  });

  // Dumps the raw Peach contact for a phone plus the institution verdict, to
  // discover/verify how institutions are linked (see PEACH_INSTITUTION_LINK_FIELD).
  app.get("/admin/peach-contact", requireToken, async (req, res) => {
    try {
      const contact = await peach.findContactByPhone(req.query.phone);
      res.json({ contact, institution: contact ? checkInstitution(contact) : null });
    } catch (err) {
      res.status(502).json({ error: err.response?.data || err.message });
    }
  });

  // Sends the secretary email with fake details to verify SMTP end to end.
  app.post("/admin/test-mail", requireToken, async (req, res) => {
    try {
      const { sendSecretaryMail } = require("./teacherNotify");
      await sendSecretaryMail({ name: "בדיקה", phone: "+972500000000" });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

module.exports = { createServer };
