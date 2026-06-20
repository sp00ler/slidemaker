import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import nodemailer from "nodemailer";

type MailOptions = {
  html: string;
  text: string;
};

type MailerModule = {
  formatExpiresAt: (expiresAt: Date) => string;
  sendDeckEmail: (
    to: string,
    downloadUrl: string,
    title: string,
    expiresAt: Date
  ) => Promise<void>;
};

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
process.env.YUKASSA_SHOP_ID = "test";
process.env.YUKASSA_SECRET_KEY = "test";
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_USER = "user";
process.env.SMTP_PASS = "pass";
process.env.APP_URL = "https://slidemaker.ru";
process.env.ANTHROPIC_API_KEY = "test-dummy";

const testOutDir = path.join(process.cwd(), ".test-dist");
const runtimeOutDir = path.join(testOutDir, "runtime");
const requireFromTest = createRequire(__filename);
const moduleWithResolver = Module as typeof Module & {
  _resolveFilename: (
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown
  ) => string;
};
const originalResolveFilename = moduleWithResolver._resolveFilename;

moduleWithResolver._resolveFilename = function (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: unknown
): string {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(runtimeOutDir, request.slice(2)),
      parent,
      isMain,
      options
    );
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

async function transpileSource(srcPath: string, outPath: string): Promise<void> {
  const source = await fs.readFile(srcPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
  }).outputText;

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, output);
}

async function loadMailer(): Promise<MailerModule> {
  await transpileSource(
    path.join(process.cwd(), "lib", "env.ts"),
    path.join(runtimeOutDir, "lib", "env.js")
  );
  await transpileSource(
    path.join(process.cwd(), "lib", "mailer.ts"),
    path.join(runtimeOutDir, "lib", "mailer.js")
  );

  return requireFromTest(path.join(runtimeOutDir, "lib", "mailer.js"));
}

test("sendDeckEmail renders download href and expiry date", async () => {
  let sent: MailOptions | null = null;
  const originalCreateTransport = nodemailer.createTransport;

  nodemailer.createTransport = ((() => ({
    sendMail: async (options: MailOptions) => {
      sent = options;
    },
  })) as unknown) as typeof nodemailer.createTransport;

  try {
    const { formatExpiresAt, sendDeckEmail } = await loadMailer();
    const expiresAt = new Date("2026-06-27T04:39:00.000Z");
    const expiresText = formatExpiresAt(expiresAt);
    const downloadUrl =
      "https://slidemaker.ru/api/download/user-test-20260620-043900-sm_69abcd1234.pptx";

    await sendDeckEmail("user@example.com", downloadUrl, "План запуска", expiresAt);

    assert.ok(sent);
    const mail = sent as MailOptions;
    assert.match(mail.html, /<table role="presentation"/);
    assert.match(mail.html, /<v:roundrect/);
    assert.ok(mail.html.includes(`href="${downloadUrl}"`));
    assert.ok(mail.text.includes(downloadUrl));
    assert.ok(mail.html.includes(expiresText));
    assert.ok(mail.text.includes(expiresText));
    assert.match(mail.text, /1 неделя/);
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }
});
