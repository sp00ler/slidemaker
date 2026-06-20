import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

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
