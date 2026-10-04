import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const localChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "./test/browser",
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL:
      process.env.TEST_BASE_URL || "http://127.0.0.1:5174/rule-workshop/",
    launchOptions: existsSync(localChrome)
      ? { executablePath: localChrome }
      : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: "npm run preview -- --port 5174 --base /rule-workshop/",
        url: "http://127.0.0.1:5174/rule-workshop/",
        reuseExistingServer: !process.env.CI,
      },
});
