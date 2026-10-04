import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
const fixtures = JSON.parse(readFileSync("test/fixtures.json", "utf8"));
const custom = fixtures.find((f) => f.id === "three").code;
async function ready(page) {
  await page.goto("./");
  await expect(page.locator("#solution-count")).toHaveText("22", {
    timeout: 120000,
  });
}
async function shareURL(page) {
  await page.locator("#generate").click();
  await page.locator("#share").click();
  return page.locator("#share-url").inputValue();
}
test("rule counts explain contradictions and syntax errors identify a line", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#rule-insights summary").click();
  await expect(page.locator("#rule-stats li").first()).toContainText(
    "512 → 84",
  );
  await expect(page.locator("#rule-stats li").nth(1)).toContainText("84 → 22");
  await page.locator("#code").fill(fixtures.find((f) => f.id === "none").code);
  await page.locator("#analyze").click();
  await expect(page.locator("#rule-stats .conflict")).toContainText("84 → 0");
  await expect(page.locator("#count-change")).toHaveText(
    "前回 22通り → 今回 0通り",
  );
  await page.locator("#code").fill(custom.replace("== 3", "=="));
  await page.locator("#analyze").click();
  await expect(page.locator("#editor-error")).toContainText("行目");
  await page.getByRole("button", { name: "エラー行へ" }).click();
  await expect(page.locator("#code")).toBeFocused();
});
test("sample switching preserves the authored draft, including reload", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#code").fill(custom);
  await page.locator("#sample-button").click();
  await page.locator(".sample-option").nth(1).click();
  await expect(page.locator("#draft-recovery")).toBeVisible();
  await page.reload();
  await page.locator("#undo-sample").click();
  await expect(page.locator("#code")).toHaveValue(custom);
  await page.locator("#code").focus();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(page.locator("#code")).not.toBeFocused();
});
test("guide keeps the shared URL, sample selection detaches it, and returning to create shows rule-only count", async ({
  page,
}) => {
  await ready(page);
  const url = await shareURL(page);
  await page.locator("#share-dialog .close-dialog").click();
  await page.goto(url);
  await expect(page.locator("#import-banner")).toBeVisible();
  await page.locator(".guide-link").click();
  expect(page.url()).toBe(url);
  await expect(page.locator("#accept-import")).toBeEnabled();
  // Check in the same task as dispatch, before even a fast Worker can finish.
  expect(await page.evaluate(() => {
    document.querySelector("#accept-import").click();
    return ["make-mode", "play-mode"].map(
      (id) => document.getElementById(id).disabled,
    );
  })).toEqual([true, true]);
  await page.locator("#make-mode").click();
  await page.locator("#analyze").click();
  await expect(page.locator("#solution-count")).toHaveText("22");
  await expect(page.locator("#result-state")).toHaveText("複数解");
  await page.locator("#sample-button").click();
  await page.locator(".sample-option").nth(2).click();
  expect(new URL(page.url()).hash).toBe("");
  await page.reload();
  await expect(page.locator("#import-banner")).toBeHidden();
  await expect(page.locator("#code")).toHaveValue(/まんなかは赤/);
});
test("painting, move undo, reset undo and clear input remain distinct", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#generate").click();
  const cell = page.locator("#board .board-cell:not(.hint)").first();
  await page.locator('[data-paint="blue"]').click();
  await cell.click();
  await expect(cell).toHaveAttribute("aria-label", /青/);
  await page.locator('[data-paint="red"]').click();
  await cell.click();
  await expect(cell).toHaveAttribute("aria-label", /赤/);
  await page.locator("#undo-move").click();
  await expect(cell).toHaveAttribute("aria-label", /青/);
  await page.locator("#reset").click();
  await expect(cell).toHaveAttribute("aria-label", /未入力/);
  await page.locator("#undo-move").click();
  await expect(cell).toHaveAttribute("aria-label", /青/);
  await page.locator('[data-paint="empty"]').click();
  await cell.click();
  await expect(cell).toHaveAttribute("aria-label", /未入力/);
});
test("no automatic evaluation of code edited while WASM is loading", async ({
  page,
}) => {
  let release;
  const blocked = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/*.wasm", async (route) => {
    await blocked;
    await route.continue();
  });
  await page.goto("./");
  await page.locator("#code").fill(custom);
  release();
  await expect(page.locator("#runtime-text")).toContainText("準備できました", {
    timeout: 120000,
  });
  await expect(page.locator("#solution-count")).toHaveText("—");
  await page.locator("#analyze").click();
  await expect(page.locator("#solution-count")).toHaveText("84");
});
test("accessibility checks pass for editor, game and share dialog", async ({
  page,
}) => {
  await ready(page);
  const scan = async () => {
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  };
  await scan();
  await page.locator("#generate").click();
  await scan();
  await page.locator("#share").click();
  await scan();
});
test("small screens have no page overflow and first-time play has a working entry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#play-mode").click();
  await page.locator("#start-puzzle").click();
  await expect(page.locator("#puzzle-meta")).toContainText(
    "固定ヒント込み：1通り",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("#play-empty")).toBeHidden();
});
