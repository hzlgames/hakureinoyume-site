import nodemailer from "nodemailer";

type AuthEmail = {
  subject: string;
  text: string;
  to: string;
};

function getEmailConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const secure = process.env.SMTP_SECURE !== "false";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.AUTH_EMAIL_FROM;

  if (!host || !user || !pass || !from) {
    throw new Error("SMTP_HOST, SMTP_USER, SMTP_PASS and AUTH_EMAIL_FROM are required for auth email.");
  }

  return { from, host, pass, port, secure, user };
}

export async function sendAuthEmail({ subject, text, to }: AuthEmail) {
  const { from, host, pass, port, secure, user } = getEmailConfig();
  const transporter = nodemailer.createTransport({
    auth: {
      pass,
      user
    },
    host,
    port,
    secure
  });

  await transporter.sendMail({
    from,
    subject,
    text,
    to
  });
}
