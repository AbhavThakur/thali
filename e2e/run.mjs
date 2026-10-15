// End-to-end smoke test: fresh install → onboarding → Today → Plan → Progress → Me.
// Needs: Android emulator running, Expo Go installed on it, Metro running (`npm start`).
// Run: npm run e2e   (screenshots land in e2e/artifacts/)
import {
  adb,
  ARTIFACTS,
  clearField,
  exists,
  find,
  hideKeyboard,
  screenshot,
  scrollToTop,
  sleep,
  tap,
  tapEdit,
  type,
} from "./driver.mjs";

const EXPO_GO = "host.exp.exponent";
const URL = process.env.EXPO_URL ?? "exp://10.0.2.2:8081";
const results = [];

async function guardNoRedScreen(step) {
  if (
    await exists(
      /Render Error|Uncaught Error|TypeError|ReferenceError|Unable to resolve module/,
      800,
    )
  ) {
    screenshot(`FAIL-${step}-redbox`);
    throw new Error("App showed an error screen");
  }
}

async function dismissCelebration() {
  if (await exists("Achievement unlocked", 800))
    await tap("Yay!", { scroll: false });
}

async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    await guardNoRedScreen(name);
    screenshot(name);
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`✓ ${name}`);
  } catch (e) {
    screenshot(`FAIL-${name}`);
    results.push({ name, ok: false, error: String(e.message ?? e) });
    console.log(`✗ ${name}: ${e.message ?? e}`);
    throw e;
  }
}

async function main() {
  console.log("Resetting Expo Go data and opening the app…");
  // Looping animations (the mascot) stop uiautomator from reading the screen; Reanimated honours this.
  for (const k of [
    "animator_duration_scale",
    "window_animation_scale",
    "transition_animation_scale",
  ])
    adb("shell", "settings", "put", "global", k, "0");
  adb("shell", "pm", "clear", EXPO_GO);
  adb(
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    URL,
    EXPO_GO,
  );

  await step("01-welcome", async () => {
    await find("Get started", { timeout: 120_000, scroll: false });
    await find(/Reach your health goal/);
  });

  await step("02-onboarding", async () => {
    await tap("Get started");
    await tapEdit(0);
    await type("Asha");
    await hideKeyboard();
    await tap("Continue");
    await tap("Female");
    await tapEdit(0);
    await type("32");
    await hideKeyboard();
    await tap("Continue");
    await find("What's your goal?");
    await tap("Lose weight");
    await tap("Continue");
    for (const [i, v] of ["160", "70", "60"].entries()) {
      await tapEdit(i);
      await type(v);
    }
    await hideKeyboard();
    await find(/healthy target for your height is 48 kg/);
    await tap("Continue");
    await tap("Lightly active");
    await tap("Continue");
    await tap("Vegetarian");
    await tap("Continue");
    await tap(/Steady/);
    await tap("Continue");
    await find("A quick health check");
    await tap("None of these");
    await tap("Continue");
    await find(/plan is ready/, { timeout: 4000 });
    await find("calories a day");
  });

  await step("03-today", async () => {
    await tap("Start my plan");
    await find("Welcome to Thali! 👋", { timeout: 10_000, scroll: false });
    for (let n = 0; n < 7; n++) await tap("Next", { scroll: false });
    await tap("Let's go!", { scroll: false });
    await find(/Asha/, { timeout: 10_000, scroll: false });
    await find(/Your plan is ready|kcal to go/);
    await find("Water");
  });

  await step("04-log-and-undo", async () => {
    await tap(/I ate the suggested Breakfast/);
    await find("Breakfast logged", { scroll: false });
    await tap("Undo", { scroll: false });
    await sleep(800);
    await dismissCelebration();
    await find(/I ate the suggested Breakfast/);
    await tap(/I ate the suggested Breakfast/);
    await sleep(800);
    await dismissCelebration();
  });

  await step("05-water", async () => {
    await scrollToTop();
    await tap("Glass 1");
    await tap("Glass 2");
    await find("2 of 8 glasses");
  });

  await step("06-edit-name", async () => {
    await scrollToTop();
    await tap("Edit your name", { scroll: false });
    await clearField();
    await type("Asha Rani");
    await tap("Save", { scroll: false });
    await sleep(600);
    await find(/Asha Rani/, { scroll: false });
  });

  await step("07-plan-and-edit", async () => {
    await tap("Diet Plan", { scroll: false });
    await find("kcal planned", { scroll: false });
    await find(/Protein \d+ \/ \d+ g/, { scroll: false });
    await tap("✏️ Edit", { scroll: false });
    await find(/^Edit /, { scroll: false });
    await tap("+", { scroll: false });
    await tap("Every day", { scroll: false });
    await tap("Save", { scroll: false });
    await find(/Edited/, { scroll: false });
  });

  await step("08-groceries", async () => {
    await tap(/Week's groceries/, { scroll: false });
    await find(/This week's groceries/, { scroll: false });
    adb("shell", "input", "keyevent", "KEYCODE_BACK");
    await sleep(500);
  });

  await step("09-progress-weight", async () => {
    await tap("Progress", { scroll: false });
    await dismissCelebration();
    await find("Achievements", { scroll: true });
    await scrollToTop();
    await tap("Log weight", { scroll: false });
    await clearField();
    await type("69.5");
    await tap("Save", { scroll: false });
    await sleep(800);
    await dismissCelebration();
    await find("69.5", { scroll: false });
  });

  await step("09b-history", async () => {
    await scrollToTop();
    await tap("Open full history");
    await find("days logged", { scroll: false });
    await find("Today", { scroll: false });
    await tap("Today", { scroll: false });
    await find(/Add food to Breakfast on Today/, { scroll: false });
    adb("shell", "input", "keyevent", "KEYCODE_BACK");
    await sleep(500);
  });

  await step("10-me-save", async () => {
    await tap("Me", { scroll: false });
    await find("Asha Rani", { scroll: false });
    await find("Export backup");
    await tap("Goal and body");
    await tap("Save");
    await find(/Profile saved|Your plan is ready/, { scroll: false });
    await tap("Done", { scroll: false });
  });
}

main()
  .catch(() => {
    process.exitCode = 1;
  })
  .finally(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(
      `\n${passed}/${results.length} steps passed. Screenshots: ${ARTIFACTS}`,
    );
  });
