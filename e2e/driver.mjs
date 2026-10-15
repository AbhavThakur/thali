// Minimal adb driver for end-to-end tests on an Android emulator running Expo Go.
// No dependencies: uses `adb shell uiautomator dump` to find elements by text or accessibility label.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const ADB = process.env.ADB ?? "adb";
export const ARTIFACTS = new URL("./artifacts/", import.meta.url).pathname;
mkdirSync(ARTIFACTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function adb(...args) {
  return execFileSync(ADB, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Current screen as a flat list of nodes with text, label and centre point. */
export function dump() {
  adb("shell", "uiautomator", "dump", "/sdcard/ui.xml");
  const xml = adb("shell", "cat", "/sdcard/ui.xml");
  const nodes = [];
  for (const m of xml.matchAll(/<node [^>]*?>/g)) {
    const tag = m[0];
    const attr = (k) =>
      decode(tag.match(new RegExp(` ${k}="([^"]*)"`))?.[1] ?? "");
    const b = attr("bounds").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    nodes.push({
      text: attr("text"),
      label: attr("content-desc"),
      cls: attr("class"),
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
      w: x2 - x1,
      h: y2 - y1,
    });
  }
  return nodes;
}

const matches = (n, q) =>
  q instanceof RegExp
    ? q.test(n.text) || q.test(n.label)
    : n.text === q ||
      n.label === q ||
      n.text.includes(q) ||
      n.label.includes(q);

export async function find(q, { timeout = 8000, scroll = true } = {}) {
  const end = Date.now() + timeout;
  let swipes = 0;
  while (Date.now() < end) {
    const hit = dump().find((n) => matches(n, q) && n.w > 0 && n.h > 0);
    if (hit) return hit;
    if (scroll && swipes < 6) {
      swipeUp();
      swipes++;
    }
    await sleep(400);
  }
  throw new Error(`Not found on screen: ${q}`);
}

export async function exists(q, timeout = 1500) {
  try {
    await find(q, { timeout, scroll: false });
    return true;
  } catch {
    return false;
  }
}

export async function tap(q, opts) {
  const n = await find(q, opts);
  adb("shell", "input", "tap", String(n.x), String(n.y));
  await sleep(500);
  return n;
}

export async function tapEdit(index = 0) {
  const fields = dump().filter((n) => n.cls === "android.widget.EditText");
  if (!fields[index]) throw new Error(`No text field #${index}`);
  adb(
    "shell",
    "input",
    "tap",
    String(fields[index].x),
    String(fields[index].y),
  );
  await sleep(300);
}

export async function type(text) {
  adb("shell", "input", "text", text.replace(/ /g, "%s"));
  await sleep(300);
}

export async function clearField() {
  adb("shell", "input", "keyevent", "KEYCODE_MOVE_END");
  for (let i = 0; i < 12; i++) adb("shell", "input", "keyevent", "KEYCODE_DEL");
}

export function keyboardShown() {
  return /mInputShown=true/.test(adb("shell", "dumpsys", "input_method"));
}

export async function hideKeyboard() {
  if (keyboardShown()) {
    adb("shell", "input", "keyevent", "KEYCODE_BACK");
    await sleep(400);
  }
}

export function swipeUp() {
  adb("shell", "input", "swipe", "540", "1700", "540", "900", "250");
}

export function swipeDown() {
  adb("shell", "input", "swipe", "540", "700", "540", "1700", "250");
}

export async function scrollToTop() {
  for (let i = 0; i < 6; i++) swipeDown();
  await sleep(400);
}

export function screenshot(name) {
  const png = execFileSync(ADB, ["exec-out", "screencap", "-p"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const path = `${ARTIFACTS}${name}.png`;
  writeFileSync(path, png);
  return path;
}

export { sleep };
