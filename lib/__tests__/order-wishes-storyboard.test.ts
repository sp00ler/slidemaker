import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

// env.ts validates process.env at import; set defaults so stubs that miss are safe.
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
process.env.YUKASSA_SHOP_ID ||= "test";
process.env.YUKASSA_SECRET_KEY ||= "test";
process.env.SMTP_HOST ||= "smtp.test";
process.env.SMTP_USER ||= "user";
process.env.SMTP_PASS ||= "pass";
process.env.APP_URL ||= "https://slidemaker.ru";
process.env.ANTHROPIC_API_KEY ||= "test-dummy";

type OrderModule = {
  createOrder: (data: {
    email: string;
    tariff: string;
    slideCount: number;
    topic: string;
    wishes: string | null;
    storyboard: string | null;
    style: string;
  }) => Promise<unknown>;
};

type CheckoutModule = {
  parseOptionalText: (
    value: unknown,
    maxLength: number,
    label: string
  ) => { value: string | null; error?: string };
};

type CheckoutRouteModule = {
  POST: (req: Request) => Promise<Response>;
};

type GenerateModule = {
  processOrder: (order: {
    id: string;
    email: string;
    tariff: string;
    slide_count: number;
    topic: string;
    wishes: string | null;
    storyboard: string | null;
    style: string;
    status: string;
    file_path: string | null;
    created_at: string;
  }) => Promise<void>;
};

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

async function loadOrders(): Promise<{ mod: OrderModule; calls: unknown[][] }> {
  const calls: unknown[][] = [];
  const ordersOutPath = path.join(runtimeOutDir, "lib", "orders.js");
  await fs.mkdir(path.join(runtimeOutDir, "lib"), { recursive: true });
  await fs.writeFile(
    path.join(runtimeOutDir, "lib", "db.js"),
    `exports.pool = { query: async (...args) => {
      global.__orderQueryCalls.push(args);
      return { rows: [{ id: "order-id" }] };
    } };`
  );
  (globalThis as unknown as { __orderQueryCalls: unknown[][] }).__orderQueryCalls = calls;

  await transpileSource(
    path.join(process.cwd(), "lib", "orders.ts"),
    ordersOutPath
  );
  delete require.cache[ordersOutPath];

  return {
    mod: requireFromTest(ordersOutPath),
    calls,
  };
}

async function loadCheckout(): Promise<CheckoutModule> {
  await transpileSource(
    path.join(process.cwd(), "lib", "checkout-validation.ts"),
    path.join(runtimeOutDir, "lib", "checkout-validation.js")
  );

  return requireFromTest(path.join(runtimeOutDir, "lib", "checkout-validation.js"));
}

async function loadCheckoutRoute(): Promise<{
  mod: CheckoutRouteModule;
  calls: { createOrder: unknown[]; createPayment: unknown[]; bindUploads: unknown[] };
}> {
  const calls = {
    createOrder: [] as unknown[],
    createPayment: [] as unknown[],
    bindUploads: [] as unknown[],
  };
  const ordersPath = path.join(runtimeOutDir, "lib", "orders.js");
  const yookassaPath = path.join(runtimeOutDir, "lib", "yookassa.js");
  const envPath = path.join(runtimeOutDir, "lib", "env.js");
  const uploadsPath = path.join(runtimeOutDir, "lib", "uploads.js");
  await fs.mkdir(path.join(runtimeOutDir, "lib"), { recursive: true });
  await fs.writeFile(
    ordersPath,
    `exports.createOrder = async (data) => {
      global.__checkoutCalls.createOrder.push(data);
      return { id: "order-id" };
    };
    exports.bindUploadFilesToOrder = async (...args) => {
      global.__checkoutCalls.bindUploads.push(args);
    };`
  );
  await fs.writeFile(
    yookassaPath,
    `exports.createPayment = async (data) => {
      global.__checkoutCalls.createPayment.push(data);
      return { confirmationUrl: "https://pay.test" };
    };`
  );
  await fs.writeFile(
    envPath,
    `exports.env = { APP_URL: "https://slidemaker.ru" };`
  );
  await fs.writeFile(
    uploadsPath,
    `exports.isUuid = (value) => /^[0-9a-f-]{36}$/i.test(value);`
  );
  delete require.cache[ordersPath];
  delete require.cache[yookassaPath];
  delete require.cache[envPath];
  delete require.cache[uploadsPath];
  (globalThis as unknown as { __checkoutCalls: typeof calls }).__checkoutCalls = calls;

  await transpileSource(
    path.join(process.cwd(), "lib", "tariffs.ts"),
    path.join(runtimeOutDir, "lib", "tariffs.js")
  );
  await transpileSource(
    path.join(process.cwd(), "lib", "checkout-validation.ts"),
    path.join(runtimeOutDir, "lib", "checkout-validation.js")
  );
  const routePath = path.join(runtimeOutDir, "app", "api", "checkout", "route.js");
  await transpileSource(
    path.join(process.cwd(), "app", "api", "checkout", "route.ts"),
    routePath
  );
  delete require.cache[routePath];

  return { mod: requireFromTest(routePath), calls };
}

async function loadGenerateManual(): Promise<{
  mod: GenerateModule;
  calls: { markAwaitingManual: string[]; generateDeck: unknown[]; mailer: string[] };
}> {
  const calls = {
    markAwaitingManual: [] as string[],
    generateDeck: [] as unknown[],
    mailer: [] as string[],
  };
  const ordersPath = path.join(runtimeOutDir, "lib", "orders.js");
  const anthropicPath = path.join(runtimeOutDir, "lib", "anthropic.js");
  const pptxPath = path.join(runtimeOutDir, "lib", "pptx.js");
  const mailerPath = path.join(runtimeOutDir, "lib", "mailer.js");
  const envPath = path.join(runtimeOutDir, "lib", "env.js");
  const tariffsPath = path.join(runtimeOutDir, "lib", "tariffs.js");
  await fs.mkdir(path.join(runtimeOutDir, "lib"), { recursive: true });
  await fs.writeFile(
    ordersPath,
    `exports.markAwaitingManual = async (id) => global.__generateCalls.markAwaitingManual.push(id);
     exports.markDone = async () => {};
     exports.markError = async () => {};`
  );
  await fs.writeFile(
    anthropicPath,
    `exports.generateDeck = async (data) => global.__generateCalls.generateDeck.push(data);`
  );
  await fs.writeFile(
    pptxPath,
    `exports.buildPptx = async () => {};`
  );
  await fs.writeFile(
    mailerPath,
    `exports.sendAuthorCustomerEmail = async () => global.__generateCalls.mailer.push("customer");
     exports.sendAdminOrderEmail = async () => global.__generateCalls.mailer.push("admin");
     exports.sendDeckEmail = async () => {};`
  );
  await fs.writeFile(
    envPath,
    `exports.env = { APP_URL: "https://slidemaker.ru", DOWNLOADS_TTL_DAYS: 7 };`
  );
  await fs.writeFile(
    tariffsPath,
    `exports.TARIFFS = { author: { id: "author", manual: true } };`
  );
  for (const stubPath of [
    ordersPath,
    anthropicPath,
    pptxPath,
    mailerPath,
    envPath,
    tariffsPath,
  ]) {
    delete require.cache[stubPath];
  }
  (globalThis as unknown as { __generateCalls: typeof calls }).__generateCalls = calls;

  const generatePath = path.join(runtimeOutDir, "lib", "generate.js");
  await transpileSource(path.join(process.cwd(), "lib", "generate.ts"), generatePath);
  delete require.cache[generatePath];

  return { mod: requireFromTest(generatePath), calls };
}

test("checkout optional text validator rejects oversized values", async () => {
  const { parseOptionalText } = await loadCheckout();

  assert.deepEqual(parseOptionalText("x".repeat(501), 500, "Пожелания"), {
    value: null,
    error: "Пожелания не должен превышать 500 символов",
  });
  assert.deepEqual(parseOptionalText("  ", 500, "Пожелания"), { value: null });
  assert.deepEqual(parseOptionalText("  ok  ", 500, "Пожелания"), { value: "ok" });
});

test("createOrder inserts wishes and storyboard", async () => {
  const { mod, calls } = await loadOrders();

  await mod.createOrder({
    email: "user@example.com",
    tariff: "basic",
    slideCount: 5,
    topic: "Topic",
    wishes: "Пожелания",
    storyboard: "Сториборд",
    style: "minimal",
  });

  assert.equal(calls.length, 1);
  const [sql, params] = calls[0] as [string, unknown[]];
  assert.match(sql, /topic, wishes, storyboard, style/);
  assert.deepEqual(params, [
    "user@example.com",
    "basic",
    5,
    "Topic",
    "Пожелания",
    "Сториборд",
    "minimal",
  ]);
});

test("checkout author accepts missing slideCount when wishes exists", async () => {
  const { mod, calls } = await loadCheckoutRoute();

  const res = await mod.POST(
    new Request("https://slidemaker.test/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.com",
        tariff: "author",
        style: "minimal",
        topic: "Topic",
        wishes: "Нужна авторская презентация",
      }),
    })
  );

  assert.equal(res.status, 200);
  assert.equal(calls.createOrder.length, 1);
  assert.equal((calls.createOrder[0] as { slideCount: number }).slideCount, 0);
  assert.equal((calls.createPayment[0] as { amountRub: number }).amountRub, 1399);
});

test("checkout author rejects empty wishes", async () => {
  const { mod } = await loadCheckoutRoute();

  const res = await mod.POST(
    new Request("https://slidemaker.test/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.com",
        tariff: "author",
        style: "minimal",
        topic: "Topic",
      }),
    })
  );
  const body = (await res.json()) as { error: string };

  assert.equal(res.status, 400);
  assert.equal(body.error, "Опишите задачу для авторской презентации");
});

test("checkout binds uploaded files after order creation", async () => {
  const { mod, calls } = await loadCheckoutRoute();

  const res = await mod.POST(
    new Request("https://slidemaker.test/api/checkout", {
      method: "POST",
      body: JSON.stringify({
        email: "user@example.com",
        tariff: "basic",
        style: "minimal",
        topic: "Topic",
        slideCount: 5,
        uploadToken: "11111111-1111-4111-8111-111111111111",
      }),
    })
  );

  assert.equal(res.status, 200);
  assert.deepEqual(calls.bindUploads, [
    ["order-id", "11111111-1111-4111-8111-111111111111"],
  ]);
});

test("processOrder author skips generation and sends manual emails", async () => {
  const { mod, calls } = await loadGenerateManual();

  await mod.processOrder({
    id: "order-id",
    email: "user@example.com",
    tariff: "author",
    slide_count: 0,
    topic: "Topic",
    wishes: "Wishes",
    storyboard: "Storyboard",
    style: "minimal",
    status: "generating",
    file_path: null,
    created_at: "2026-06-20T00:00:00.000Z",
  });

  assert.deepEqual(calls.markAwaitingManual, ["order-id"]);
  assert.deepEqual(calls.generateDeck, []);
  assert.deepEqual(calls.mailer, ["customer", "admin"]);
});
