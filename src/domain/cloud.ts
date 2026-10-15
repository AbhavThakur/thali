/**
 * Cloud backup on Supabase, using plain HTTPS calls so no extra package is needed.
 * Sign-in is a one-time code sent by email; each person's backup is one row guarded by row-level security.
 * The anon key is meant to be public: the security comes from the policies in supabase/schema.sql.
 */

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

/** True when the access token has under a minute left. */
export const isExpiring = (s: CloudSession, nowMs: number) =>
  s.expiresAt - nowMs / 1000 < 60;

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
  };
}
