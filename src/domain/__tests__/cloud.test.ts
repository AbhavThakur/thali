import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CloudError,
  createCloud,
  isCode,
  isEmail,
  isExpiring,
  type CloudSession,
  type FetchLike,
} from "../cloud.ts";

type Call = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

function fake(replies: { status?: number; body?: unknown }[]) {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, ...init });
    const r = replies.shift() ?? {};
    const status = r.status ?? 200;
    return {
      ok: status < 300,
      status,
      text: async () => (r.body === undefined ? "" : JSON.stringify(r.body)),
    };
  };
  return { f, calls };
}

const cfg = { url: "https://x.supabase.co/", anonKey: "anon" };
const session: CloudSession = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAt: 2000,
  email: "a@b.com",
};

test("emails and codes are checked before any request", () => {
  assert.ok(isEmail(" a@b.co "));
  assert.ok(!isEmail("nope"));
  assert.ok(isCode("123456"));
  assert.ok(!isCode("12ab56"));
});

test("sending a code posts the email with the public key", async () => {
  const { f, calls } = fake([{ body: {} }]);
  await createCloud(cfg, f).sendCode("a@b.com");
  assert.equal(calls[0].url, "https://x.supabase.co/auth/v1/otp");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers?.apikey, "anon");
  assert.deepEqual(JSON.parse(calls[0].body!), {
    email: "a@b.com",
    create_user: true,
  });
});

test("verifying a code returns a session that expires in the future", async () => {
  const { f } = fake([
    {
      body: {
        access_token: "AT",
        refresh_token: "RT",
        expires_in: 3600,
        user: { email: "a@b.com" },
      },
    },
  ]);
  const s = await createCloud(cfg, f, () => 1_000_000).verifyCode(
    "a@b.com",
    "123456",
  );
  assert.equal(s.accessToken, "AT");
  assert.equal(s.expiresAt, 1000 + 3600);
  assert.ok(!isExpiring(s, 1_000_000));
  assert.ok(isExpiring(s, (1000 + 3600 - 30) * 1000));
});

test("a wrong code gives a friendly message", async () => {
  const { f } = fake([{ status: 400, body: { msg: "otp_expired" } }]);
  await assert.rejects(
    createCloud(cfg, f).verifyCode("a@b.com", "123456"),
    (e: CloudError) => /wrong or has expired/.test(e.message),
  );
});

test("upload sends one upsert with the person's key and the user's token", async () => {
  const { f, calls } = fake([{ status: 201 }]);
  await createCloud(cfg, f, () => 0).upload(session, "p1", "Asha", {
    app: "thali",
  });
  const c = calls[0];
  assert.ok(c.url.endsWith("/rest/v1/backups?on_conflict=user_id,profile_key"));
  assert.equal(c.headers?.Authorization, "Bearer at");
  assert.match(c.headers?.Prefer ?? "", /merge-duplicates/);
  const body = JSON.parse(c.body!);
  assert.equal(body.profile_key, "p1");
  assert.equal(body.name, "Asha");
  assert.deepEqual(body.data, { app: "thali" });
});

test("list and download map the column names", async () => {
  const { f, calls } = fake([
    {
      body: [
        { profile_key: "p1", name: "Asha", updated_at: "2026-10-15T00:00:00Z" },
      ],
    },
    {
      body: [
        { profile_key: "p1", name: "Asha", updated_at: "t", data: { a: 1 } },
      ],
    },
    { body: [] },
  ]);
  const cloud = createCloud(cfg, f);
  assert.deepEqual(await cloud.list(session), [
    { profileKey: "p1", name: "Asha", updatedAt: "2026-10-15T00:00:00Z" },
  ]);
  const one = await cloud.download(session, "p1");
  assert.deepEqual(one?.data, { a: 1 });
  assert.ok(calls[1].url.includes("profile_key=eq.p1"));
  assert.equal(await cloud.download(session, "p9"), null);
});

test("a 401 is reported with its status so the app can sign out", async () => {
  const { f } = fake([{ status: 401 }]);
  await assert.rejects(
    createCloud(cfg, f).list(session),
    (e: CloudError) => e.status === 401,
  );
});

test("a network failure becomes a friendly error", async () => {
  const down: FetchLike = async () => {
    throw new TypeError("Network request failed");
  };
  await assert.rejects(
    createCloud(cfg, down).list(session),
    (e: CloudError) =>
      /internet connection/.test(e.message) && e.status === undefined,
  );
});
