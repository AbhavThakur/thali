import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CloudError,
  createCloud,
  formatRecoveryCode,
  hasNoEmail,
  isCode,
  isEmail,
  isExpiring,
  isRecoveryCode,
  normalizeRecoveryCode,
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

test("recovery codes are normalised, checked and shown in groups of four", () => {
  const raw = "a1b2c3d4e5f6a7b8c9d0e1f2";
  assert.equal(
    normalizeRecoveryCode("a1b2-c3d4 e5f6-A7B8-C9D0-E1F2"),
    raw.toUpperCase(),
  );
  assert.ok(isRecoveryCode("A1B2-C3D4-E5F6-A7B8-C9D0-E1F2"));
  assert.ok(!isRecoveryCode("A1B2-C3D4"));
  assert.ok(!isRecoveryCode("ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ"));
  assert.equal(formatRecoveryCode(raw), "A1B2-C3D4-E5F6-A7B8-C9D0-E1F2");
});

test("signing in without email posts an empty sign-up and returns an email-less session", async () => {
  const { f, calls } = fake([
    {
      body: {
        access_token: "AT",
        refresh_token: "RT",
        expires_in: 3600,
        user: { email: "" },
      },
    },
  ]);
  const s = await createCloud(cfg, f, () => 0).signInAnonymously();
  assert.equal(calls[0].url, "https://x.supabase.co/auth/v1/signup");
  assert.equal(calls[0].method, "POST");
  assert.ok(hasNoEmail(s));
  assert.equal(s.accessToken, "AT");
});

test("anonymous sign-in switched off in Supabase gives a helpful message", async () => {
  const { f } = fake([
    { status: 422, body: { msg: "Anonymous sign-ins are disabled" } },
  ]);
  await assert.rejects(
    createCloud(cfg, f).signInAnonymously(),
    (e: CloudError) => /anonymous sign-ins/i.test(e.message),
  );
});

test("the recovery code comes from the server and is normalised", async () => {
  const { f, calls } = fake([{ body: "a1b2c3d4e5f6a7b8c9d0e1f2" }]);
  const code = await createCloud(cfg, f).createRecoveryCode(session);
  assert.equal(code, "A1B2C3D4E5F6A7B8C9D0E1F2");
  assert.ok(calls[0].url.endsWith("/rest/v1/rpc/create_recovery_code"));
  assert.equal(calls[0].headers?.Authorization, "Bearer at");
});

test("claiming a code sends only the normalised code, and a wrong one is friendly", async () => {
  const { f, calls } = fake([
    { body: 2 },
    { status: 400, body: { message: "invalid recovery code" } },
  ]);
  const cloud = createCloud(cfg, f);
  assert.equal(
    await cloud.claimRecoveryCode(session, "a1b2-c3d4-e5f6-a7b8-c9d0-e1f2"),
    2,
  );
  assert.deepEqual(JSON.parse(calls[0].body!), {
    code: "A1B2C3D4E5F6A7B8C9D0E1F2",
  });
  await assert.rejects(
    cloud.claimRecoveryCode(session, "A1B2C3D4E5F6A7B8C9D0E1F2"),
    (e: CloudError) => /isn't right/.test(e.message),
  );
  await assert.rejects(
    cloud.claimRecoveryCode(session, "short"),
    (e: CloudError) => e.status === undefined,
  );
  assert.equal(calls.length, 2, "a malformed code never reaches the server");
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

const overview = {
  me: "u1",
  family: { id: "f1", name: "Sharma", invite_code: "K7MQ4X9R" },
  members: [
    {
      user_id: "u1",
      name: "Asha",
      emoji: "👩",
      share_weight: false,
      joined_on: "2026-10-01",
      streak: 4,
    },
  ],
};

test("joining a family sends the cleaned code and maps the reply", async () => {
  const { f, calls } = fake([{ body: overview }]);
  const fam = await createCloud(cfg, f).joinFamily(
    session,
    "k7mq-4x9r",
    "Asha",
    "👩",
  );
  assert.ok(calls[0].url.endsWith("/rest/v1/rpc/join_family"));
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    code: "K7MQ4X9R",
    my_name: "Asha",
    my_emoji: "👩",
  });
  assert.equal(fam.inviteCode, "K7MQ4X9R");
  assert.equal(fam.me, "u1");
  assert.deepEqual(fam.members[0], {
    userId: "u1",
    name: "Asha",
    emoji: "👩",
    shareWeight: false,
    joinedOn: "2026-10-01",
    streak: 4,
  });
});

test("a bad invite code never reaches the server", async () => {
  const { f, calls } = fake([]);
  await assert.rejects(
    createCloud(cfg, f).joinFamily(session, "12345", "Asha", "🙂"),
    /8 letters and numbers/,
  );
  assert.equal(calls.length, 0);
});

test("no family gives null, and server messages come through", async () => {
  assert.equal(
    await createCloud(cfg, fake([{ body: null }]).f).familyOverview(session),
    null,
  );
  const { f } = fake([
    { status: 400, body: { message: "thali:This family is full (12 people)." } },
  ]);
  await assert.rejects(
    createCloud(cfg, f).joinFamily(session, "K7MQ4X9R", "Asha", "🙂"),
    (e: CloudError) => e.message === "This family is full (12 people).",
  );
  const other = fake([{ status: 400, body: { message: "duplicate key value" } }]);
  await assert.rejects(
    createCloud(cfg, other.f).leaveFamily(session),
    (e: CloudError) => !/duplicate/.test(e.message),
  );
});

test("sharing days sends effort only and kudos are trimmed to 80 characters", async () => {
  const { f, calls } = fake([{}, {}]);
  const cloud = createCloud(cfg, f);
  await cloud.publishDays(session, [
    { day: "2026-10-14", logged: true, stars: 2, meals: 3, waterOk: true, weightKg: null },
  ]);
  assert.deepEqual(JSON.parse(calls[0].body ?? "{}"), {
    days: [
      { day: "2026-10-14", logged: true, stars: 2, meals: 3, water_ok: true, weight_kg: null },
    ],
  });
  await cloud.sendKudos(session, "u2", "🔥", "x".repeat(200));
  assert.equal(JSON.parse(calls[1].body ?? "{}").kudos_message.length, 80);
});

test("shared days are grouped by person", async () => {
  const row = (user_id: string, day: string, weight_kg: number | null) => ({
    user_id,
    day,
    logged: true,
    stars: 1,
    meals: 2,
    water_ok: false,
    weight_kg,
  });
  const { f } = fake([
    { body: [row("a", "2026-10-14", null), row("b", "2026-10-14", 61.5), row("a", "2026-10-13", null)] },
  ]);
  const byUser = await createCloud(cfg, f).familyDays(session, "2026-09-01");
  assert.equal(byUser.get("a")?.length, 2);
  assert.equal(byUser.get("b")?.[0].weightKg, 61.5);
});
