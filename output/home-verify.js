const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("https://prometheus.prod/?lang=en&source=home-verify", { waitUntil: "networkidle" });
  const state = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-fragment-id]')].map((card) => ({
      id: card.getAttribute('data-fragment-id'),
      stage: card.getAttribute('data-fragment-stage'),
      patchState: card.getAttribute('data-home-patch-state') || card.getAttribute('data-fragment-patch-state') || null,
      minHeight: getComputedStyle(card).minHeight,
      height: Math.round(card.getBoundingClientRect().height)
    }));
    return {
      cardCount: cards.length,
      readyCount: cards.filter((c) => c.stage === 'ready').length,
      waitingCount: cards.filter((c) => c.stage !== 'ready').length,
      waiting: cards.filter((c) => c.stage !== 'ready')
    };
  });
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
