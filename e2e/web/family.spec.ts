import { expect, test, type Page } from "@playwright/test";
import { completeOnboarding } from "./helpers";

// These tests talk to the real Supabase project in .env and create throwaway anonymous accounts,
// so they only run when asked: E2E_LIVE=1 npm run e2e:web -- family
test.skip(
  !process.env.E2E_LIVE,
  "Set E2E_LIVE=1 to run against the real Supabase project",
);

async function phone(
  browser: import("@playwright/test").Browser,
  name: string,
) {
  const baseURL = test.info().project.use.baseURL;
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  // Confirm prompts (like leaving the family) are browser dialogs on web.
  page.on("dialog", (d) => d.accept());
  await completeOnboarding(page, { name });
  return page;
}

async function signInWithoutEmail(page: Page) {
  await page.getByRole("tab", { name: /Me/ }).click();
  await page.getByText("Cloud backup").click();
  await page.getByText("Start without email").click();
  // The screen mentions recovery codes before signing in, so wait for the session itself.
  await page.waitForFunction(
    () => !!localStorage.getItem("cloud_session"),
    null,
    { timeout: 30_000 },
  );
  await page.goBack();
  await page.getByRole("tab", { name: /Today/ }).click();
}

test("two phones: create a family, join it, share progress and send a cheer", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const asha = await phone(browser, "Asha");
  const bo = await phone(browser, "Bo");
  try {
    await signInWithoutEmail(asha);
    await signInWithoutEmail(bo);

    // Asha creates the family and shares today's progress.
    await asha.getByText("+ Add food").nth(1).click();
    await asha.getByLabel("Search foods").fill("roti");
    await asha
      .getByLabel(/^Whole wheat roti \(phulka\), \d+ kilocalories/)
      .click();
    await asha.getByLabel(/^Add .* of /).click();
    // The "First bite" achievement pop-up covers the tabs until it is closed.
    await asha.getByText("Yay! 🎉").click();
    await asha.getByRole("tab", { name: /Family/ }).click();
    await asha
      .getByPlaceholder("Family name, e.g. Sharma family")
      .fill("E2E family");
    await asha.getByRole("button", { name: "Create family" }).click();
    await expect(asha.getByText("E2E family")).toBeVisible({ timeout: 30_000 });
    const code =
      (await asha
        .getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
        .first()
        .textContent()) ?? "";
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    // Bo joins with the code and sees Asha, with her weight hidden.
    await bo.getByRole("tab", { name: /Family/ }).click();
    await bo.getByPlaceholder("ABCD-2345").fill(code);
    await bo.getByRole("button", { name: "Join family" }).click();
    await expect(bo.getByText("Asha", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(bo.getByText(/⚖️/)).toHaveCount(0);
    await expect(bo.getByText(/This week/)).toBeVisible();

    // Bo cheers Asha; Asha's tab shows a badge and the cheer.
    await bo.getByRole("button", { name: "Cheer Asha" }).click();
    await bo.getByText("Great job today!").click();
    await bo.getByRole("button", { name: "Send cheer" }).click();
    await expect(bo.getByText(/Sent to Asha/)).toBeVisible();

    await asha.getByRole("tab", { name: /Today/ }).click();
    await asha.getByRole("tab", { name: /Family/ }).click();
    await expect(asha.getByText("Bo: Great job today!")).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    // Leave the family so the shared data is deleted.
    for (const page of [bo, asha]) {
      try {
        await page.getByRole("tab", { name: /Family/ }).click();
        await page.getByText("Leave this family").click();
      } catch {
        // Already out.
      }
    }
    await asha.context().close();
    await bo.context().close();
  }
});
