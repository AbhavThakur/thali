import { expect, test } from "@playwright/test";
import { completeOnboarding, dismissCelebration } from "./helpers";

test.describe("everyday helpers", () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
  });

  test("quick add logs calories without making a food", async ({ page }) => {
    await page.getByText("+ Add food").nth(1).click();
    await expect(page.getByText("Adding to Breakfast")).toBeVisible();
    await page.getByLabel("Quick add calories").click();
    await page.getByLabel("What was it? (optional)").fill("Restaurant biryani");
    await page.getByLabel("Calories (kcal)").fill("450");
    await page.getByRole("button", { name: /^Add to Breakfast/ }).click();
    await expect(page.getByText("Restaurant biryani", { exact: true })).toBeVisible();
    await expect(page.getByText(/^450 \/ \d+ kcal$/)).toBeVisible();
    await dismissCelebration(page);

    // It stays out of My foods.
    await page.getByRole("tab", { name: /Me/ }).click();
    await page.getByText("My foods").click();
    await expect(page.getByText("Nothing here yet.")).toBeVisible();
  });

  test("weight can be logged from Today", async ({ page }) => {
    await expect(page.getByText(/^70 kg · today$/)).toBeVisible();
    await page.getByLabel("Log your weight").click();
    await page.getByLabel("Your weight today").fill("69.4");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/^69\.4 kg · today$/)).toBeVisible();
    await page.getByRole("tab", { name: /Progress/ }).click();
    await expect(page.getByText("Now (kg)")).toBeVisible();
  });

  test("a recipe becomes a food that is logged by the serving", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: /Me/ }).click();
    await page.getByText("My foods").click();
    await page.getByRole("button", { name: /Make a recipe/ }).click();
    await page.getByLabel("Recipe name").fill("Amma's dal");

    await page.getByRole("button", { name: "+ Add ingredient" }).click();
    await page.getByLabel("Search ingredients").fill("toor");
    await page.getByRole("button", { name: "Add Toor dal, raw" }).click();
    await page.getByRole("button", { name: "+ Add ingredient" }).click();
    await page.getByLabel("Search ingredients").fill("oil");
    await page.getByRole("button", { name: "Add Cooking oil" }).click();
    await page.getByLabel("Cooking oil in grams").fill("10");

    await page.getByLabel("Cooked weight in grams").fill("600");
    await page.getByLabel("Number of servings").fill("4");
    await expect(page.getByText("1 katori (150 g)")).toBeVisible();
    await page.getByRole("button", { name: "Save recipe" }).click();

    await expect(page.getByText("Amma's dal", { exact: true })).toBeVisible();
    await page.goBack();
    await page.getByRole("tab", { name: /Today/ }).click();
    await page.getByText("+ Add food").nth(2).click();
    await page.getByLabel("Search foods").fill("Amma");
    await page.getByLabel(/^Amma's dal, \d+ kilocalories/).click();
    await page.getByLabel(/^Add .* of /).click();
    await expect(page.getByText("Amma's dal", { exact: true })).toBeVisible();
  });

  test("a recipe with a wrong cooked weight is explained", async ({ page }) => {
    await page.getByRole("tab", { name: /Me/ }).click();
    await page.getByText("My foods").click();
    await page.getByRole("button", { name: /Make a recipe/ }).click();
    await page.getByLabel("Recipe name").fill("Odd dal");
    await page.getByRole("button", { name: "+ Add ingredient" }).click();
    await page.getByLabel("Search ingredients").fill("toor");
    await page.getByRole("button", { name: "Add Toor dal, raw" }).click();
    await page.getByLabel("Cooked weight in grams").fill("20");
    await page.getByLabel("Number of servings").fill("2");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText(/doesn't look right/)).toBeVisible();
  });

  test("a fast can be started and ended", async ({ page }) => {
    await page.getByRole("tab", { name: /Me/ }).click();
    await page.getByText("Fasting timer").click();
    await page.getByRole("button", { name: "14 hours" }).click();
    await page.getByRole("button", { name: "Start fast now" }).click();
    await expect(page.getByText("You've been fasting for")).toBeVisible();
    await expect(page.getByText(/Goal 14 h/)).toBeVisible();
    // The confirmation is a browser dialog on web.
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "End fast" }).click();
    await expect(page.getByText("Start a fast, aiming for")).toBeVisible();
  });

  test("Progress shows the week as a whole", async ({ page }) => {
    await page.getByRole("tab", { name: /Progress/ }).click();
    await expect(page.getByText("This week", { exact: true })).toBeVisible();
    await expect(page.getByText(/Log all your meals on a few days/)).toBeVisible();
  });
});
