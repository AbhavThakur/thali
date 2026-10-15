import { expect, type Page } from "@playwright/test";

export type Person = {
  name?: string;
  age?: string;
  goal?: "Lose weight" | "Stay healthy" | "Gain weight" | "Build muscle";
  heightCm?: string;
  weightKg?: string;
  targetKg?: string;
  activity?: string;
  diet?: string;
};

const continueButton = (page: Page) =>
  page.getByRole("button", { name: "Continue" });

/** Opens the app on a fresh profile and waits for the welcome screen. */
export async function openFresh(page: Page) {
  await page.goto("/");
  await expect(page.getByText("Get started")).toBeVisible({ timeout: 60_000 });
}

/** Walks the welcome, name, about and goal questions, stopping on the body step. */
export async function fillUntilBody(page: Page, p: Person = {}) {
  await page.getByText("Get started").click();
  await page.getByLabel("Name").fill(p.name ?? "Asha");
  await continueButton(page).click();
  await page.getByLabel(/^Age/).fill(p.age ?? "32");
  await continueButton(page).click();
  await page
    .getByRole("radio", { name: p.goal ?? "Lose weight" })
    .first()
    .click();
  await continueButton(page).click();
  await expect(page.getByText(/Your body/)).toBeVisible();
}

export async function fillBody(page: Page, p: Person = {}) {
  await page.getByLabel(/^Height in cm/).fill(p.heightCm ?? "160");
  await page.getByLabel(/^Current weight/).fill(p.weightKg ?? "70");
  if (p.goal !== "Stay healthy") {
    await page
      .getByLabel(/^(Or enter your own target|Target weight)/)
      .fill(p.targetKg ?? "60");
  }
  await continueButton(page).click();
}

/** Activity and diet steps. */
export async function fillLifestyle(page: Page, p: Person = {}) {
  await page
    .getByRole("radio", { name: new RegExp(p.activity ?? "On my feet") })
    .click();
  await continueButton(page).click();
  await page
    .getByRole("radio", { name: p.diet ?? "Vegetarian", exact: true })
    .click();
  await continueButton(page).click();
}

export async function healthNone(page: Page) {
  await page.getByRole("checkbox", { name: /None of these/ }).click();
  await continueButton(page).click();
}

/** The whole onboarding, ending on Today. The date step is accepted as suggested. */
export async function completeOnboarding(page: Page, p: Person = {}) {
  await openFresh(page);
  await fillUntilBody(page, p);
  await fillBody(page, p);
  await fillLifestyle(page, p);
  if (p.goal !== "Stay healthy")
    await expect(page.getByText("Here's a date to aim for")).toBeVisible();
  if (p.goal !== "Stay healthy") await continueButton(page).click();
  await healthNone(page);
  await expect(page.getByText(/your plan is ready/)).toBeVisible();
  await page.getByRole("button", { name: "Start my plan" }).click();
  await expect(page.getByRole("tab", { name: /Today/ })).toBeVisible({
    timeout: 30_000,
  });
  await skipTour(page);
}

/** The first-run tour covers Today for a new profile; skip it if it shows up. */
export async function skipTour(page: Page) {
  const skip = page.getByText("Skip", { exact: true });
  try {
    await skip.waitFor({ timeout: 4_000 });
    await skip.click();
  } catch {
    // No tour on this screen.
  }
}
