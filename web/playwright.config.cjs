// @ts-check
const { defineConfig } = require("@playwright/test");

// One end-to-end spec, driving the real stack (FastAPI + Next.js) exactly as
// a player would: new game -> assign a scout -> continue -> sign someone.
// The API parity test already proves the rules match the engine; this proves
// the wiring — that clicking things in the browser actually reaches them.
//
// Both servers are started against an isolated saves directory so a real run
// on disk is never touched. Plain CommonJS (not .ts) so Playwright's config
// loader never needs a TS transform pass.
module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "python3 -m uvicorn api.main:create_app --factory --port 8100 --workers 1",
      cwd: "..",
      port: 8100,
      reuseExistingServer: false,
      env: { FA_SAVES_DIR: "/tmp/fa-e2e-saves" },
      timeout: 30_000,
    },
    {
      command: "npm run build && npm run start -- -p 3100",
      port: 3100,
      reuseExistingServer: false,
      env: { API_BASE: "http://127.0.0.1:8100" },
      timeout: 120_000,
    },
  ],
});
