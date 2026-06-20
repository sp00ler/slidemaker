import nodemailer, { Transporter } from "nodemailer";
import { env } from "@/lib/env";

let transporter: Transporter | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = SSL, 587 = STARTTLS
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendDeckEmail(
  to: string,
  downloadUrl: string,
  title: string,
  expiresAt: Date
): Promise<void> {
  const from = process.env.MAIL_FROM || "SlideMaker <no-reply@slidemaker.ru>";
  const { html, text } = renderDeckEmail(downloadUrl, title, expiresAt);

  await getTransporter().sendMail({
    from,
    to,
    subject: `Ваша презентация готова: ${title}`,
    text,
    html,
  });
}

export function formatExpiresAt(expiresAt: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(expiresAt);
}

export function renderDeckEmail(
  downloadUrl: string,
  title: string,
  expiresAt: Date
): { html: string; text: string } {
  const htmlTitle = escapeHtml(title);
  const htmlDownloadUrl = escapeHtml(downloadUrl);
  const expiresText = formatExpiresAt(expiresAt);
  const htmlExpiresText = escapeHtml(expiresText);

  const text =
    `Здравствуйте!\n\n` +
    `Ваша презентация готова.\n` +
    `Название: ${title}\n\n` +
    `Скачать презентацию: ${downloadUrl}\n\n` +
    `Ссылка действует до ${expiresText} (1 неделя). Скачайте файл вовремя.\n\n` +
    `Спасибо, что воспользовались SlideMaker.`;

  const html =
    `<!doctype html>` +
    `<html><body style="margin:0;padding:0;background:#F3F4F6;">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F4F6;margin:0;padding:24px 0;">` +
    `<tr><td align="center" style="padding:0 12px;">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-collapse:collapse;">` +
    `<tr><td style="padding:24px 28px 12px 28px;font-family:Arial,sans-serif;color:#111827;font-size:14px;font-weight:700;">SlideMaker</td></tr>` +
    `<tr><td style="padding:8px 28px 0 28px;font-family:Arial,sans-serif;color:#111827;">` +
    `<div style="font-size:28px;line-height:34px;font-weight:800;">Ваша презентация готова</div>` +
    `</td></tr>` +
    `<tr><td style="padding:16px 28px 0 28px;font-family:Arial,sans-serif;color:#374151;font-size:16px;line-height:24px;">` +
    `Здравствуйте! Мы собрали файл и уже положили его на скачивание.` +
    `</td></tr>` +
    `<tr><td style="padding:18px 28px 0 28px;font-family:Arial,sans-serif;color:#111827;font-size:16px;line-height:24px;">` +
    `<div style="font-size:13px;color:#6B7280;">Название презентации</div>` +
    `<div style="font-size:18px;font-weight:700;">${htmlTitle}</div>` +
    `</td></tr>` +
    `<tr><td align="center" style="padding:28px 28px 16px 28px;">` +
    `<!--[if mso]>` +
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${htmlDownloadUrl}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="12%" stroke="f" fillcolor="#111827">` +
    `<w:anchorlock/>` +
    `<center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">Скачать презентацию</center>` +
    `</v:roundrect>` +
    `<![endif]-->` +
    `<!--[if !mso]><!-->` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">` +
    `<tr><td bgcolor="#111827" style="background:#111827;border-radius:6px;text-align:center;">` +
    `<a href="${htmlDownloadUrl}" target="_blank" style="display:block;padding:15px 26px;font-family:Arial,sans-serif;font-size:16px;line-height:18px;color:#FFFFFF;text-decoration:none;font-weight:700;">Скачать презентацию</a>` +
    `</td></tr></table>` +
    `<!--<![endif]-->` +
    `</td></tr>` +
    `<tr><td style="padding:0 28px 0 28px;font-family:Arial,sans-serif;color:#6B7280;font-size:13px;line-height:20px;word-break:break-all;">` +
    `Если кнопка не открылась, используйте ссылку:<br><a href="${htmlDownloadUrl}" style="color:#111827;text-decoration:underline;">${htmlDownloadUrl}</a>` +
    `</td></tr>` +
    `<tr><td style="padding:20px 28px 0 28px;font-family:Arial,sans-serif;color:#374151;font-size:14px;line-height:22px;">` +
    `<strong>Ссылка действует до ${htmlExpiresText} (1 неделя).</strong><br>Скачайте файл вовремя.` +
    `</td></tr>` +
    `<tr><td style="padding:24px 28px 28px 28px;font-family:Arial,sans-serif;color:#6B7280;font-size:13px;line-height:20px;border-top:1px solid #E5E7EB;">` +
    `Спасибо, что воспользовались SlideMaker.` +
    `</td></tr>` +
    `</table>` +
    `</td></tr></table>` +
    `</body></html>`;

  return { html, text };
}
