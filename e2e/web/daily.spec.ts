import { expect, test } from "@playwright/test";
import { completeOnboarding } from "./helpers";

test.describe("daily use", () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
  });

  test("Today shows the target, water and a way to add food", async ({
    page,
  }) => {
    await expect(page.getByText("Water", { exact: true })).toBeVisible();
    await expect(page.getByText("+ Add food").first()).toBeVisible();
    await page.getByLabel("Glass 1").click();
    await page.getByLabel("Glass 2").click();
    await expect(page.getByLabel("Remove a glass")).toBeVisible();
  });

  test("adding a food logs it on Today", async ({ page }) => {
    await page.getByText("+ Add food").nth(1).click();
    await expect(page.getByText("Adding to Breakfast")).toBeVisible();
    await page.getByLabel("Search foods").fill("roti");
    await page
      .getByLabel(/^Whole wheat roti \(phulka\), \d+ kilocalories/)
      .click();
    await page.getByLabel(/^Add .* of /).click();
    await expect(page.getByText(/^Whole wheat roti \(phulka\)$/)).toBeVisible();
    await expect(page.getByText(/^106 \/ \d+ kcal$/)).toBeVisible();
    await expect(page.getByText(/^🔥 1$/)).toBeVisible();
  });

  test("Diet Plan: 'I ate this' logs the meal and can be undone", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: /Diet Plan/ }).click();
    await expect(page.getByText(/Breakfast/).first()).toBeVisible();
    await page.getByLabel(/^I ate Breakfast option 1/).click();
    await expect(page.getByText("Undo").first()).toBeVisible();
    await page.getByText("Undo").first().click();
    await expect(page.getByLabel(/^I ate Breakfast option 1/)).toBeVisible();
  });

  test("Progress shows the target date chosen in onboarding", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: /Progress/ }).click();
    await expect(page.getByText(/Target date: \d+ \w+ 20\d\d/)).toBeVisible();
    await expect(page.getByText("Weight", { exact: true })).toBeVisible();
  });

  test("Edit profile keeps the plan and can skip the date", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: /Me/ }).click();
    await page.getByText("Goal and body").click();
    await expect(page.getByText("Date to reach your target")).toBeVisible();
    await page
      .getByRole("button", { name: /Skip: I don't want a target date/ })
      .click();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();
    await page.getByText("Done").click();
    await page.getByRole("tab", { name: /Progress/ }).click();
    await expect(page.getByText(/Target date:/)).toHaveCount(0);
  });

  test("Family needs a cloud sign-in first", async ({ page }) => {
    await page.getByRole("tab", { name: /Family/ }).click();
    await expect(page.getByText("Cheer each other on")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Sign in to the cloud first/ }),
    ).toBeVisible();
  });

  test("data survives a reload", async ({ page }) => {
    await page.reload();
    await expect(page.getByRole("tab", { name: /Today/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Get started")).toHaveCount(0);
  });
});
