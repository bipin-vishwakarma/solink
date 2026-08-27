import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function openDemoUser(context: BrowserContext, username: string): Promise<Page> {
  const page = await context.newPage();
  await page.addInitScript((name) => {
    localStorage.setItem("solink:onboarded", "1");
    localStorage.setItem("solink:name", name);
  }, username);
  await page.goto("/");
  await expect(page.getByText(username, { exact: true })).toBeVisible();
  return page;
}

async function openConversation(page: Page, username: string): Promise<void> {
  await page.getByPlaceholder("Connect by username…").fill(username);
  await page.getByRole("button", { name: new RegExp(`@${username}`) }).click();
  await expect(page.getByRole("button", { name: "Chat options" })).toBeVisible();
}

test("two demo users exchange encrypted text", async ({ browser }) => {
  const context = await browser.newContext();
  const alice = await openDemoUser(context, "e2e-alice");
  const bob = await openDemoUser(context, "e2e-bob");

  await Promise.all([
    openConversation(alice, "e2e-bob"),
    openConversation(bob, "e2e-alice"),
  ]);

  const message = "encrypted browser test message";
  await expect(alice.getByPlaceholder("Type a message")).toBeEnabled();
  await alice.getByPlaceholder("Type a message").fill(message);
  await alice.getByRole("button", { name: "Send" }).click();

  await expect(alice.locator("section").getByText(message, { exact: true })).toBeVisible();
  await expect(bob.locator("section").getByText(message, { exact: true })).toBeVisible();

  await context.close();
});

test("mobile chat options stay in a top-level scrollable sheet", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "mobile layout assertion");

  await page.addInitScript(() => {
    localStorage.setItem("solink:onboarded", "1");
    localStorage.setItem("solink:name", "e2e-mobile");
  });
  await page.goto("/");
  await openConversation(page, "e2e-peer");

  await page.getByRole("button", { name: "Chat options" }).click();
  const sheet = page.getByRole("dialog", { name: "Chat options" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS("position", "absolute");
  await expect(sheet).toHaveCSS("overflow-y", "auto");

  const layer = sheet.locator("xpath=..");
  await expect(layer).toHaveCSS("position", "fixed");
  await expect(layer).toHaveCSS("z-index", "100");
  await expect(layer.evaluate((element) => element.parentElement === document.body)).resolves.toBe(true);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: "Chat options" })).toBeFocused();
});
