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
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; pointer-events: none !important; }" }).catch(() => {});
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

test("WeChat drawer opens in keyboard area, flips button to keyboard, and searches stickers & GIFs", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("solink:onboarded", "1");
    localStorage.setItem("solink:name", "e2e-wechat");
  });
  await page.goto("/");
  await openConversation(page, "e2e-peer");

  // Initial state: button shows 😊
  const toggleBtn = page.getByRole("button", { name: "WeChat emojis and stickers" });
  await expect(toggleBtn).toBeVisible();
  await expect(toggleBtn).toHaveText("😊");

  // Tap 😊 -> button flips to ⌨️ and WeChat drawer opens in keyboard area
  await toggleBtn.click();
  const keyboardBtn = page.getByRole("button", { name: "Switch to keyboard" });
  await expect(keyboardBtn).toBeVisible();
  await expect(keyboardBtn).toHaveText("⌨️");

  // WeChat expressions are visible
  await expect(page.getByTitle("[Doge] Doge")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete last character" })).toBeVisible();

  // Switch to Stickers & GIFs tab
  await page.getByRole("button", { name: "Stickers & GIFs" }).click();

  // Verify search bar is visible
  const searchInput = page.getByPlaceholder(/Search stickers & GIFs/);
  await expect(searchInput).toBeVisible();

  // Test live search for popcat
  await searchInput.fill("popcat");
  await expect(page.getByTitle("Animated Popcat")).toBeVisible();

  // Tap ⌨️ -> closes drawer and flips back to 😊
  await keyboardBtn.click();
  await expect(page.getByRole("button", { name: "WeChat emojis and stickers" })).toBeVisible();
  await expect(page.getByTitle("[Doge] Doge")).toBeHidden();
});

test("WeChat '+' button opens action drawer in keyboard area with Photos, Camera, Files, and Location", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("solink:onboarded", "1");
    localStorage.setItem("solink:name", "e2e-action-drawer");
  });
  await page.goto("/");
  await openConversation(page, "e2e-peer");

  // Verify '+' action button is visible
  const plusBtn = page.getByRole("button", { name: "More actions" });
  await expect(plusBtn).toBeVisible();

  // Tap '+' -> opens action drawer and button changes aria-label to 'Close actions'
  await plusBtn.click({ force: true });
  await expect(page.getByRole("button", { name: "Close actions" })).toBeVisible();

  // Verify action tiles are present
  await expect(page.getByRole("button", { name: /Photos/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Camera/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Location/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Files/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Voice Call/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Red Packet/ })).toBeVisible();

  // Tap Red Packet action tile -> inserts RedPacket note and closes drawer
  await page.getByRole("button", { name: /Red Packet/ }).click({ force: true });
  await expect(page.getByRole("button", { name: "More actions" })).toBeVisible();
  await expect(page.getByPlaceholder("Type a message")).toHaveValue(/RedPacket/);
});
