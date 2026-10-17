# Thali

A free, self-guided diet planner and calorie tracker for Indian home food. Built for personal and family use.

## Run it

```sh
npm install        # installs dependencies (use npm, not yarn: package-lock.json is the lockfile)
npm start          # scan the QR code with Expo Go (Android/iOS)
npm test           # domain tests (Node built-in runner, no deps needed)
npm run typecheck
npm run e2e        # end-to-end on an Android emulator with Expo Go + Metro running
npm run e2e:device # Maestro flows on a real Android build in the emulator (needs Maestro, see below)
npm run e2e:device # Maestro flows on a real Android build in the emulator (needs Maestro, see below)
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

## Testing on the Android emulator (real app)

`npm run e2e:device` installs a real release build of the app on the `Pixel_10_Pro` emulator (it starts the emulator if needed) and runs the Maestro flows in `e2e/maestro/`: onboarding to Today, then a features flow (weigh-in, quick add, recipe, fasting, the weekly view, and a restart to check that data survives). Screenshots and a JUnit report go to `e2e/artifacts/device/android/`.

- One-time: `brew install mobile-dev-inc/tap/maestro` (needs Java 17 or newer).
- `npm run e2e:device` reuses the last test build; `npm run e2e:device -- --build` makes a fresh one (about 4 minutes); `-- --flow 02` runs one flow.
- The test build is made with `EXPO_PUBLIC_E2E=1`: it never installs published updates and says "test build" at the bottom of the Me tab. It also leaves `android/` holding a test build, so run `npm run build` again before sharing an APK.
- Flows find things by text or accessibility label, so give new buttons a label. Avoid `hideKeyboard` inside sheets (Back closes the sheet on Android), and expect the "Achievement unlocked" pop-up after a first log.
- `npm run e2e:web` (Playwright on Expo web) is the quick check; the emulator run is the one that sees real layout and the keyboard.

## Testing on the Android emulator (real app)

`npm run e2e:device` installs a real release build of the app on the `Pixel_10_Pro` emulator (it starts it if needed) and r`npm run e2e:device` installs a real release build of the app on the `Pixel_10_Pro` emulator (it starts it if needed) and r`npm run e2e:device` installs a real release build of the app on the `Pixel_10_Pro` emulator (it starts ts`npm run e2e:device` installs a real release build of the ac/tap/maestro` (needs Java 17+, which this Mac has).
- `npm run e2e:device` reuses the last test build; `npm run e2e:device -- --build` makes a fresh one (about 4 minutes); `-- --flow 02` runs one flow.
- The test build is made with `EXPO_PUBLIC_E2E=1`: it never installs published updates and says "test build" at the bottom of the Me tab. That also leaves `android/` holding a test build, so run `npm run build` again before sharing an APK.
- Flows find things by text or accessibility label, so give new buttons a label. Avoid `hideKeyboard` inside sheets (Back closes the sheet on Android) and expect the "Achievement unlocked" pop-up after a first log.
- `npm run e2e:web` (Playwright on Expo web) is the quick check; the emulator run is the one that sees real layout and the keyboard.

## Shipping updates (no more APK links)

After a one-time setup, every push to `main` publishes the new JavaScript to every installed phone. The app checks when it opens and when it comes back to the foreground, downloads the update in the background and asks "Restart now / Later". Data is untouched. Me → the line at the bottom shows the version and when it was last updated. Uses EAS Update (free Expo account).

One-time setup:

1. Make an account at expo.dev, then `npx eas-cli@latest login`.
2. `npx eas-cli@latest update:configure`. It adds `extra.eas.projectId` and `updates.url` to `app.json` (the runtime version and the `production` channel are already set). Commit that.
3. In the expo.dev dashboard, open the project, Environment variables, and add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` for the `production` environment (they are the same values as in `.env`; published updates are built on Expo's servers and GitHub, which have no `.env`).
4. Build the APK once: `npm run build`, then share it as before. It installs over the old app and keeps data (same package and signing key); this build is version 1.2.0.
5. For automatic publishing, push the repo to GitHub, create a token at expo.dev/settings/access-tokens and add it as the repository secret `EXPO_TOKEN`. `.github/workflows/update.yml` then runs the type check and tests, and publishes. Without GitHub you can publish by hand: `npm run ship -- --message "what changed"`.

Day to day: commit, push, wait a few minutes, open the app twice (or once and tap Restart). If the type check or tests fail, nothing is published.

When a new APK is needed again: only when native code changes (a new native package, a new permission, an Expo SDK upgrade, a new app icon or splash). Then raise `version` in `app.json` (for example 1.3.0) and `android.versionCode`, build and share the APK once. Phones on the old APK keep working and only get updates published for their own version, so nobody gets code their build can't run.

Rollback: `npx eas-cli@latest update:rollback` (or republish the last good commit).

## Updating the app without losing data

Installing a new APK over the old one keeps everything (the database lives in the app's private storage). That only holds if:

- **Same package and signing key.** The package is `com.family.thali`; the release APK is signed with the standard debug key that every `expo prebuild` regenerates (SHA1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`). If either changes, Android refuses the update and the only way in is uninstalling, which deletes the data. Don't change `android.package`, and move to a private keystore only together with a cloud backup.
- **`android.versionCode` goes up** in `app.json` for every APK you hand out (Android refuses a lower number).
- **Never uninstall or "Clear storage"** to update. Expo Go and the APK keep separate data, so data made in Expo Go does not appear in the APK; use cloud backup or Export backup to move it.
- **Database changes only add things.** New tables and columns go in a new `if (version < N)` step in `migrate()` (`src/db/db.ts`), never a drop or rewrite. `npm test` runs the real migration against every old database version (`src/domain/__tests__/migrate.test.ts`); add the new version to its history when you add a step.

Before any update, Me → Cloud backup → Back up now is a cheap safety net.

## Family (optional)

Everyone installs Thali on their own phone, signs in to the cloud (email or recovery code) and joins one family with an 8-letter invite code (Family tab). Members see each other's streak, stars, meals logged today and a weekly "everyone logs 5 days" goal, and can send cheers. Only a small daily summary is shared, never foods or calories; weight is shared only if that person turns on "Share my weight" (off by default, and removing the switch deletes it). Needs the latest `supabase/schema.sql` run once (safe to run again). All writes go through database functions; the tables are read-only for the app, and RLS limits reads to your own family. Push notifications are not built; cheers show as a badge on the Family tab.

## Everyday helpers

- **Recipe builder** (My foods → Make a recipe): pick raw ingredients (about 35 built in, plus any food), type their weights, weigh the finished pot and say how many servings it makes. The dish becomes a food you log by the katori, and it is saved, shared and reviewed like any own food. Raw ingredient values are approximate (`src/domain/ingredients.ts`).
- **Quick add** (Add food → Quick add calories): log just calories (macros optional) when a food can't be found. It stays on the phone: not in search, My foods or the shared list.
- **Repeat**: on Today, "Repeat yesterday's lunch" and "Copy yesterday" add earlier meals in one tap, with Undo.
- **Weigh-in**: the Weigh-in card on Today logs weight in two taps.
- **Fasting timer** (Me → Fasting timer): start and stop a fast with a 12–24 h goal and a short history. Not offered under 18, in pregnancy, or with an eating-disorder history; a doctor note is shown for health conditions. Stored in `settings.fasting`.
- **This week** (Progress): Monday to Sunday bars against the calorie target, judged as a week (one bigger day is fine). Never praises eating well below target.

## Shared foods and the review loop

Every food someone adds in My foods is also sent, without their name, to the cloud as "pending" (once they are signed in; until then it waits on the phone). You check it, fix it if needed, and approve it. Approved foods are downloaded by every install (public `approved_foods` view, refreshed about every 12 hours) and show a "✓ Checked" label. The person who added a food sees its status (In review, Checked, Checked and corrected, Kept private), their own copy is swapped for the checked one (old logs show the corrected values), and approved foods can't be edited by them. Anyone can tap "Report a problem" on a shared food. A new food with the same name and about the same calories as an approved one is matched automatically.

Reviewing, from VS Code (the key never goes in the app or in chat):

1. Get the service-role key: Supabase dashboard, your project, Project Settings (gear icon), API Keys, and copy the `service_role` secret (on the newer layout it is under "Legacy API Keys", or a secret key under "API Keys"; either works). Paste it after `SUPABASE_SERVICE_ROLE_KEY=` in `.env.admin` (git-ignored). The URL comes from `.env`. Treat it like a password: it bypasses all row-level security.
2. `npm run foods:auto` is the automatic review (dry run). It approves clean foods, corrects calories that disagree with the macros, refuses junk names, merges copies of a food that is already shared, and sets aside anything else. `npm run foods:auto -- --yes` applies it. Whatever needs a person is written to `foods-review/needs-human.json` with the reason.
3. For those, ask the assistant to review `foods-review/needs-human.json` (or run `npm run foods:pending` for everything). It writes `foods-review/decisions.json` (`approve` with optional corrected `values`, `reject` with a note, `merge`, `update` a shared food after a report, `dismiss` a report).
4. `npm run foods:apply` shows what would change; `npm run foods:apply -- --yes` writes it. Each change only applies if the food is still in the state the file expects. Corrections reach phones within about half a day, and the person who added the food gets them too.

Needs the latest `supabase/schema.sql` run once (safe to run again).

## Layout

```
app/                 screens (Today, Diet Plan, Progress, Family, Me, Add food, My foods, Cloud, ...)
src/domain/          pure TS: energy, nutrition, foods, templates, plan, people, cloud, family, sharedFoods, foodReview  (+ __tests__)
src/db/              SQLite schema and queries
src/hooks/ src/ui/   React glue and components
supabase/            schema.sql for cloud backup, family and shared foods
scripts/             foods-review.ts (admin tool for shared foods)
```

## Next

1. Verify `src/domain/foods.ts` against IFCT 2017 and grow it toward ~300 dishes (all `verified: false` today).
2. Smart swap, then AI photo/voice logging through a Gemini proxy.
3. Switch themes live (today the theme is read once at start-up).
