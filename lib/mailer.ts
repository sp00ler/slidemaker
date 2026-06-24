import nodemailer, { Transporter } from "nodemailer";
import { env } from "@/lib/env";
import type { OrderRow } from "@/lib/orders";
import { createLoginToken } from "@/lib/auth";
import { countUserOrders, upsertUserByEmail } from "@/lib/users";

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
  expiresAt: Date,
  order?: OrderRow
): Promise<void> {
  const from = process.env.MAIL_FROM || "SlideMaker <no-reply@slidemaker.ru>";
  const user = order?.user_id ? null : await upsertUserByEmail(to);
  const userId = order?.user_id ?? user?.id;
  const loginToken = userId ? await createLoginToken(userId) : null;
  const loginUrl = loginToken ? `${env.APP_URL}/login/verify?token=${loginToken}` : undefined;
  const orderCount = userId ? await countUserOrders(userId).catch(() => 0) : 0;
  const { html, text } = renderDeckEmail(
    downloadUrl,
    title,
    expiresAt,
    loginUrl,
    orderCount <= 1
  );

  await getTransporter().sendMail({
    from,
    to,
    subject: `Ваша презентация готова: ${title}`,
    text,
    html,
  });
}

export async function sendLoginEmail(to: string, loginUrl: string): Promise<void> {
  const from = process.env.MAIL_FROM || "SlideMaker <no-reply@slidemaker.ru>";
  const safeLoginUrl = escapeHtml(loginUrl);
  const text =
    `Здравствуйте!\n\n` +
    `Вход в личный кабинет SlideMaker:\n${loginUrl}\n\n` +
    `Ссылка действует 30 минут. Если вы не запрашивали вход, просто игнорируйте письмо.`;
  const html =
    `<!doctype html>` +
    `<html><body style="margin:0;padding:0;background:#F3F4F6;">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F4F6;margin:0;padding:24px 0;">` +
    `<tr><td align="center" style="padding:0 12px;">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-collapse:collapse;">` +
    `<tr><td style="padding:24px 28px 12px 28px;font-family:Arial,sans-serif;color:#111827;font-size:14px;font-weight:700;">SlideMaker</td></tr>` +
    `<tr><td style="padding:8px 28px 0 28px;font-family:Arial,sans-serif;color:#111827;">` +
    `<div style="font-size:28px;line-height:34px;font-weight:800;">Вход в кабинет</div>` +
    `</td></tr>` +
    `<tr><td style="padding:18px 28px 0 28px;font-family:Arial,sans-serif;color:#374151;font-size:16px;line-height:24px;">` +
    `Ссылка действует 30 минут и открывается один раз.` +
    `</td></tr>` +
    `<tr><td align="center" style="padding:26px 28px 18px 28px;">` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">` +
    `<tr><td bgcolor="#111827" style="background:#111827;border-radius:6px;text-align:center;">` +
    `<a href="${safeLoginUrl}" target="_blank" style="display:block;padding:15px 26px;font-family:Arial,sans-serif;font-size:16px;line-height:18px;color:#FFFFFF;text-decoration:none;font-weight:700;">Войти в кабинет</a>` +
    `</td></tr></table>` +
    `</td></tr>` +
    `<tr><td style="padding:0 28px 28px 28px;font-family:Arial,sans-serif;color:#6B7280;font-size:13px;line-height:20px;word-break:break-all;">` +
    `Если кнопка не открылась:<br><a href="${safeLoginUrl}" style="color:#111827;text-decoration:underline;">${safeLoginUrl}</a>` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`;

  await getTransporter().sendMail({
    from,
    to,
    subject: "Вход в личный кабинет SlideMaker",
    text,
    html,
  });
}

export async function sendAuthorCustomerEmail(
  to: string,
  topic: string
): Promise<void> {
  const from = process.env.MAIL_FROM || "SlideMaker <no-reply@slidemaker.ru>";
  const htmlTopic = escapeHtml(topic);
  const contactEmail = "custom@slidemaker.ru";
  const htmlContactEmail = escapeHtml(contactEmail);
  const text =
    `Здравствуйте!\n\n` +
    `Оплата принята. Авторская презентация будет готова за 48 часов.\n` +
    `Тема: ${topic}\n\n` +
    `Пришлите файл работы (ВКР/диплом/диссертация) и пожелания на ${contactEmail}.\n\n` +
    `Спасибо, что выбрали SlideMaker.`;

  const html =
    `<!doctype html>` +
    `<html><body style="margin:0;padding:0;background:#F3F4F6;">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F4F6;margin:0;padding:24px 0;">` +
    `<tr><td align="center" style="padding:0 12px;">` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-collapse:collapse;">` +
    `<tr><td style="padding:24px 28px 12px 28px;font-family:Arial,sans-serif;color:#111827;font-size:14px;font-weight:700;">SlideMaker</td></tr>` +
    `<tr><td style="padding:8px 28px 0 28px;font-family:Arial,sans-serif;color:#111827;">` +
    `<div style="font-size:28px;line-height:34px;font-weight:800;">Оплата принята</div>` +
    `</td></tr>` +
    `<tr><td style="padding:16px 28px 0 28px;font-family:Arial,sans-serif;color:#374151;font-size:16px;line-height:24px;">` +
    `Авторская презентация будет готова за <strong>48 часов</strong>.` +
    `</td></tr>` +
    `<tr><td style="padding:18px 28px 0 28px;font-family:Arial,sans-serif;color:#111827;font-size:16px;line-height:24px;">` +
    `<div style="font-size:13px;color:#6B7280;">Тема</div>` +
    `<div style="font-size:18px;font-weight:700;">${htmlTopic}</div>` +
    `</td></tr>` +
    `<tr><td style="padding:22px 28px 0 28px;font-family:Arial,sans-serif;color:#374151;font-size:15px;line-height:23px;">` +
    `Пришлите файл работы (ВКР/диплом/диссертация) и пожелания на <a href="mailto:${htmlContactEmail}" style="color:#111827;text-decoration:underline;">${htmlContactEmail}</a>.` +
    `</td></tr>` +
    `<tr><td style="padding:24px 28px 28px 28px;font-family:Arial,sans-serif;color:#6B7280;font-size:13px;line-height:20px;border-top:1px solid #E5E7EB;">` +
    `Спасибо, что выбрали SlideMaker.` +
    `</td></tr>` +
    `</table>` +
    `</td></tr></table>` +
    `</body></html>`;

  await getTransporter().sendMail({
    from,
    to,
    subject: `Оплата принята: авторская презентация «${topic}»`,
    text,
    html,
  });
}

export async function sendAdminOrderEmail(order: OrderRow): Promise<void> {
  const from = process.env.MAIL_FROM || "SlideMaker <no-reply@slidemaker.ru>";
  await getTransporter().sendMail({
    from,
    to: env.ADMIN_EMAIL,
    subject: `Авторский заказ ${order.id}`,
    text:
      `Новый авторский заказ\n\n` +
      `Order ID: ${order.id}\n` +
      `Email: ${order.email}\n` +
      `Tariff: ${order.tariff}\n` +
      `Topic: ${order.topic}\n` +
      `Wishes:\n${order.wishes ?? ""}\n\n` +
      `Storyboard:\n${order.storyboard ?? ""}\n\n` +
      `Created at: ${order.created_at}`,
  });
}

export function formatExpiresAt(expiresAt: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
    timeZoneName: "short",
  }).format(expiresAt);
}

export function renderDeckEmail(
  downloadUrl: string,
  title: string,
  expiresAt: Date,
  loginUrl?: string,
  isFirstOrder = false
): { html: string; text: string } {
  const htmlTitle = escapeHtml(title);
  const htmlDownloadUrl = escapeHtml(downloadUrl);
  const expiresText = formatExpiresAt(expiresAt);
  const htmlExpiresText = escapeHtml(expiresText);
  const htmlLoginUrl = loginUrl ? escapeHtml(loginUrl) : "";

  const text =
    `Здравствуйте!\n\n` +
    `Ваша презентация готова.\n` +
    `Название: ${title}\n\n` +
    `Скачать: ${downloadUrl}\n` +
    `\nСсылка действует до ${expiresText} (1 неделя). Скачайте файл вовремя.\n\n` +
    (loginUrl
      ? `${isFirstOrder ? "Вы зарегистрированы в личном кабинете." : "Ваши презентации доступны в личном кабинете."}\n` +
        `Войти: ${loginUrl}\n\n`
      : "") +
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
    (loginUrl
      ? `<tr><td style="padding:18px 28px 0 28px;font-family:Arial,sans-serif;color:#374151;font-size:14px;line-height:22px;">` +
        `<strong>${isFirstOrder ? "Вы зарегистрированы в личном кабинете." : "Ваши презентации доступны в личном кабинете."}</strong><br>` +
        `<a href="${htmlLoginUrl}" style="color:#111827;text-decoration:underline;">Войти в кабинет</a>` +
        `</td></tr>`
      : "") +
    `<tr><td style="padding:24px 28px 28px 28px;font-family:Arial,sans-serif;color:#6B7280;font-size:13px;line-height:20px;border-top:1px solid #E5E7EB;">` +
    `Спасибо, что воспользовались SlideMaker.` +
    `</td></tr>` +
    `</table>` +
    `</td></tr></table>` +
    `</body></html>`;

  return { html, text };
}
