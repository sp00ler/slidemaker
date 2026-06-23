import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

type UploadsModule = {
  MAX_UPLOAD_SIZE: number;
  UploadError: new (message: string) => Error;
  saveUpload: (input: {
    uploadToken: string;
    slideNumber: number;
    file: File;
    description: string | null;
  }) => Promise<{ slideNumber: number }>;
  validateUploadInput: (input: {
    uploadToken: string;
    slideNumber: number;
    declaredMime: string;
    size: number;
    bytes: Uint8Array;
  }) => { ok: true; mime: string; ext: string } | { ok: false; error: string };
};

type OrdersModule = {
  bindUploadFilesToOrder: (orderId: string, uploadToken: string) => Promise<void>;
};

const testOutDir = path.join(process.cwd(), ".test-dist");
const runtimeBaseDir = path.join(testOutDir, "runtime");
let activeRuntimeDir = runtimeBaseDir;
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

async function writeDbStub(count: number): Promise<unknown[][]> {
  const calls: unknown[][] = [];
  await fs.mkdir(path.join(activeRuntimeDir, "lib"), { recursive: true });
  const dbPath = path.join(activeRuntimeDir, "lib", "db.js");
  await fs.writeFile(
    dbPath,
    `exports.pool = { query: async (...args) => {
      global.__uploadQueryCalls.push(args);
      const sql = String(args[0]);
      if (sql.includes('COUNT')) return { rows: [{ count: String(global.__uploadCount) }] };
      return { rows: [] };
    } };`
  );
  (globalThis as unknown as { __uploadQueryCalls: unknown[][] }).__uploadQueryCalls = calls;
  (globalThis as unknown as { __uploadCount: number }).__uploadCount = count;
  delete require.cache[dbPath];
  return calls;
}

async function loadUploads(count = 0): Promise<{ mod: UploadsModule; calls: unknown[][] }> {
  activeRuntimeDir = path.join(testOutDir, `runtime-uploads-${Date.now()}-${Math.random()}`);
  const calls = await writeDbStub(count);
  const uploadsPath = path.join(activeRuntimeDir, "lib", "uploads.js");
  // uploads.ts импортит @/lib/docx — транспилируем и его в runtime-дерево.
  await transpileSource(
    path.join(process.cwd(), "lib", "docx.ts"),
    path.join(activeRuntimeDir, "lib", "docx.js")
  );
  await transpileSource(path.join(process.cwd(), "lib", "uploads.ts"), uploadsPath);
  delete require.cache[uploadsPath];
  return { mod: requireFromTest(uploadsPath), calls };
}

async function loadOrders(count = 0): Promise<{ mod: OrdersModule; calls: unknown[][] }> {
  activeRuntimeDir = path.join(testOutDir, `runtime-orders-${Date.now()}-${Math.random()}`);
  const calls = await writeDbStub(count);
  const ordersPath = path.join(activeRuntimeDir, "lib", "orders.js");
  await transpileSource(path.join(process.cwd(), "lib", "orders.ts"), ordersPath);
  delete require.cache[ordersPath];
  return { mod: requireFromTest(ordersPath), calls };
}

test("upload validation rejects non-image magic bytes", async () => {
  const { mod } = await loadUploads();

  const result = mod.validateUploadInput({
    uploadToken: "11111111-1111-4111-8111-111111111111",
    slideNumber: 1,
    declaredMime: "image/png",
    size: 4,
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  });

  assert.deepEqual(result, {
    ok: false,
    error: "Файл не похож на изображение заявленного типа",
  });
});

test("upload validation rejects oversized file", async () => {
  const { mod } = await loadUploads();

  const result = mod.validateUploadInput({
    uploadToken: "11111111-1111-4111-8111-111111111111",
    slideNumber: 1,
    declaredMime: "image/png",
    size: mod.MAX_UPLOAD_SIZE + 1,
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });

  assert.deepEqual(result, { ok: false, error: "Файл должен быть не больше 5 МБ" });
});

test("upload save rejects more than 15 files per token", async () => {
  const { mod } = await loadUploads(15);
  const file = new File(
    [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    "ignored.png",
    { type: "image/png" }
  );

  await assert.rejects(
    mod.saveUpload({
      uploadToken: "11111111-1111-4111-8111-111111111111",
      slideNumber: 1,
      file,
      description: null,
    }),
    mod.UploadError
  );
});

test("bindUploadFilesToOrder links files by upload token", async () => {
  const { mod, calls } = await loadOrders();

  await mod.bindUploadFilesToOrder(
    "22222222-2222-4222-8222-222222222222",
    "11111111-1111-4111-8111-111111111111"
  );

  assert.equal(calls.length, 1);
  const [sql, params] = calls[0] as [string, unknown[]];
  assert.match(sql, /UPDATE order_files SET order_id = \$1/);
  assert.deepEqual(params, [
    "22222222-2222-4222-8222-222222222222",
    "11111111-1111-4111-8111-111111111111",
  ]);
});
