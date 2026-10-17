/**
 * Cloud backup on Supabase, using plain HTTPS calls so no extra package is needed.
 * Sign-in is a one-time code sent by email; each person's backup is one row guarded by row-level security.
 * The anon key is meant to be public: the security comes from the policies in supabase/schema.sql.
 */

import {
  isInviteCode,
  normalizeInviteCode,
  type Family,
  type FamilyDay,
  type FamilyMember,
  type Kudos,
} from "./family.ts";
import {
  foodFromRow,
  sharedId,
  uuidOfShared,
  type SharedFoodRow,
  type SubmissionInfo,
  type SubmissionStatus,
} from "./sharedFoods.ts";
import type { Food } from "./types.ts";

export type CloudConfig = { url: string; anonKey: string };

export type CloudSession = {
  accessToken: string;
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
  email: string;
};

export type CloudBackupRow = {
  profileKey: string;
  name: string;
  updatedAt: string;
};

export type CloudBackup = CloudBackupRow & { data: unknown };

/** `status` is the HTTP status when the server answered; 401 means the sign-in is no longer valid. */
export class CloudError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "CloudError";
    this.status = status;
  }
}

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{6,10}$/;

export const isEmail = (s: string) => EMAIL.test(s.trim());
export const isCode = (s: string) => CODE.test(s.trim());

const FAMILY_MISSING = {
  404: "The family functions are missing. Run the latest supabase/schema.sql.",
};
const FOODS_MISSING = {
  404: "The shared-food functions are missing. Run the latest supabase/schema.sql.",
};

/** Recovery codes are 24 hex characters; people may type dashes, spaces or lower case. */
export const normalizeRecoveryCode = (s: string) =>
  s.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
export const isRecoveryCode = (s: string) =>
  /^[0-9A-F]{24}$/.test(normalizeRecoveryCode(s));
/** "A1B2C3D4E5F6A7B8C9D0E1F2" becomes "A1B2-C3D4-E5F6-A7B8-C9D0-E1F2". */
export const formatRecoveryCode = (s: string) =>
  normalizeRecoveryCode(s).replace(/(.{4})(?=.)/g, "$1-");

/** A session made without an email (anonymous sign-in) has no address. */
export const hasNoEmail = (s: CloudSession) => s.email === "";

/** True when the access token has under a minute left. */
export const isExpiring = (s: CloudSession, nowMs: number) =>
  s.expiresAt - nowMs / 1000 < 60;

/** The database functions raise errors like "thali:That invite code isn't right."; this returns the readable part. */
function serverMessage(body: string): string | undefined {
  try {
    const m = (JSON.parse(body) as { message?: unknown }).message;
    return typeof m === "string" && m.startsWith("thali:")
      ? m.slice(6)
      : undefined;
  } catch {
    return undefined;
  }
}

type OverviewReply = {
  me: string;
  family: { id: string; name: string; invite_code: string };
  members: {
    user_id: string;
    name: string;
    emoji: string;
    share_weight: boolean;
    joined_on: string;
    streak: number;
  }[];
} | null;

function toFamily(r: OverviewReply): Family | null {
  if (!r) return null;
  return {
    id: r.family.id,
    name: r.family.name,
    inviteCode: r.family.invite_code,
    me: r.me,
    members: r.members.map(
      (m): FamilyMember => ({
        userId: m.user_id,
        name: m.name,
        emoji: m.emoji,
        shareWeight: m.share_weight,
        joinedOn: m.joined_on,
        streak: m.streak,
      }),
    ),
  };
}

export function createCloud(
  cfg: CloudConfig,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  now: () => number = Date.now,
) {
  const base = cfg.url.replace(/\/+$/, "");

  async function call<T>(
    path: string,
    init: { method?: string; body?: unknown; token?: string; prefer?: string },
    friendly: Partial<Record<number, string>> = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      apikey: cfg.anonKey,
      "Content-Type": "application/json",
      Authorization: `Bearer ${init.token ?? cfg.anonKey}`,
    };
    if (init.prefer) headers.Prefer = init.prefer;
    let res;
    try {
      res = await fetchFn(`${base}${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new CloudError(
        "Can't reach the cloud. Check your internet connection.",
      );
    }
    const text = await res.text();
    if (!res.ok) {
      const message =
        serverMessage(text) ??
        friendly[res.status] ??
        (res.status === 401
          ? "Your sign-in has expired. Please sign in again."
          : res.status === 429
            ? "Too many tries. Wait a minute and try again."
            : `The cloud answered with an error (${res.status}).`);
      throw new CloudError(message, res.status);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  type TokenReply = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user?: { email?: string };
  };
  const toSession = (r: TokenReply, email: string): CloudSession => ({
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: Math.floor(now() / 1000) + r.expires_in,
    email: r.user?.email ?? email,
  });

  return {
    /** Emails a one-time code; creates the account on first use. */
    async sendCode(email: string) {
      if (!isEmail(email)) throw new CloudError("Enter a valid email address.");
      await call(
        "/auth/v1/otp",
        { method: "POST", body: { email: email.trim(), create_user: true } },
        { 400: "That email address was not accepted." },
      );
    },

    async verifyCode(email: string, code: string): Promise<CloudSession> {
      if (!isCode(code)) throw new CloudError("Enter the code from the email.");
      const r = await call<TokenReply>(
        "/auth/v1/verify",
        {
          method: "POST",
          body: { type: "email", email: email.trim(), token: code.trim() },
        },
        {
          400: "That code is wrong or has expired.",
          401: "That code is wrong or has expired.",
          403: "That code is wrong or has expired.",
          422: "That code is wrong or has expired.",
        },
      );
      return toSession(r, email.trim());
    },

    /** An account with no email: the phone gets its own private identity. Needs "Allow anonymous sign-ins". */
    async signInAnonymously(): Promise<CloudSession> {
      const r = await call<TokenReply>(
        "/auth/v1/signup",
        { method: "POST", body: { data: {}, gotrue_meta_security: {} } },
        {
          400: 'Sign-in without email is switched off in Supabase. Turn on "Allow anonymous sign-ins".',
          422: 'Sign-in without email is switched off in Supabase. Turn on "Allow anonymous sign-ins".',
        },
      );
      return toSession(r, "");
    },

    /** Makes (or replaces) this account's recovery code. The server creates it, so it is truly random. */
    async createRecoveryCode(s: CloudSession): Promise<string> {
      const code = await call<string>(
        "/rest/v1/rpc/create_recovery_code",
        { method: "POST", token: s.accessToken, body: {} },
        {
          404: "The recovery-code functions are missing. Run the latest supabase/schema.sql.",
        },
      );
      return normalizeRecoveryCode(code);
    },

    /** Moves the backups that belong to `code` onto this account. Returns how many backups moved. */
    async claimRecoveryCode(s: CloudSession, code: string): Promise<number> {
      if (!isRecoveryCode(code))
        throw new CloudError("A recovery code has 24 letters and numbers.");
      return call<number>(
        "/rest/v1/rpc/claim_recovery_code",
        {
          method: "POST",
          token: s.accessToken,
          body: { code: normalizeRecoveryCode(code) },
        },
        {
          400: "That recovery code isn't right.",
          404: "The recovery-code functions are missing. Run the latest supabase/schema.sql.",
        },
      );
    },

    async refresh(s: CloudSession): Promise<CloudSession> {
      const r = await call<TokenReply>(
        "/auth/v1/token?grant_type=refresh_token",
        { method: "POST", body: { refresh_token: s.refreshToken } },
        { 400: "Your sign-in has expired. Please sign in again." },
      );
      return toSession(r, s.email);
    },

    async upload(
      s: CloudSession,
      profileKey: string,
      name: string,
      data: unknown,
    ) {
      await call("/rest/v1/backups?on_conflict=user_id,profile_key", {
        method: "POST",
        token: s.accessToken,
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          profile_key: profileKey,
          name,
          data,
          updated_at: new Date(now()).toISOString(),
        },
      });
    },

    async list(s: CloudSession): Promise<CloudBackupRow[]> {
      const rows = await call<
        { profile_key: string; name: string; updated_at: string }[]
      >(
        "/rest/v1/backups?select=profile_key,name,updated_at&order=updated_at.desc",
        {
          token: s.accessToken,
        },
      );
      return rows.map((r) => ({
        profileKey: r.profile_key,
        name: r.name,
        updatedAt: r.updated_at,
      }));
    },

    async download(
      s: CloudSession,
      profileKey: string,
    ): Promise<CloudBackup | null> {
      const rows = await call<
        {
          profile_key: string;
          name: string;
          updated_at: string;
          data: unknown;
        }[]
      >(
        `/rest/v1/backups?profile_key=eq.${encodeURIComponent(profileKey)}&select=profile_key,name,updated_at,data`,
        { token: s.accessToken },
      );
      const r = rows[0];
      return r
        ? {
            profileKey: r.profile_key,
            name: r.name,
            updatedAt: r.updated_at,
            data: r.data,
          }
        : null;
    },

    /** My family and its members, or null when I'm not in one. */
    async familyOverview(s: CloudSession): Promise<Family | null> {
      return toFamily(
        await call<OverviewReply>(
          "/rest/v1/rpc/family_overview",
          { method: "POST", token: s.accessToken, body: {} },
          FAMILY_MISSING,
        ),
      );
    },

    async createFamily(
      s: CloudSession,
      familyName: string,
      myName: string,
      myEmoji: string,
    ): Promise<Family> {
      const f = toFamily(
        await call<OverviewReply>(
          "/rest/v1/rpc/create_family",
          {
            method: "POST",
            token: s.accessToken,
            body: {
              family_name: familyName,
              my_name: myName,
              my_emoji: myEmoji,
            },
          },
          FAMILY_MISSING,
        ),
      );
      if (!f) throw new CloudError("Could not create the family.");
      return f;
    },

    async joinFamily(
      s: CloudSession,
      code: string,
      myName: string,
      myEmoji: string,
    ): Promise<Family> {
      if (!isInviteCode(code))
        throw new CloudError("An invite code has 8 letters and numbers.");
      const f = toFamily(
        await call<OverviewReply>(
          "/rest/v1/rpc/join_family",
          {
            method: "POST",
            token: s.accessToken,
            body: {
              code: normalizeInviteCode(code),
              my_name: myName,
              my_emoji: myEmoji,
            },
          },
          FAMILY_MISSING,
        ),
      );
      if (!f) throw new CloudError("Could not join the family.");
      return f;
    },

    async leaveFamily(s: CloudSession) {
      await call(
        "/rest/v1/rpc/leave_family",
        { method: "POST", token: s.accessToken, body: {} },
        FAMILY_MISSING,
      );
    },

    /** Replaces the invite code; the old one stops working. */
    async newInviteCode(s: CloudSession): Promise<string> {
      return call<string>(
        "/rest/v1/rpc/new_invite_code",
        { method: "POST", token: s.accessToken, body: {} },
        FAMILY_MISSING,
      );
    },

    async updateMember(
      s: CloudSession,
      me: { name: string; emoji: string; shareWeight: boolean; streak: number },
    ) {
      await call(
        "/rest/v1/rpc/update_member",
        {
          method: "POST",
          token: s.accessToken,
          body: {
            my_name: me.name,
            my_emoji: me.emoji,
            my_share_weight: me.shareWeight,
            my_streak: me.streak,
          },
        },
        FAMILY_MISSING,
      );
    },

    /** Shares my daily summaries; the server drops the weight unless I've allowed it. */
    async publishDays(s: CloudSession, days: FamilyDay[]) {
      await call(
        "/rest/v1/rpc/publish_days",
        {
          method: "POST",
          token: s.accessToken,
          body: {
            days: days.map((d) => ({
              day: d.day,
              logged: d.logged,
              stars: d.stars,
              meals: d.meals,
              water_ok: d.waterOk,
              weight_kg: d.weightKg,
            })),
          },
        },
        FAMILY_MISSING,
      );
    },

    /** Everyone's shared days since `from` (yyyy-mm-dd), newest first, grouped by person. */
    async familyDays(
      s: CloudSession,
      from: string,
    ): Promise<Map<string, FamilyDay[]>> {
      const rows = await call<
        {
          user_id: string;
          day: string;
          logged: boolean;
          stars: number;
          meals: number;
          water_ok: boolean;
          weight_kg: number | null;
        }[]
      >(
        `/rest/v1/family_days?day=gte.${encodeURIComponent(from)}&select=user_id,day,logged,stars,meals,water_ok,weight_kg&order=day.desc&limit=1000`,
        { token: s.accessToken },
        FAMILY_MISSING,
      );
      const byUser = new Map<string, FamilyDay[]>();
      for (const r of rows) {
        const list = byUser.get(r.user_id) ?? [];
        list.push({
          day: r.day,
          logged: r.logged,
          stars: r.stars,
          meals: r.meals,
          waterOk: r.water_ok,
          weightKg: r.weight_kg == null ? null : +r.weight_kg,
        });
        byUser.set(r.user_id, list);
      }
      return byUser;
    },

    async sendKudos(
      s: CloudSession,
      toUser: string,
      emoji: string,
      message: string,
    ) {
      await call(
        "/rest/v1/rpc/send_kudos",
        {
          method: "POST",
          token: s.accessToken,
          body: {
            to_member: toUser,
            kudos_emoji: emoji,
            kudos_message: message.trim().slice(0, 80),
          },
        },
        FAMILY_MISSING,
      );
    },

    /** Cheers sent to me, newest first. */
    async myKudos(s: CloudSession, me: string): Promise<Kudos[]> {
      const rows = await call<
        {
          id: number;
          from_user: string;
          to_user: string;
          emoji: string;
          message: string;
          created_at: string;
          seen_at: string | null;
        }[]
      >(
        `/rest/v1/kudos?to_user=eq.${encodeURIComponent(me)}&select=id,from_user,to_user,emoji,message,created_at,seen_at&order=created_at.desc&limit=30`,
        { token: s.accessToken },
        FAMILY_MISSING,
      );
      return rows.map((r) => ({
        id: r.id,
        fromUser: r.from_user,
        toUser: r.to_user,
        emoji: r.emoji,
        message: r.message,
        createdAt: r.created_at,
        seen: r.seen_at != null,
      }));
    },

    async markKudosSeen(s: CloudSession) {
      await call(
        "/rest/v1/rpc/mark_kudos_seen",
        { method: "POST", token: s.accessToken, body: {} },
        FAMILY_MISSING,
      );
    },

    /** Every approved shared food. Needs no sign-in: it is public, with nobody's identity on it. */
    async approvedFoods(): Promise<Food[]> {
      const out: Food[] = [];
      for (let offset = 0; offset < 20_000; offset += 1000) {
        const rows = await call<SharedFoodRow[]>(
          `/rest/v1/approved_foods?select=id,name,unit,grams,kcal,protein,carbs,fat,fiber,tags&order=updated_at.asc,id.asc&limit=1000&offset=${offset}`,
          {},
          FOODS_MISSING,
        );
        out.push(...rows.map(foodFromRow));
        if (rows.length < 1000) break;
      }
      return out;
    },

    /** Sends one of the person's own foods to be checked. Safe to repeat: until reviewed it just updates. */
    async submitFood(
      s: CloudSession,
      clientId: string,
      f: Food,
    ): Promise<{ id: string; status: SubmissionStatus }> {
      return call<{ id: string; status: SubmissionStatus }>(
        "/rest/v1/rpc/submit_food",
        {
          method: "POST",
          token: s.accessToken,
          body: {
            p_client_id: clientId,
            p_name: f.name,
            p_unit: f.measure.unit,
            p_grams: f.measure.grams,
            p_kcal: f.per100g.kcal,
            p_protein: f.per100g.protein,
            p_carbs: f.per100g.carbs,
            p_fat: f.per100g.fat,
            p_fiber: f.per100g.fiber,
            p_tags: f.tags,
          },
        },
        FOODS_MISSING,
      );
    },

    /** What happened to each food this account sent, keyed by the food's id on the phone. */
    async mySubmissions(
      s: CloudSession,
    ): Promise<Record<string, SubmissionInfo>> {
      const rows = await call<
        {
          client_id: string;
          status: SubmissionStatus;
          community_id: string | null;
          admin_note: string;
          changed_by_admin: boolean;
        }[]
      >(
        "/rest/v1/rpc/my_food_submissions",
        { method: "POST", token: s.accessToken, body: {} },
        FOODS_MISSING,
      );
      return Object.fromEntries(
        rows.map((r) => [
          r.client_id,
          {
            status: r.status,
            communityId: r.community_id ? sharedId(r.community_id) : null,
            note: r.admin_note,
            changedByAdmin: r.changed_by_admin,
          },
        ]),
      );
    },

    /** Tells the admin a shared food looks wrong. */
    async reportFood(s: CloudSession, foodId: string, message: string) {
      const uuid = uuidOfShared(foodId);
      if (!uuid) throw new CloudError("Only shared foods can be reported.");
      await call(
        "/rest/v1/rpc/report_food",
        {
          method: "POST",
          token: s.accessToken,
          body: { p_food_id: uuid, p_message: message.trim().slice(0, 300) },
        },
        FOODS_MISSING,
      );
    },
  };
}
