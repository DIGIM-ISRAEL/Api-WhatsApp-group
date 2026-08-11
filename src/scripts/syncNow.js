const logger = require("../logger");
const { syncAllGroups } = require("../groupPoller");

syncAllGroups()
  .then(() => {
    logger.info("Manual sync complete");
    process.exit(0);
  })
  .catch((err) => {
    logger.error("Manual sync failed", err);
    process.exit(1);
  });
