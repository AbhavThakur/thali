import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  fillBody,
  fillLifestyle,
  fillUntilBody,
  healthNone,
  openFresh,
} from "./helpers";

const next = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Continue" });

test.describe("onboarding", () => {
  test("weight loss: BMI guide, suggested date, plan and Today", async ({
    page,
  }) => {
    await openFresh(page);
    await fillUntilBody(page);

    await page.getByLabel(/^Height in cm/).fill("160");
    await page.getByLabel(/^Current weight/).fill("70");
    await expect(page.getByText(/BMI 27\.3/)).toBeVisible();
    await expect(page.getByText("Obese")).toBeVisible();
    await expect(
      page.getByText(/Healthy weight for 160 cm: 48–58 kg/),
    ).toBeVisible();
    await page.getByLabel(/^Or enter your own target/).fill("60");
    await next(page).click();

    await fillLifestyle(page);

    // The date is suggested from BMI, and every choice shows the calories it means.
    await expect(page.getByText("Here's a date to aim for")).toBeVisible();
    const presets = page.getByRole("radio", {
      name: /^(Fastest safe|Steady|Relaxed)/,
    });
    await expect(presets).toHaveCount(3);
    const steady = page.getByRole("radio", { name: /^Steady/ });
    const steadyLabel = (await steady.getAttribute("aria-label")) ?? "";
    // The big summary shows the recommended date first.
    const steadyDate = steadyLabel.match(/(\d+ \w+ 20\d\d)/)?.[1] ?? "";
    expect(steadyDate).not.toBe("");
    await expect(
      page.getByText(steadyDate, { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/kcal a day/).first()).toBeVisible();

    // Fastest is sooner and smaller portions; relaxed is later and more food.
    const kcal = async (name: RegExp) => {
      const label = await page
        .getByRole("radio", { name })
        .getAttribute("aria-label");
      return +(label?.match(/(\d+) calories a day/)?.[1] ?? 0);
    };
    const fast = await kcal(/^Fastest safe/);
    const calm = await kcal(/^Steady/);
    const slow = await kcal(/^Relaxed/);
    expect(fast).toBeLessThan(calm);
    expect(calm).toBeLessThan(slow);
    expect(fast).toBeGreaterThanOrEqual(1200);

    // The date can be nudged, but not past the quickest safe date.
    await page.getByRole("radio", { name: /^Fastest safe/ }).click();
    await expect(page.getByText(/quickest safe date/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "One week earlier" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Four weeks later" }).click();
    await expect(page.getByText(/quickest safe date/)).toBeHidden();
    await expect(
      page.getByRole("button", { name: "One week earlier" }),
    ).toBeEnabled();

    await next(page).click();
    await healthNone(page);

    await expect(page.getByText("Asha, your plan is ready")).toBeVisible();
    await expect(page.getByText(/70 → 60 kg by \d+ \w+ 20\d\d/)).toBeVisible();
    await expect(
      page.getByLabel("How this number was worked out"),
    ).toContainText(
      /Your body uses about \d+ kcal a day\. We take off \d+ to reach your date\./,
    );
    await page.getByRole("button", { name: "Start my plan" }).click();
    await expect(page.getByRole("tab", { name: /Today/ })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("the date is optional: skipping keeps a steady pace and saves no date", async ({
    page,
  }) => {
    await completeSkippingDate(page);
    await page.getByRole("tab", { name: /Progress/ }).click();
    await expect(page.getByText(/Target date:/)).toHaveCount(0);
  });

  test("staying healthy has no date step", async ({ page }) => {
    await openFresh(page);
    await fillUntilBody(page, { goal: "Stay healthy" });
    await fillBody(page, { goal: "Stay healthy" });
    await fillLifestyle(page);
    await expect(page.getByText("A quick health check")).toBeVisible();
    await healthNone(page);
    await expect(
      page.getByText(/Eating at maintenance keeps you at 70 kg/),
    ).toBeVisible();
  });

  test("height can be entered in feet and inches", async ({ page }) => {
    await openFresh(page);
    await fillUntilBody(page);
    await page.getByRole("radio", { name: "Feet and inches" }).click();
    await page.getByLabel("Feet in ft").fill("5");
    await page.getByLabel("Inches in in").fill("3");
    await expect(page.getByText("= 160 cm")).toBeVisible();
    await page.getByLabel(/^Current weight/).fill("70");
    await expect(page.getByText(/BMI 27\.3/)).toBeVisible();
    // Switching back keeps the same height.
    await page.getByRole("radio", { name: "Centimetres" }).click();
    await expect(page.getByLabel(/^Height in cm/)).toHaveValue("160");
  });

  test("the keyboard's next key moves through the fields", async ({ page }) => {
    await openFresh(page);
    await fillUntilBody(page);
    await page.getByLabel(/^Height in cm/).fill("160");
    await page.getByLabel(/^Height in cm/).press("Enter");
    await expect(page.getByLabel(/^Current weight/)).toBeFocused();
    await page.getByLabel(/^Current weight/).fill("70");
    await page.getByLabel(/^Current weight/).press("Enter");
    await expect(page.getByLabel(/^Or enter your own target/)).toBeFocused();
  });

  test("people under 18 can't continue", async ({ page }) => {
    await openFresh(page);
    await page.getByText("Get started").click();
    await page.getByLabel("Name").fill("Teen");
    await next(page).click();
    await page.getByLabel(/^Age/).fill("15");
    await next(page).click();
    // Still on the same question.
    await expect(page.getByText("A little about you")).toBeVisible();
  });

  test("pregnancy blocks the plan with a doctor's note", async ({ page }) => {
    await openFresh(page);
    await fillUntilBody(page);
    await fillBody(page);
    await fillLifestyle(page);
    await next(page).click();
    await page
      .getByRole("checkbox", { name: /Pregnant or breastfeeding/ })
      .click();
    await expect(
      page.getByText(/talk to your doctor before starting any diet plan/),
    ).toBeVisible();
    await expect(next(page)).toBeDisabled();
  });

  test("Back goes to the previous question and keeps answers", async ({
    page,
  }) => {
    await openFresh(page);
    await fillUntilBody(page);
    await page.getByLabel(/^Height in cm/).fill("160");
    await page
      .getByRole("button", { name: /Back to the previous question/ })
      .click();
    await expect(page.getByText("What's your goal?")).toBeVisible();
    await next(page).click();
    await expect(page.getByLabel(/^Height in cm/)).toHaveValue("160");
  });

  test("a finished onboarding opens Today with the calorie target", async ({
    page,
  }) => {
    await completeOnboarding(page);
    await expect(page.getByText(/Asha/).first()).toBeVisible();
  });
});

async function completeSkippingDate(page: import("@playwright/test").Page) {
  await openFresh(page);
  await fillUntilBody(page);
  await fillBody(page);
  await fillLifestyle(page);
  await page
    .getByRole("button", { name: /Skip: I don't want a target date/ })
    .click();
  await expect(page.getByText("No target date")).toBeVisible();
  await expect(page.getByText(/Steady pace of [\d.]+ kg a week/)).toBeVisible();
  await next(page).click();
  await healthNone(page);
  await expect(page.getByText(/in about \d+ weeks/)).toBeVisible();
  await expect(page.getByLabel("How this number was worked out")).toContainText(
    "for a steady pace",
  );
  await page.getByRole("button", { name: "Start my plan" }).click();
  await expect(page.getByRole("tab", { name: /Today/ })).toBeVisible({
    timeout: 30_000,
  });
}
