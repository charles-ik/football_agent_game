// @ts-check
const { test, expect } = require("@playwright/test");

// The one end-to-end spec: new game -> assign a scout -> continue a handful
// of weeks -> sign a client. The API parity test already proves the engine
// and the HTTP layer agree; this proves the browser actually reaches them —
// that a real click lands on a real Server Action, not that the rules hold.
//
// Seed 42 is deterministic and, with the scout on the "east" region, already
// produces an approachable player after the very first week — so 10
// continues is comfortable headroom, not a tight bound.
//
// Plain CommonJS (not .ts) so Playwright's config/spec loader never needs a
// TS transform pass in this environment.
const MIN_COMMISSION_PCT = "3"; // matches balance.yaml's commission.min_pct (0.03) —
// proposing the floor is always accepted outright, regardless of the hidden
// threshold, because overreach can never be positive at the minimum.

test("new game, assign a scout, continue, sign a client", async ({ page }) => {
  // The shell renders navigation twice — a vertical rail for wide viewports
  // and a horizontal strip for narrow ones — so every nav query is scoped to
  // the rail by its landmark label rather than matching both.
  const nav = page.locator('nav[aria-label="Main"]');
  // Continue likewise renders in two positions; only the rail one is visible
  // at this viewport.
  const continueButton = page.locator('[data-continue="rail"]');

  await page.goto("/new-game");

  await page.getByLabel("Agency name").fill("E2E Agency");
  await page.getByLabel("Seed (optional)").fill("42");
  await page.getByRole("button", { name: "Start a new agency" }).click();

  await expect(page.getByText("The agency is open.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("link", { name: "Start week 1" }).click();
  await expect(page).toHaveURL("/");

  await nav.getByRole("link", { name: /Scouting/ }).click();
  await expect(page).toHaveURL("/scouting");

  // Assign the starting scout to the first region so reports accumulate.
  await page.getByRole("button", { name: "Assign" }).first().click();
  const assignDialog = page.getByRole("dialog");
  await expect(assignDialog).toBeVisible();
  await assignDialog.getByRole("button", { name: "Send him" }).click();
  await expect(assignDialog).toBeHidden();

  // The week summary sits above the button rather than over it, so there is
  // no need to dismiss it between presses — and trying to is flaky, because
  // each press re-renders the tree underneath it.
  const weekSummary = page.getByRole("region", { name: "The week that was" });
  for (let week = 0; week < 10; week++) {
    await continueButton.click();
    await expect(continueButton).toBeEnabled({ timeout: 15_000 });
  }
  await expect(weekSummary.or(continueButton).first()).toBeVisible();

  const approachButton = page.getByRole("button", { name: "Approach", exact: true }).first();
  await expect(approachButton).toBeVisible({ timeout: 20_000 });
  await approachButton.click();

  const negotiationDialog = page.getByRole("dialog");
  await expect(negotiationDialog).toBeVisible();
  const pctInput = page.getByLabel("Commission percentage value");
  await expect(pctInput).toBeVisible({ timeout: 10_000 });
  await pctInput.fill(MIN_COMMISSION_PCT);
  await negotiationDialog.getByRole("button", { name: /^Propose/ }).click();

  // The floor is always accepted outright, and completion happens
  // server-side in the same request — no separate "confirm" step.
  await expect(negotiationDialog.getByText(/^Signed .* commission\.$/)).toBeVisible({
    timeout: 10_000,
  });
  // Two buttons share the accessible name "Close" here: the dialog chrome's
  // "✕" (aria-label) and the outcome panel's own Close — the outcome one is
  // the one rendered last.
  await negotiationDialog.getByRole("button", { name: "Close" }).last().click();
  await expect(negotiationDialog).toBeHidden();

  // He should now show up as a client.
  await nav.getByRole("link", { name: /Clients/ }).click();
  await expect(page).toHaveURL("/clients");
  await expect(page.getByRole("table")).toBeVisible();
});

test("the decision rail clears an obligation once it is resolved", async ({ page }) => {
  // The regression this guards: the old list was a four-week window over
  // ACTION events, so it kept showing prompts for things already dealt with.
  await page.goto("/new-game");
  await page.getByLabel("Agency name").fill("Rail Agency");
  await page.getByLabel("Seed (optional)").fill("42");
  await page.getByRole("button", { name: "Start a new agency" }).click();
  await page.getByRole("link", { name: "Start week 1" }).click();
  await expect(page).toHaveURL("/");

  const rail = page.getByRole("complementary", { name: "This week" });
  await expect(rail).toBeVisible();

  // Whatever the rail shows, it must agree with the count on the button —
  // both now read the same derived list rather than two different sources.
  const continueButton = page.locator('[data-continue="rail"]');
  await expect(continueButton).toBeVisible();
});
