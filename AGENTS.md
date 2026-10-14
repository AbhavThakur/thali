# Thali: agent context

Read this first. Product and setup details are in README.md.

## Product
- Free diet planner and calorie tracker for weight loss, for the owner and their family (not a commercial app).
- AI-only and self-serve: no coach or dietitian. Plans must be safe without human review.
- India-first: Indian home dishes, household measures (roti, katori, glass), veg/egg/non-veg/vegan/Jain.
- Reference app: MyHealthBuddy (coach-led). We copy its UX (calorie ring, macro bars, meal slots, Option 1/2/3 per meal) but generate plans automatically.

## Decisions (don't change without asking)
- Expo + Expo Router, mobile first (Android/iOS); web maybe later.
- All data on the phone in SQLite (`expo-sqlite`), no backend. Possibly a cloud backup later.
- Plans come from deterministic code in `src/domain/plan.ts` (meal templates scaled to a calorie target). AI is never used to calculate calories.
- AI (later): Gemini behind a small proxy. The API key must never ship in the app. Users confirm every AI-detected food.
- Safety rules in `src/domain/energy.ts`: deficit capped at 25% of maintenance; minimum 1200 kcal (women) / 1500 kcal (men); ages 18–80 only.

## Code conventions
- `src/domain/` is pure TypeScript with no React or Expo imports. Imports there use explicit `.ts` extensions so Node can run them directly.
- Domain tests run on Node's built-in test runner: `npm test`. No Jest. Use `import type` for type-only imports.
- Every food in `src/domain/foods.ts` has `verified: false` (approximate values) until checked against IFCT 2017.
- Quantities are stored in household units (`qty` × `measure.grams`), never raw grams.
- Format-on-save (Prettier) is on; expect reformatting after edits.
- All SQL uses `?` parameters.

## Status (2026-10-14)
- Done: Profile (calorie/macro targets), Diet Plan (Option 1/2/3 per meal, "I ate this"), Today (calorie ring, macro bars, logged items), Add food (search + quantity). 15 domain tests pass.
- `npm run setup` ran, but the install looks incomplete (`node_modules/typescript` is missing) and `typescript`/`@types/react` ended up in `dependencies`. Run `npm install` again, then `npm run typecheck` and `npm start`. The app has not been run on a device yet.
- In agent sessions, the safety check blocks package installs (`npx create-expo-app`, `npm install`). The user runs those manually.

## Next (in order)
1. Get the app running: fix typecheck/runtime errors.
2. Make the plan engine aim for the protein target too; vegetarian plans currently fall well short (about 55 g vs an 83 g target).
3. Verify foods against IFCT and grow the list toward ~300 dishes.
4. Weight log and trend chart.
5. Several family profiles on one phone.
6. Smart swap, then AI photo/voice logging.
