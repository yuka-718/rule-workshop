import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { encodeShare } from "../../src/share.js";
const fixtures = JSON.parse(readFileSync("test/fixtures.json", "utf8"));
const workerName = readdirSync("dist/assets").find((n) =>
  /^ruby\.worker-.*\.js$/.test(n),
);
async function ready(page) {
  await page.goto("./");
  await expect(page.locator("#runtime-text")).toContainText("準備できました", {
    timeout: 120000,
  });
  await expect(page.locator("#solution-count")).toHaveText("22");
}
async function rpc(page, requests) {
  return page.evaluate(
    async ({ requests, workerName }) => {
      const worker = new Worker(
        new URL(`./assets/${workerName}`, document.baseURI),
        { type: "module" },
      );
      const next = () =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Worker timeout")),
            120000,
          );
          worker.onmessage = ({ data }) => {
            clearTimeout(timer);
            resolve(data);
          };
          worker.onerror = (e) => {
            clearTimeout(timer);
            reject(new Error(e.message));
          };
        });
      const startup = next();
      worker.postMessage({
        type: "init",
        wasm: new URL("./vendor/ruby+stdlib.wasm", document.baseURI).href,
      });
      const boot = await startup;
      if (boot.type !== "ready") throw new Error(JSON.stringify(boot));
      const results = [];
      for (let i = 0; i < requests.length; i++) {
        const promise = next();
        worker.postMessage({ type: "request", id: i, payload: requests[i] });
        const result = await promise;
        delete result.id;
        delete result.type;
        results.push(result);
      }
      worker.terminate();
      return { boot, results };
    },
    { requests, workerName },
  );
}
test("browser Ruby matches native Ruby for shared fixtures, seeded generation and judging", async ({
  page,
}) => {
  await ready(page);
  const requests = fixtures.map((f) => ({ action: "analyze", code: f.code }));
  requests.push({ action: "generate", code: fixtures[2].code, seed: 42 });
  requests.push({
    action: "judge",
    code: fixtures[0].code,
    hints: Array(9).fill(null),
    cells: Array(9).fill(null),
  });
  requests.push({
    action: "analyze",
    code: fixtures[1].code.replace("b.count(:red) == 3", "Kernel.exit"),
  });
  const native = JSON.parse(
    execFileSync(
      "ruby",
      [
        "-EUTF-8",
        "-r",
        "./ruby/core",
        "-e",
        "puts JSON.generate(JSON.parse(STDIN.read).map { |r| JSON.parse(RuleWorkshop::API.handle(JSON.generate(r))) })",
      ],
      { input: JSON.stringify(requests), encoding: "utf8" },
    ),
  );
  const actual = await rpc(page, requests);
  expect(actual.boot.smoke).toMatchObject({ parsed: true, sum: 45 });
  expect(actual.results).toEqual(native);
});
test("edit → inspect → generate → keyboard play → reset → share → consent in a fresh browser", async ({
  page,
  browser,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  const source = fixtures.find((f) => f.id === "three").code;
  await page.locator("#code").fill(source);
  await expect(page.locator("#result-state")).toHaveText("変更前の結果");
  await expect(page.locator("#generate")).toBeDisabled();
  await page.locator("#analyze").click();
  await expect(page.locator("#solution-count")).toHaveText("84");
  await page.locator("#generate").click();
  await expect(page.locator("#puzzle-meta")).toContainText(
    "固定ヒント込み：1通り",
  );
  const cells = page.locator("#board .board-cell");
  const hints = await cells.evaluateAll((els) =>
    els.map((el) =>
      el.classList.contains("hint")
        ? el.querySelector(".red")
          ? "red"
          : "blue"
        : null,
    ),
  );
  const native = JSON.parse(
    execFileSync(
      "ruby",
      [
        "-EUTF-8",
        "-r",
        "./ruby/core",
        "-e",
        'r=JSON.parse(STDIN.read); s=RuleWorkshop::Solver.new(RuleWorkshop::Parser.new.parse(r["code"])); puts JSON.generate(s.with_hints(RuleWorkshop::API.cells(r["hints"])).first.cells)',
      ],
      { input: JSON.stringify({ code: source, hints }), encoding: "utf8" },
    ),
  );
  const fixedIndex = hints.findIndex((x) => x !== null);
  await cells.nth(fixedIndex).focus();
  await page.keyboard.press(hints[fixedIndex] === "red" ? "b" : "r");
  expect(await cells.nth(fixedIndex).getAttribute("aria-label")).toContain(
    hints[fixedIndex] === "red" ? "赤" : "青",
  );
  const openIndices = hints
    .map((c, i) => (c === null ? i : null))
    .filter((i) => i !== null);
  for (const i of openIndices) {
    await cells.nth(i).focus();
    await page.keyboard.press(native[i] === "red" ? "b" : "r");
  }
  await expect(page.locator("#judge-status")).toHaveClass(/incorrect/);
  await page.locator("#reset").click();
  await expect(page.locator("#board .empty")).toHaveCount(openIndices.length);
  for (const i of openIndices) {
    await cells.nth(i).focus();
    await page.keyboard.press(native[i] === "red" ? "r" : "b");
  }
  await expect(page.locator("#judge-status")).toHaveClass(/correct/);
  await expect(page.locator("#board")).toHaveClass(/cleared/);
  await page.locator("#share").click();
  const url = await page.locator("#share-url").inputValue();
  expect(url).toContain("#p=");
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await other.goto(url);
  await expect(other.locator("#runtime-text")).toContainText("準備できました", {
    timeout: 120000,
  });
  await expect(other.locator("#import-banner")).toBeVisible();
  await expect(other.locator("#solution-count")).toHaveText("—");
  await expect(other.locator("#accept-import")).toBeEnabled();
  await other.locator("#accept-import").click();
  await expect(other.locator("#puzzle-meta")).toContainText(
    "固定ヒント込み：1通り",
  );
  expect(
    await other
      .locator("#board .board-cell")
      .evaluateAll((els) =>
        els.map((el) =>
          el.classList.contains("hint")
            ? el.querySelector(".red")
              ? "red"
              : "blue"
            : null,
        ),
      ),
  ).toEqual(hints);
  await fresh.close();
  await page.locator("#share-dialog .close-dialog").click();
  await page.reload();
  await expect(page.locator("#code")).toHaveValue(source);
  await expect(page.locator("#solution-count")).toHaveText("—");
  expect(errors).toEqual([]);
});
test("sample selection, no-solution errors, unplayable generation and stale async result", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#sample-button").click();
  await expect(page.locator(".sample-option")).toHaveCount(4);
  await page.locator(".sample-option").nth(3).click();
  await page.locator("#analyze").click();
  await expect(page.locator("#solution-count")).toHaveText("0");
  await expect(page.locator("#generate")).toBeDisabled();
  await page.locator("#code").fill(fixtures[0].code);
  await page.locator("#analyze").click();
  await expect(page.locator("#solution-count")).toHaveText("512");
  await page.locator("#generate").click();
  await expect(page.locator("#notice")).toContainText("遊ぶ空欄が残りません");
  await page.locator("#code").fill('puzzle "bad" do');
  await page.locator("#analyze").click();
  await expect(page.locator("#notice")).toContainText("構文エラー");
  await page.locator("#code").fill(fixtures[1].code);
  // Synchronously edit immediately after dispatch to guarantee a stale request.
  await page.evaluate(() => {
    document.querySelector("#analyze").click();
    const e = document.querySelector("#code");
    e.value += "\n# changed";
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#analyze")).toBeEnabled();
  await expect(page.locator("#generate")).toBeDisabled();
  await expect(page.locator("#result-state")).toHaveText("変更前の結果");
});
test("malformed share and inert HTML text", async ({ page }) => {
  await page.goto("./#p=invalid");
  await expect(page.locator("#notice")).toContainText("共有");
  const code = fixtures[2].code.replace(
    "赤を3つ、くっつけずに",
    "<img src=x onerror=alert(1)>",
  );
  await ready(page);
  const { results } = await rpc(page, [{ action: "generate", code, seed: 9 }]);
  const url = new URL(page.url());
  url.hash = encodeShare(code, results[0].result.hints);
  await page.goto(url.href);
  await page.locator("#accept-import").click();
  await expect(page.locator("#puzzle-title")).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator("#puzzle-title img")).toHaveCount(0);
});
test("mobile fits the viewport and all WASM assets load from the Pages subpath", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const remote = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:5174/")) remote.push(r.url());
  });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(remote).toEqual([]);
});
test("WASM failure is visible and retry recreates the worker", async ({
  page,
}) => {
  await page.route("**/*.wasm", (route) => route.abort("failed"));
  await page.goto("./");
  await expect(page.locator("#notice")).toContainText("読み込めませんでした");
  await expect(page.locator("#retry")).toBeVisible();
  await page.unroute("**/*.wasm");
  await page.locator("#retry").click();
  await expect(page.locator("#solution-count")).toHaveText("22", {
    timeout: 120000,
  });
});
