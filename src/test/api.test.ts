/**
 * ParkFit API integration tests.
 * Spawns the server as a child process on port 4099, runs HTTP assertions, then kills it.
 * Requires DATABASE_URL to be set in .env (or passed via environment).
 * Run: npm test
 */

import { config as dotenvConfig } from "dotenv";
import path from "path";
dotenvConfig({ path: path.resolve(__dirname, "../../.env") });

import http from "http";
import { spawn, ChildProcess } from "child_process";

const PORT = 4099;
const BASE = `http://localhost:${PORT}`;

// ── HTTP helper ───────────────────────────────────────────────────────────────

function req(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const url = new URL(path, BASE);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const request = http.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode ?? 0, body: data }); }
      });
    });
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function waitForServer(retries = 20): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const attempt = () => {
      const r = http.get(`${BASE}/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        if (++attempts < retries) setTimeout(attempt, 300);
        else reject(new Error("Server did not start"));
      });
      r.on("error", () => {
        if (++attempts < retries) setTimeout(attempt, 300);
        else reject(new Error("Server did not start"));
      });
    };
    attempt();
  });
}

// ── Test framework ────────────────────────────────────────────────────────────

type TestFn = () => Promise<void>;
const tests: { name: string; fn: TestFn }[] = [];
let passed = 0;
let failed = 0;

function test(name: string, fn: TestFn) {
  tests.push({ name, fn });
}

function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => {
      if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual: (expected: unknown) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeGreaterThan: (n: number) => {
      if (Number(actual) <= n) throw new Error(`Expected ${actual} > ${n}`);
    },
    toBeTruthy: () => {
      if (!actual) throw new Error(`Expected truthy, got ${actual}`);
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("GET /health → 200", async () => {
  const r = await req("GET", "/health");
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
});

test("GET /api/plans → 200 array", async () => {
  const r = await req("GET", "/api/plans");
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body)).toBe(true);
  expect(r.body.length).toBeGreaterThan(0);
});

test("GET /api/trainers → 200 array", async () => {
  const r = await req("GET", "/api/trainers");
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body)).toBe(true);
});

test("GET /api/campaigns → 200 array", async () => {
  const r = await req("GET", "/api/campaigns");
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body)).toBe(true);
});

test("POST /api/contact → 400 with too-short message", async () => {
  const r = await req("POST", "/api/contact", { name: "Test", email: "t@t.com", message: "kısa" });
  expect(r.status).toBe(400);
});

test("POST /api/contact → 200 with valid data", async () => {
  const r = await req("POST", "/api/contact", {
    name: "Test Üye", email: "test@parkfit.com", phone: "+905551234567",
    message: "Merhaba, aylık ücretler hakkında bilgi almak istiyorum.",
  });
  expect(r.status).toBe(200);
  expect(r.body.ok).toBe(true);
});

let authToken = "";
const testEmail = `test_${Date.now()}@parkfit.com`;

test("POST /api/auth/register → 201 with token", async () => {
  const r = await req("POST", "/api/auth/register", {
    name: "Test Üye",
    email: testEmail,
    phone: "+905559876543",
    password: "Secure123!",
    plan_id: 2,
  });
  expect(r.status).toBe(201);
  expect(typeof r.body.token).toBe("string");
  authToken = r.body.token;
});

test("POST /api/auth/register duplicate email → 409", async () => {
  const r = await req("POST", "/api/auth/register", {
    name: "Test Üye", email: testEmail, phone: "", password: "Secure123!",
  });
  expect(r.status).toBe(409);
});

test("POST /api/auth/login with correct credentials → 200 token", async () => {
  const r = await req("POST", "/api/auth/login", { email: testEmail, password: "Secure123!" });
  expect(r.status).toBe(200);
  expect(typeof r.body.token).toBe("string");
  authToken = r.body.token;
});

test("POST /api/auth/login wrong password → 401", async () => {
  const r = await req("POST", "/api/auth/login", { email: testEmail, password: "wrongpassword" });
  expect(r.status).toBe(401);
});

test("GET /api/auth/me without token → 401", async () => {
  const r = await req("GET", "/api/auth/me");
  expect(r.status).toBe(401);
});

test("GET /api/auth/me with valid token → 200 profile", async () => {
  const r = await req("GET", "/api/auth/me", undefined, authToken);
  expect(r.status).toBe(200);
  expect(r.body.email).toBe(testEmail);
});

test("POST /api/bookings without auth → 401", async () => {
  const r = await req("POST", "/api/bookings", {
    class_name: "CrossFit",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
  });
  expect(r.status).toBe(401);
});

test("POST /api/bookings with auth → 201", async () => {
  const r = await req("POST", "/api/bookings", {
    class_name: "CrossFit",
    scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    notes: "İlk ders",
  }, authToken);
  expect(r.status).toBe(201);
  expect(r.body.class_name).toBe("CrossFit");
});

test("GET /api/members/me/bookings with auth → 200 array", async () => {
  const r = await req("GET", "/api/members/me/bookings", undefined, authToken);
  expect(r.status).toBe(200);
  expect(Array.isArray(r.body)).toBe(true);
  expect(r.body.length).toBeGreaterThan(0);
});

test("POST /api/campaigns/claim valid code → 200", async () => {
  const r = await req("POST", "/api/campaigns/claim", { code: "SUMMER20" });
  expect(r.status).toBe(200);
  expect(r.body.discount_pct).toBe(20);
});

test("POST /api/campaigns/claim invalid code → 404", async () => {
  const r = await req("POST", "/api/campaigns/claim", { code: "FAKE999" });
  expect(r.status).toBe(404);
});

test("GET /api/nonexistent → 404", async () => {
  const r = await req("GET", "/api/nonexistent");
  expect(r.status).toBe(404);
});

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Check if a real DB is available
  const hasDb = !!process.env.DATABASE_URL;

  if (!hasDb) {
    console.log("\n⚠️  DATABASE_URL not set. Skipping integration tests.\n");
    console.log("  To run tests, set DATABASE_URL in .env and run: npm test\n");
    process.exit(0);
  }

  let server: ChildProcess | null = null;

  try {
    console.log("\n🚀 Starting ParkFit API on port", PORT, "…");
    server = spawn(
      "npx", ["tsx", "src/index.ts"],
      {
        cwd: path.resolve(__dirname, "../../"),
        env: { ...process.env, PORT: String(PORT) },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    server.stdout?.on("data", (d: Buffer) => process.stdout.write("  [server] " + d));
    server.stderr?.on("data", (d: Buffer) => process.stderr.write("  [server] " + d));

    await waitForServer();
    console.log("  ✅ Server ready\n");
    console.log("🧪 ParkFit API Tests\n" + "─".repeat(50));

    for (const t of tests) {
      try {
        await t.fn();
        console.log(`  ✅ ${t.name}`);
        passed++;
      } catch (err) {
        console.log(`  ❌ ${t.name}: ${(err as Error).message}`);
        failed++;
      }
    }

    console.log("─".repeat(50));
    console.log(`\n  Passed: ${passed}  Failed: ${failed}  Total: ${tests.length}`);

    if (failed === 0) {
      console.log("\n  🎉 All tests passed!\n");
    } else {
      console.log("\n  ⚠️  Some tests failed.\n");
    }
  } finally {
    server?.kill("SIGTERM");
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
