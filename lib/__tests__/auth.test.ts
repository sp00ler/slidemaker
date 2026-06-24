import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

type AuthModule = {
  createLoginToken: (userId: string) => Promise<string>;
  consumeLoginToken: (rawToken: string) => Promise<string | null>;
  createSession: (userId: string) => Promise<string>;
  getSession: (sessionId: string) => Promise<{ user_id: string } | null>;
  deleteSession: (sessionId: string) => Promise<void>;
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

async function loadAuth({
  expired = false,
}: { expired?: boolean } = {}): Promise<AuthModule> {
  activeRuntimeDir = path.join(testOutDir, `runtime-auth-${Date.now()}-${Math.random()}`);
  await fs.mkdir(path.join(activeRuntimeDir, "lib"), { recursive: true });
  await fs.writeFile(
    path.join(activeRuntimeDir, "lib", "db.js"),
    `const crypto = require("crypto");
     const state = { tokens: [], sessions: [] };
     exports.pool = {
       query: async (sql, params) => {
         sql = String(sql);
         if (sql.includes("INSERT INTO login_tokens")) {
           state.tokens.push({
             id: crypto.randomUUID(),
             user_id: params[0],
             token_hash: params[1],
             expires_at: global.__authExpired ? new Date(Date.now() - 1000) : params[2],
             used_at: null,
             created_at: new Date()
           });
           return { rows: [] };
         }
         if (sql.includes("UPDATE login_tokens")) {
           const row = state.tokens.find((token) =>
             token.token_hash === params[0] && !token.used_at && token.expires_at > new Date()
           );
           if (!row) return { rows: [] };
           row.used_at = new Date();
           return { rows: [{ id: row.id, user_id: row.user_id }] };
         }
         if (sql.includes("INSERT INTO sessions")) {
           const id = crypto.randomUUID();
           state.sessions.push({ id, user_id: params[0], expires_at: params[1], created_at: new Date() });
           return { rows: [{ id }] };
         }
         if (sql.includes("SELECT * FROM sessions")) {
           return { rows: state.sessions.filter((session) => session.id === params[0] && session.expires_at > new Date()) };
         }
         if (sql.includes("DELETE FROM sessions")) {
           state.sessions = state.sessions.filter((session) => session.id !== params[0]);
           return { rows: [] };
         }
         return { rows: [] };
       }
     };`
  );
  await fs.writeFile(
    path.join(activeRuntimeDir, "lib", "users.js"),
    `exports.getUserById = async (id) => ({ id, email: "user@example.com", role: "user", created_at: new Date().toISOString() });`
  );
  (globalThis as unknown as { __authExpired: boolean }).__authExpired = expired;

  const authPath = path.join(activeRuntimeDir, "lib", "auth.js");
  await transpileSource(path.join(process.cwd(), "lib", "auth.ts"), authPath);
  delete require.cache[authPath];
  return requireFromTest(authPath);
}

test("login token is one-time", async () => {
  const auth = await loadAuth();
  const token = await auth.createLoginToken("user-id");

  assert.equal(await auth.consumeLoginToken(token), "user-id");
  assert.equal(await auth.consumeLoginToken(token), null);
});

test("expired login token is rejected", async () => {
  const auth = await loadAuth({ expired: true });
  const token = await auth.createLoginToken("user-id");

  assert.equal(await auth.consumeLoginToken(token), null);
});

test("session create read delete", async () => {
  const auth = await loadAuth();
  const sessionId = await auth.createSession("user-id");

  assert.equal((await auth.getSession(sessionId))?.user_id, "user-id");
  await auth.deleteSession(sessionId);
  assert.equal(await auth.getSession(sessionId), null);
});
