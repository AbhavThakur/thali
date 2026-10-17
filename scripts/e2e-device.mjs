// Runs the Maestro flows in e2e/maestro on a real build of the app, on the Android emulator.
//
//   npm run e2e:device                 reuse the last test build (builds one if there is none)
//   npm run e2e:device -- --build      build a fresh test app first (a few minutes)
//   npm run e2e:device -- --flow 02    only flows whose file name starts with 02
//
// The test build is made with EXPO_PUBLIC_E2E=1, so it ignores published updates and says "test build" on the Me tab.
// Screenshots, the JUnit report and Maestro's logs go to e2e/artifacts/device/android/.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : fallback;
};
const forceBuild = argv.includes("--build");
const onlyFlow = opt("--flow", "");

const AVD = process.env.E2E_AVD ?? "Pixel_10_Pro";
const SDK = process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk");
const ADB = join(SDK, "platform-tools/adb");
const EMULATOR = join(SDK, "emulator/emulator");
const OUT = "e2e/artifacts/device";
const APK = join(OUT, "thali-e2e.apk");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sh = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });
const say = (m) => console.log(`\n== ${m}`);

const serialOf = () =>
  (sh(ADB, ["devices"]).stdout ?? "")
    .split("\n")
    .map((l) => l.match(/^(emulator-\d+)\s+device$/)?.[1])
    .find(Boolean);

async function ensureEmulator() {
  if (serialOf()) return serialOf();
  say(`Starting the Android emulator (${AVD})`);
  spawn(
    EMULATOR,
    ["-avd", AVD, "-no-snapshot-save", "-no-audio", "-no-boot-anim"],
    { detached: true, stdio: "ignore" },
  ).unref();
  for (let i = 0; i < 90; i++) {
    await sleep(4000);
    const s = serialOf();
    if (
      s &&
      sh(ADB, [
        "-s",
        s,
        "shell",
        "getprop",
        "sys.boot_completed",
      ]).stdout.trim() === "1"
    )
      return s;
  }
  throw new Error("The Android emulator did not finish booting in 6 minutes.");
}

function build() {
  say("Building the Android test app (a few minutes)");
  execFileSync("npm", ["run", "build"], {
    stdio: "inherit",
    env: { ...process.env, EXPO_PUBLIC_E2E: "1" },
  });
  mkdirSync(OUT, { recursive: true });
  copyFileSync("android/app/build/outputs/apk/release/app-release.apk", APK);
  console.log(
    "Note: android/ now holds a TEST build. Run `npm run build` again before sharing an APK.",
  );
}

/** Maestro files its named screenshots deep inside the logs folder; copy them next to the report. */
function collectScreenshots(dir) {
  const walk = (d) =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(join(d, e.name))
        : d.includes("takeScreenshot") && e.name.endsWith(".png")
          ? [join(d, e.name)]
          : [],
    );
  for (const f of walk(join(dir, "logs"))) copyFileSync(f, join(dir, basename(f)));
}

function maestro(serial) {
  const dir = join(OUT, "android");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const flows = readdirSync("e2e/maestro")
    .filter((f) => /^\d+.*\.yaml$/.test(f) && f.startsWith(onlyFlow))
    .sort()
    .map((f) => join("e2e/maestro", f));
  say(`Running ${flows.length} flow(s)`);
  const r = spawnSync(
    "maestro",
    [
      "--device",
      serial,
      "test",
      "-e",
      `SHOTS=${dir}`,
      "--format",
      "junit",
      "--output",
      join(dir, "report.xml"),
      "--test-output-dir",
      join(dir, "logs"),
      ...flows,
    ],
    { stdio: "inherit" },
  );
  collectScreenshots(dir);
  console.log(
    `\nandroid: ${r.status === 0 ? "PASSED" : "FAILED"}  (screenshots and report in ${dir})`,
  );
  return r.status === 0;
}

try {
  if (sh("maestro", ["--version"]).error)
    throw new Error(
      "Maestro is not installed. Run: brew install mobile-dev-inc/tap/maestro",
    );
  const serial = await ensureEmulator();
  if (forceBuild || !existsSync(APK)) build();
  say("Installing on the emulator");
  execFileSync(ADB, ["-s", serial, "install", "-r", "-g", APK], {
    stdio: "inherit",
  });
  process.exit(maestro(serial) ? 0 : 1);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
