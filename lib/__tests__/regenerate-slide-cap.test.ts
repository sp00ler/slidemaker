import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

type RegenerateRouteModule = {
  POST: (req: Request) => Promise<Response>;
};

type OrderStub = {
  id: string;
  user_id: string | null;
  tariff: string;
};

type RegenerateCalls = {
  createRegenerationOrder: unknown[];
  bindUploadFilesToOrder: unknown[];
  processOrder: unknown[];
};

type RegenerateState = {
  user: { id: string; email: string } | null;
  orders: Record<string, OrderStub | null>;
  calls: RegenerateCalls;
};

const testOutDir = path.join(process.cwd(), ".test-dist");
let activeRuntimeDir = path.join(testOutDir, "runtime-regenerate");
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
      path.join(activeRuntimeDir, request.slice(2)),
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

async function loadRegenerateRoute(
  orders: Record<string, OrderStub | null>
): Promise<{ mod: RegenerateRouteModule; calls: RegenerateCalls }> {
  const calls: RegenerateCalls = {
    createRegenerationOrder: [],
    bindUploadFilesToOrder: [],
    processOrder: [],
  };
  const state: RegenerateState = {
    user: { id: "user-1", email: "user@example.com" },
    orders,
    calls,
  };
  activeRuntimeDir = path.join(
    testOutDir,
    `runtime-regenerate-${Date.now()}-${Math.random()}`
  );

  const libDir = path.join(activeRuntimeDir, "lib");
  await fs.mkdir(libDir, { recursive: true });
  await fs.writeFile(
    path.join(libDir, "auth.js"),
    `exports.getCurrentUser = async () => global.__regenerateState.user;`
  );
  await fs.writeFile(
    path.join(libDir, "orders.js"),
    `exports.getOrder = async (id) => global.__regenerateState.orders[id] ?? null;
     exports.createRegenerationOrder = async (data) => {
       global.__regenerateState.calls.createRegenerationOrder.push(data);
       return {
         id: "regen-order-id",
         email: data.email,
         user_id: data.userId,
         tariff: data.tariff,
         slide_count: data.slideCount,
         topic: data.topic,
         wishes: data.wishes,
         storyboard: data.storyboard,
         style: data.style,
         status: "generating",
         file_path: null,
         regen_used: false,
         parent_order_id: data.originalOrderId,
         created_at: "2026-06-24T00:00:00.000Z"
       };
     };
     exports.bindUploadFilesToOrder = async (...args) => {
       global.__regenerateState.calls.bindUploadFilesToOrder.push(args);
     };`
  );
  await fs.writeFile(
    path.join(libDir, "generate.js"),
    `exports.processOrder = async (order) => {
       global.__regenerateState.calls.processOrder.push(order);
     };`
  );
  await fs.writeFile(
    path.join(libDir, "uploads.js"),
    `exports.isUuid = (value) => /^[0-9a-f-]{36}$/i.test(value);`
  );
  (globalThis as unknown as { __regenerateState: RegenerateState }).__regenerateState =
    state;

  await transpileSource(
    path.join(process.cwd(), "lib", "tariffs.ts"),
    path.join(libDir, "tariffs.js")
  );
  await transpileSource(
    path.join(process.cwd(), "lib", "checkout-validation.ts"),
    path.join(libDir, "checkout-validation.js")
  );
  const routePath = path.join(activeRuntimeDir, "app", "api", "regenerate", "route.js");
  await transpileSource(
    path.join(process.cwd(), "app", "api", "regenerate", "route.ts"),
    routePath
  );

  for (const stubPath of [
    path.join(libDir, "auth.js"),
    path.join(libDir, "orders.js"),
    path.join(libDir, "generate.js"),
    path.join(libDir, "uploads.js"),
    path.join(libDir, "tariffs.js"),
    path.join(libDir, "checkout-validation.js"),
    routePath,
  ]) {
    delete require.cache[stubPath];
  }

  return { mod: requireFromTest(routePath), calls };
}

function request(body: Record<string, unknown>): Request {
  return new Request("https://slidemaker.test/api/regenerate", {
    method: "POST",
    body: JSON.stringify({
      orderId: "order-id",
      topic: "Valid topic",
      style: "minimal",
      ...body,
    }),
  });
}

test("regenerate uses basic tariff slide cap", async () => {
  const { mod, calls } = await loadRegenerateRoute({
    "order-id": { id: "order-id", user_id: "user-1", tariff: "basic" },
  });

  const rejected = await mod.POST(request({ slideCount: 15 }));
  const rejectedBody = (await rejected.json()) as { error: string };

  assert.equal(rejected.status, 400);
  assert.match(rejectedBody.error, /9/);
  assert.equal(calls.createRegenerationOrder.length, 0);

  const accepted = await mod.POST(request({ slideCount: 9 }));

  assert.equal(accepted.status, 200);
  assert.equal(calls.createRegenerationOrder.length, 1);
  assert.deepEqual(calls.createRegenerationOrder[0], {
    originalOrderId: "order-id",
    userId: "user-1",
    email: "user@example.com",
    tariff: "basic",
    slideCount: 9,
    topic: "Valid topic",
    wishes: null,
    storyboard: null,
    style: "minimal",
  });
});

test("regenerate allows standard tariff max slide count", async () => {
  const { mod, calls } = await loadRegenerateRoute({
    "order-id": { id: "order-id", user_id: "user-1", tariff: "standard" },
  });

  const res = await mod.POST(request({ slideCount: 15 }));

  assert.equal(res.status, 200);
  assert.equal(calls.createRegenerationOrder.length, 1);
  assert.equal(
    (calls.createRegenerationOrder[0] as { tariff: string; slideCount: number }).tariff,
    "standard"
  );
  assert.equal(
    (calls.createRegenerationOrder[0] as { tariff: string; slideCount: number })
      .slideCount,
    15
  );
});

test("regenerate returns 404 for missing or foreign orders", async () => {
  const { mod, calls } = await loadRegenerateRoute({
    "foreign-order": { id: "foreign-order", user_id: "user-2", tariff: "basic" },
  });

  const missing = await mod.POST(request({ orderId: "missing-order", slideCount: 9 }));
  const foreign = await mod.POST(request({ orderId: "foreign-order", slideCount: 9 }));

  assert.equal(missing.status, 404);
  assert.equal(foreign.status, 404);
  assert.equal(calls.createRegenerationOrder.length, 0);
});
