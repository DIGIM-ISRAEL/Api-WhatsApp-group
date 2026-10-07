const nodemailer = require("nodemailer");
const config = require("./config");

let transport;
function getTransport() {
  if (!config.smtp.host) throw new Error("SMTP_HOST is not configured");
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

async function sendMail({ to, subject, text }) {
  return getTransport().sendMail({ from: config.smtp.from, to, subject, text });
}

module.exports = { sendMail };
