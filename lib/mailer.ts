import nodemailer, { Transporter } from "nodemailer";
import { env } from "@/lib/env";

let transporter: Transporter | null = null;

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
  title: string
): Promise<void> {
  const from = process.env.MAIL_FROM || "SlideMaker <no-reply@slidemaker.ru>";

  await getTransporter().sendMail({
    from,
    to,
    subject: `Ваша презентация готова: ${title}`,
    text:
      `Здравствуйте!\n\n` +
      `Ваша презентация «${title}» готова.\n` +
      `Скачать: ${downloadUrl}\n\n` +
      `Спасибо, что воспользовались SlideMaker.`,
    html:
      `<div style="font-family:Arial,sans-serif;font-size:15px;color:#0F172A;line-height:1.6">` +
      `<p>Здравствуйте!</p>` +
      `<p>Ваша презентация «<b>${title}</b>» готова.</p>` +
      `<p><a href="${downloadUrl}" style="display:inline-block;background:#2563EB;color:#fff;` +
      `padding:12px 22px;border-radius:8px;text-decoration:none">Скачать презентацию</a></p>` +
      `<p style="color:#64748B;font-size:13px">${downloadUrl}</p>` +
      `<p style="color:#64748B;font-size:13px">Спасибо, что воспользовались SlideMaker.</p>` +
      `</div>`,
  });
}
