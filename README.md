# Thali

A free, self-guided diet planner and calorie tracker for Indian home food. Built for personal and family use.

## Run it

```sh
npm run setup      # installs Expo SDK + native deps at matching versions
npm start          # scan the QR code with Expo Go (Android/iOS)
npm test           # domain tests (Node built-in runner, no deps needed)
npm run typecheck
```

## Decisions

| Area        | Choice                                            | Why                                                                        |
| ----------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Model       | AI-only, self-serve                               | No coach; plans must be safe without human review                          |
| App         | Expo (React Native) + Expo Router                 | One codebase for Android/iOS, web later                                    |
| Data        | On-device SQLite (`expo-sqlite`)                  | Free, offline, private; no server to run                                   |
| Plan engine | Deterministic templates scaled to calorie targets | AI is bad at arithmetic; plans must add up                                 |
| AI (later)  | Gemini behind a tiny proxy                        | Photo/voice → food items the user confirms; API key never ships in the app |
| Units       | Household measures (roti, katori, glass)          | How Indian families actually count food                                    |

Safety rules built into `src/domain/energy.ts`: Mifflin-St Jeor BMR, deficit capped at 25% of maintenance, floor of 1200 kcal (women) / 1500 kcal (men), adults 18–80 only.

## Layout

```
app/                 screens (Today, Diet Plan, Profile, Add food)
src/domain/          pure TS: energy, nutrition, foods, templates, plan  (+ __tests__)
src/db/              SQLite schema and queries
src/hooks/ src/ui/   React glue and components
```

## Next

1. Verify `src/domain/foods.ts` against IFCT 2017 and grow it to ~300 dishes (all `verified: false` today).
2. Make the plan engine macro-aware (vegetarian plans currently run low on protein).
3. Weight log and trend chart.
4. Multiple family profiles on one phone.
5. Smart swap, then AI photo/voice logging.
