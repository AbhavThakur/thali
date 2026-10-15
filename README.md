# Thali

A free, self-guided diet planner and calorie tracker for Indian home food. Built for personal and family use.

## Run it

```sh
npm install        # installs dependencies (use npm, not yarn: package-lock.json is the lockfile)
npm start          # scan the QR code with Expo Go (Android/iOS)
npm test           # domain tests (Node built-in runner, no deps needed)
npm run typecheck
npm run e2e        # end-to-end on an Android emulator with Expo Go + Metro running
npm run e2e:web    # Playwright end-to-end tests on Expo web (starts the web server itself; uses your installed Chrome)
npm run build      # release APK: android/app/build/outputs/apk/release/app-release.apk (needs ANDROID_HOME; don't use sudo)
```

## Decisions

| Area        | Choice                                                | Why                                                                        |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Model       | AI-only, self-serve                                   | No coach; plans must be safe without human review                          |
| App         | Expo (React Native) + Expo Router                     | One codebase for Android/iOS, web later                                    |
| Data        | On-device SQLite (`expo-sqlite`), one file per person | Free, offline, private; family members never mix                           |
| Backup      | Optional Supabase (email code sign-in)                | Safe if the phone is lost; plain HTTPS, no extra package                   |
| Plan engine | Deterministic templates scaled to calorie targets     | AI is bad at arithmetic; plans must add up                                 |
| AI (later)  | Gemini behind a tiny proxy                            | Photo/voice → food items the user confirms; API key never ships in the app |
| Units       | Household measures (roti, katori, glass)              | How Indian families actually count food                                    |

Safety rules built into `src/domain/energy.ts`: Mifflin-St Jeor BMR, deficit capped at 25% of maintenance, floor of 1200 kcal (women) / 1500 kcal (men), adults 18–80 only. Goals: lose weight, stay healthy, gain weight (surplus capped at 20%) and build muscle (capped at 12%, protein 1.8 g/kg). Gain goals hold at maintenance at BMI 25 or more.

The day plan (`buildDayPlan`) moves any rounding shortfall onto breakfast, lunch and dinner, so the average pick lands within about 2% of the target from 1200 to 3500 kcal. `npm test` checks this for every diet.

## Cloud backup (optional)

1. Create a free project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`. It creates one `backups` table with row-level security, so each signed-in user can only read their own rows.
3. Set up custom SMTP (Authentication → Emails → SMTP Settings). Supabase's built-in mailer only sends to your own team members, at 2 emails an hour, and can't edit templates, so sign-in codes won't reach family. Gmail works: host `smtp.gmail.com`, port `465`, your Gmail address as username and sender, and a Google App Password (needs 2-step verification) as the password. Then, under Authentication → Emails → Templates, put `{{ .Token }}` in both the "Confirm sign up" template (new users) and the "Magic link or OTP" template (returning users), for example `Your Thali code: {{ .Token }}`.
4. Copy `.env.example` to `.env` and fill in the project URL and anon key (Project settings → API).
5. Restart with `npx expo start -c`, and rebuild the APK so the keys are included.

In the app: Me → Cloud backup → email → code. The anon key is public by design; the policies protect the data. The sign-in token is stored in the app's private storage.

Sign-in without email (optional): turn on Authentication → Sign In / Providers → "Allow anonymous sign-ins", and re-run `supabase/schema.sql` (it is safe to run again). In the app choose "Start without email". The server makes a random recovery code for the phone; entering it on a new phone moves the backups there. Only a hash of the code is stored. Lose the code and the backup can't be recovered, so the app asks people to save it.

Keeping the free project awake: Supabase pauses free projects after 7 days without activity. `.github/workflows/supabase-keepalive.yml` pings the database every Monday and Thursday. Push the repo to GitHub, then add two repository secrets (Settings → Secrets and variables → Actions): `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Run it once from the Actions tab to check it passes. GitHub stops scheduled runs after 60 days with no commits on public repos, so make a commit now and then, or use a private repo.

## Updating the app without losing data

Installing a new APK over the old one keeps everything (the database lives in the app's private storage). That only holds if:

- **Same package and signing key.** The package is `com.family.thali`; the release APK is signed with the standard debug key that every `expo prebuild` regenerates (SHA1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`). If either changes, Android refuses the update and the only way in is uninstalling, which deletes the data. Don't change `android.package`, and move to a private keystore only together with a cloud backup.
- **`android.versionCode` goes up** in `app.json` for every APK you hand out (Android refuses a lower number).
- **Never uninstall or "Clear storage"** to update. Expo Go and the APK keep separate data, so data made in Expo Go does not appear in the APK; use cloud backup or Export backup to move it.
- **Database changes only add things.** New tables and columns go in a new `if (version < N)` step in `migrate()` (`src/db/db.ts`), never a drop or rewrite. `npm test` runs the real migration against every old database version (`src/domain/__tests__/migrate.test.ts`); add the new version to its history when you add a step.

Before any update, Me → Cloud backup → Back up now is a cheap safety net.

## Family (optional)

Everyone installs Thali on their own phone, signs in to the cloud (email or recovery code) and joins one family with an 8-letter invite code (Family tab). Members see each other's streak, stars, meals logged today and a weekly "everyone logs 5 days" goal, and can send cheers. Only a small daily summary is shared, never foods or calories; weight is shared only if that person turns on "Share my weight" (off by default, and removing the switch deletes it). Needs the latest `supabase/schema.sql` run once (safe to run again). All writes go through database functions; the tables are read-only for the app, and RLS limits reads to your own family. Push notifications are not built; cheers show as a badge on the Family tab.

## Layout

```
app/                 screens (Today, Diet Plan, Progress, Family, Me, Add food, My foods, Cloud, ...)
src/domain/          pure TS: energy, nutrition, foods, templates, plan, people, cloud, family  (+ __tests__)
src/db/              SQLite schema and queries
src/hooks/ src/ui/   React glue and components
supabase/            schema.sql for cloud backup
```

## Next

1. Verify `src/domain/foods.ts` against IFCT 2017 and grow it toward ~300 dishes (all `verified: false` today).
2. Smart swap, then AI photo/voice logging through a Gemini proxy.
3. Switch themes live (today the theme is read once at start-up).
