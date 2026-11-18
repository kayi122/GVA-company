import nodemailer from 'nodemailer';

export const smtpConfigured = Boolean(process.env.SMTP_HOST);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
    })
  : null;

export async function sendTestEmail(user) {
  if (!transporter) return { delivered: false };
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: user.email,
    subject: 'GVA Sales Pipeline — test email',
    text: `Hello ${user.fullName},\n\nEmail is working. Sign-in codes will be delivered to your users.`,
  });
  return { delivered: true };
}

export async function sendLoginCode(user, code) {
  if (!transporter) {
    if (process.env.NODE_ENV === 'production') throw new Error('Email is not configured (SMTP_HOST).');
    console.log(`\n  ┌─ Login code for ${user.username} <${user.email}>\n  │  ${code}\n  └─ (SMTP not configured — dev mode)\n`);
    return { delivered: false };
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: user.email,
    subject: `${code} is your GVA sign-in code`,
    text: `Hello ${user.fullName},\n\nYour sign-in code is ${code}. It expires in 10 minutes.\nIf you did not try to sign in, tell your administrator.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px">
      <h2 style="color:#071533">GVA Sales Pipeline</h2>
      <p>Hello ${user.fullName},</p><p>Your sign-in code is:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#7a9420">${code}</p>
      <p style="color:#64748b">It expires in 10 minutes. If you did not try to sign in, tell your administrator.</p></div>`,
  });
  return { delivered: true };
}
