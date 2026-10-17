import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding, dismissCelebration } from "./helpers";

// One person's day with every new feature, with a screenshot at each step in e2e/artifacts/web/journey/.
// Yesterday's meals are logged through the Add food screen's date parameter, the same way History does it.

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterday = () => ymd(new Date(Date.now() - 86_400_000));

let step = 0;
const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `e2e/artifacts/web/journey/${String(++step).padStart(2, "0")}-${name}.png`,
    fullPage: true,
  });

async function logOnDate(
  page: Page,
  date: string,
  slot: string,
  query: string,
  label: RegExp,
) {
  await page.goto(`/add?slot=${slot}&date=${date}`);
  await page.getByLabel("Search foods").fill(query);
  await page.getByLabel(label).click();
  await page.getByLabel(/^Add .* of /).click();
  await expect(page.getByText(/ added$/)).toBeVisible();
}

async function openToday(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: /Today/ })).toBeVisible({
    timeout: 60_000,
  });
  await dismissCelebration(page);
}

test.describe("full journey", () => {
  test.beforeEach(async ({ page }) => {
    step = 0;
    await completeOnboarding(page);
  });

  test("repeat yesterday's meal, quick add, recipe, weigh-in, fasting and the week", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await shot(page, "today-fresh");

    // Weigh-in from Today.
    await page.getByLabel("Log your weight").click();
    await page.getByLabel("Your weight today").fill("69.8");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/^69\.8 kg · today$/)).toBeVisible();
    await shot(page, "weighed-in");

    // Yesterday: a lunch of roti and dal.
    const d = yesterday();
    await logOnDate(page, d, "lunch", "roti", /^Whole wheat roti \(phulka\), \d+ kilocalories/);
    await logOnDate(page, d, "lunch", "dal tadka", /^Dal tadka \(toor\), \d+ kilocalories/);
    await openToday(page);
    await expect(page.getByText("Same as yesterday?")).toBeVisible();
    await shot(page, "same-as-yesterday-offer");

    // Repeat just yesterday's lunch.
    await page.getByLabel("Repeat yesterday's Lunch").click();
    await expect(page.getByText("Whole wheat roti (phulka)", { exact: true })).toBeVisible();
    await expect(page.getByText("Dal tadka (toor)", { exact: true })).toBeVisible();
    await expect(page.getByText("Same as yesterday?")).toHaveCount(0);
    await dismissCelebration(page);
    await shot(page, "lunch-repeated");

    // Quick add for dinner.
    await page.getByText("+ Add food").nth(4).click();
    await expect(page.getByText("Adding to Dinner")).toBeVisible();
    await page.getByLabel("Quick add calories").click();
    await page.getByLabel("What was it? (optional)").fill("Wedding buffet");
    await page.getByLabel("Calories (kcal)").fill("700");
    await page.getByLabel("Protein (g, optional)").fill("25");
    await page.getByLabel("Carbs (g, optional)").fill("80");
    await page.getByLabel("Fat (g, optional)").fill("30");
    await shot(page, "quick-add-sheet");
    await page.getByRole("button", { name: /^Add to Dinner/ }).click();
    await expect(page.getByText("Wedding buffet", { exact: true })).toBeVisible();
    await expect(page.getByText(/quick add · 700 kcal/)).toBeVisible();
    await dismissCelebration(page);
    await shot(page, "quick-add-logged");

    // A recipe, then logged by the serving.
    await page.getByRole("tab", { name: /Me/ }).click();
    await page.getByText("My foods").click();
    await expect(page.getByText("Nothing here yet.")).toBeVisible();
    await page.getByRole("button", { name: /Make a recipe/ }).click();
    await page.getByLabel("Recipe name").fill("Sunday khichdi");
    for (const [q, name] of [
      ["rice", "Rice, raw (white)"],
      ["moong", "Moong dal (split), raw"],
      ["ghee", "Ghee"],
    ]) {
      await page.getByRole("button", { name: "+ Add ingredient" }).click();
      await page.getByLabel("Search ingredients").fill(q);
      await page.getByRole("button", { name: `Add ${name}` }).click();
    }
    await page.getByLabel("Rice, raw (white) in grams").fill("100");
    await page.getByLabel("Moong dal (split), raw in grams").fill("100");
    await page.getByLabel("Ghee in grams").fill("10");
    await page.getByLabel("Cooked weight in grams").fill("900");
    await page.getByLabel("Number of servings").fill("6");
    await expect(page.getByText("1 katori (150 g)")).toBeVisible();
    await shot(page, "recipe-builder");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(page.getByText("Sunday khichdi", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 katori · 150 g/).last()).toBeVisible();
    await shot(page, "my-foods-with-recipe");

    // Open it again: the ingredients come back.
    await page.getByLabel("Edit Sunday khichdi").click();
    await expect(page.getByLabel("Rice, raw (white) in grams")).toHaveValue("100");
    await expect(page.getByLabel("Number of servings")).toHaveValue("6");
    await page.goBack();

    await openToday(page);
    await page.getByText("+ Add food").nth(4).click();
    await page.getByLabel("Search foods").fill("khichdi");
    await page.getByLabel(/^Sunday khichdi, \d+ kilocalories/).click();
    await page.getByLabel(/^Add .* of /).click();
    await expect(page.getByText("Sunday khichdi", { exact: true })).toBeVisible();
    await dismissCelebration(page);
    await shot(page, "recipe-logged");

    // Fasting.
    await page.getByRole("tab", { name: /Me/ }).click();
    await page.getByText("Fasting timer").click();
    await page.getByRole("button", { name: "16 hours" }).click();
    await page.getByRole("button", { name: "Start fast now" }).click();
    await expect(page.getByText("You've been fasting for")).toBeVisible();
    await shot(page, "fasting-running");
    await openToday(page);
    await expect(page.getByText("⏱ Fasting")).toBeVisible();
    await shot(page, "today-with-fast");
    await page.getByRole("tab", { name: /Me/ }).click();
    await page.getByText("Fasting timer").click();
    page.once("dialog", (dlg) => dlg.accept());
    await page.getByRole("button", { name: "End fast" }).click();
    await expect(page.getByText("Start a fast, aiming for")).toBeVisible();
    await shot(page, "fasting-ended");

    // The week.
    await openToday(page);
    await page.getByRole("tab", { name: /Progress/ }).click();
    await expect(page.getByText("This week", { exact: true })).toBeVisible();
    // Yesterday had only lunch, so it must not be judged as a whole day.
    await expect(page.getByText(/Log all your meals on a few days/)).toBeVisible();
    await expect(page.getByText("Now (kg)")).toBeVisible();
    await page.getByText("This week", { exact: true }).scrollIntoViewIfNeeded();
    await page.getByText(/Average \d+ kcal|Log all your meals/).scrollIntoViewIfNeeded();
    await page.screenshot({ path: "e2e/artifacts/web/journey/13b-week-card.png" });
    await shot(page, "progress-week");

    // Everything is still there after a reload.
    await page.reload();
    await expect(page.getByRole("tab", { name: /Today/ })).toBeVisible({ timeout: 60_000 });
    await dismissCelebration(page);
    await page.getByRole("tab", { name: /Today/ }).click();
    await expect(page.getByText("Wedding buffet", { exact: true })).toBeVisible();
    await expect(page.getByText("Sunday khichdi", { exact: true })).toBeVisible();
    await expect(page.getByText(/^69\.8 kg · today$/)).toBeVisible();
    await shot(page, "after-reload");
  });

  test("Copy yesterday adds every meal in one tap and Undo removes them", async ({
    page,
  }) => {
    const d = yesterday();
    await logOnDate(page, d, "breakfast", "idli", /^Idli, \d+ kilocalories/);
    await logOnDate(page, d, "dinner", "khichdi", /^Moong dal khichdi, \d+ kilocalories/);
    await openToday(page);
    await page.getByRole("button", { name: "Copy yesterday" }).click();
    await expect(page.getByText("Idli", { exact: true })).toBeVisible();
    await expect(page.getByText("Moong dal khichdi", { exact: true })).toBeVisible();
    await shot(page, "copied-yesterday");
    await page.getByText("Undo", { exact: true }).last().click();
    await expect(page.getByText("Idli", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy yesterday" })).toBeVisible();
  });
});
