import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: {
    baseURL: process.env.TEST_BASE_URL || "https://gotfoth.vercel.app",
    browserName: "chromium",
    headless: true,
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH },
  },
  reporter: "list",
});
