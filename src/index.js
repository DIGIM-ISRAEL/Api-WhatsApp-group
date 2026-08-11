const config = require("./config");
const logger = require("./logger");
const { createServer } = require("./webhookServer");
const { startPolling } = require("./groupPoller");

const app = createServer();
app.listen(config.webhook.port, () => {
  logger.info(`Webhook server listening on port ${config.webhook.port}`);
});

startPolling();
