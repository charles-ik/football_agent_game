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

test("the decision rail clears a resolved career conversation", async ({ page, request }) => {
  await page.goto("/new-game");
  await page.getByLabel("Agency name").fill("Rail Agency");
  await page.getByLabel("Seed (optional)").fill("42");
  await page.getByRole("button", {name:"Start a new agency"}).click();
  await page.getByRole("link", {name:"Start week 1"}).click();
  const session = (await page.context().cookies()).find(c=>c.name==='fa_session');
  const headers = {cookie:`fa_session=${session.value}`};
  let decision;
  for (let n=0;n<15&&!decision;n++) {
    await request.post('http://127.0.0.1:8100/api/game/continue',{headers});
    const inbox = await (await request.get('http://127.0.0.1:8100/api/game/decisions',{headers})).json();
    decision = inbox.decisions.find(d=>d.kind==='career.story');
  }
  expect(decision).toBeTruthy();
  await page.goto('/careers');
  const rail = page.getByRole('complementary',{name:'This week'});
  await expect(rail.locator(`[data-decision-id="${decision.id}"]`)).toBeVisible();
  await page.getByRole('button',{name:'Have an honest conversation'}).first().click();
  await expect(rail.locator(`[data-decision-id="${decision.id}"]`)).toHaveCount(0);
  const after = await (await request.get('http://127.0.0.1:8100/api/game/decisions',{headers})).json();
  expect(after.decisions.some(d=>d.id===decision.id)).toBeFalsy();
});

test("an open career conversation survives skip and closes review on selection", async ({ page, request }) => {
  await page.setViewportSize({width:360,height:800});
  await page.goto("/new-game");
  await page.getByLabel("Agency name").fill("Review Agency");
  await page.getByLabel("Seed (optional)").fill("42");
  await page.getByRole("button", {name:"Start a new agency"}).click();
  await page.getByRole("link", {name:"Start week 1"}).click();

  const session = (await page.context().cookies()).find((cookie) => cookie.name === "fa_session");
  const headers = {cookie:`fa_session=${session.value}`};
  let decision;
  for (let n=0;n<15&&!decision;n++) {
    await request.post("http://127.0.0.1:8100/api/game/continue", {headers});
    const inbox = await (await request.get("http://127.0.0.1:8100/api/game/decisions", {headers})).json();
    decision = inbox.decisions.find((item) => item.kind === "career.story");
  }
  expect(decision).toBeTruthy();

  await page.goto("/careers");
  const reviewButton = page.locator('button[aria-label^="Review "]:visible');
  await expect(reviewButton).toHaveCount(1);
  await reviewButton.click();
  const dialog = page.getByRole("dialog", {name:"This week · your decisions"});
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", {name:"Skip these and advance to next event"}).click();
  await expect(dialog.locator(`[data-decision-id="${decision.id}"]`)).toBeVisible();
  const afterSkip = await (await request.get("http://127.0.0.1:8100/api/game/decisions", {headers})).json();
  expect(afterSkip.decisions.some((item) => item.id === decision.id)).toBeTruthy();

  await dialog.locator(`[data-decision-id="${decision.id}"]`).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", {name:"Careers & commitments"})).toBeVisible();
});

test('agency expansion is usable on desktop and a narrow phone', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/new-game');
  await page.getByLabel('Agency name').fill('Northbank Agency');
  await page.getByLabel('Seed (optional)').fill('42');
  await page.getByRole('button',{name:'Start a new agency'}).click();
  await page.getByRole('link',{name:'Start week 1'}).click();
  await expect(page.getByRole('heading',{name:'Welcome to the office.'})).toBeVisible();
  await page.screenshot({path:'/tmp/fa-office-desktop.png',fullPage:true});
  await page.goto('/agency');
  await page.getByRole('button',{name:/^Hire /}).first().click();
  await expect(page.getByText('Your support slots are full.',{exact:false})).toBeVisible();
  await page.reload();
  await expect(page.getByText('Your support slots are full.',{exact:false})).toBeVisible();
  for (const route of ['/agency','/careers','/market','/world','/finances','/headquarters','/season-review']) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.getByText('Something went wrong',{exact:false})).toHaveCount(0);
  }
  await page.setViewportSize({width:360,height:800});
  await page.goto('/market');
  await expect(page.locator('[data-continue="floating"]')).toBeVisible();
  await page.getByRole('button',{name:/Review \d+ decisions/}).filter({visible:true}).click();
  await expect(page.getByRole('dialog',{name:'This week · your decisions'})).toBeVisible();
  await page.getByRole('button',{name:'Keep managing'}).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:'/tmp/fa-market-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'More',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Around the agency'})).toBeVisible();
  await page.getByRole('dialog').getByRole('link',{name:'Scouting',exact:true}).click();
  await expect(page).toHaveURL('/scouting');
});
