#!/usr/bin/env node
/**
 * Capture clean product screenshots for the portfolio project cards.
 *
 * Setup:
 *   npm install
 *   npm run screenshots:install
 *   npm run screenshots
 *
 * Capture one target:
 *   npm run screenshots -- familyOs
 *
 * Authenticated dashboards (Family OS home, Business OS overview, Service Desk tickets):
 *   npx playwright codegen --save-storage=auth/family-os.json https://familyos-mu.vercel.app/login
 *   then set storageState on that target below.
 *
 * Tweaks live in VIEWPORT, DEFAULTS, and screenshotTargets.
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Viewport
// Portfolio cards use aspect-ratio 16 / 10. 1440x900 is an exact 16:10 frame.
// Use 1440x1024 or 1600x1200 if you want more vertical dashboard chrome, then
// either crop with `clip` or let the site's object-fit: cover handle it.
// ---------------------------------------------------------------------------
const VIEWPORT = {
  width: 1440,
  height: 900, // 16:10 — matches .project-image in index.html
};

const DEFAULTS = {
  fullPage: false,
  // Extra pause after the page looks ready. Bump for heavy dashboards / charts.
  settleMs: 1200,
  // Playwright jpeg quality (0–100). 82–88 is a good portfolio range.
  jpegQuality: 86,
  // 2x captures look sharp on retina. Drop to 1 if files are too large.
  deviceScaleFactor: 2,
  navigationTimeoutMs: 45000,
  readyTimeoutMs: 20000,
  // Hide overlays that commonly pollute product shots.
  hideSelectors: [
    "[data-vercel-toolbar]",
    "vercel-live-feedback",
    "#vercel-live-feedback",
    "nextjs-portal",
    "#cookie-banner",
    ".cookie-banner",
    "[class*='cookie-consent']",
    "[id*='cookie-banner']",
    "[class*='CookieBanner']",
    "#intercom-container",
    "[class*='intercom']",
    "#crisp-chatbox",
    "[class*='crisp-client']",
  ],
};

/**
 * Paste / swap URLs here.
 *
 * Optional per-target keys:
 *   waitForSelector  CSS selector that must be visible before capture
 *   waitForText      visible text that must appear before capture
 *   scrollIntoView   text to scroll into view before capture (useful for dashboard sections)
 *   waitMs           extra settle time for this page only
 *   fullPage         true only if the hero/dashboard needs the whole document
 *   clip             { x, y, width, height } in CSS pixels — crop to a hero/dashboard
 *   selector         screenshot this element instead of the viewport
 *   hideSelectors    extra selectors to hide for this page
 *   hideText         hide elements whose visible text matches (chat widgets, sticky CTAs)
 *   storageState     path to a Playwright storageState JSON (logged-in session)
 *   readyTimeoutMs   override wait-for-selector timeout
 *
 * Clip example (top 16:10 crop of a 1440x1024 viewport):
 *   clip: { x: 0, y: 0, width: 1440, height: 900 }
 */
const screenshotTargets = {
  familyOs: {
    url: "https://family-hub-snowy.vercel.app/display",
    output: "images/family-os.jpg",
    // Authenticated Family OS home (dashboard after login):
    // url: "https://familyos-mu.vercel.app/home",
    // storageState: "auth/family-os.json",
    waitForText: "kitchen command center",
    waitMs: 1800,
  },
  businessOs: {
    url: "https://app.nextphaseit.org/overview",
    output: "images/business-os.jpg",
    // After logging in via codegen, this lands on the operations overview.
    // storageState: "auth/business-os.json",
    waitForText: "Business OS",
    waitMs: 1600,
  },
  serviceDesk: {
    url: "https://portal.nextphaseit.org/demo",
    output: "images/service-desk.jpg",
    // Authenticated agent/ticketing console:
    // url: "https://portal.nextphaseit.org/tickets",
    // storageState: "auth/service-desk.json",
    waitForText: "Open incidents",
    scrollIntoView: "Operations console · command center",
    hideText: ["Get support"],
    waitMs: 2000,
  },
  nextphase: {
    url: "https://www.nextphaseit.org/",
    output: "images/nextphase.jpg",
    waitForText: "Empowering Small Businesses",
    waitMs: 1400,
    // Homepage hero only — uncomment if the full viewport includes too much below the fold:
    // clip: { x: 0, y: 0, width: 1440, height: 900 },
  },
};

const HIDE_STYLE = `
  html { scrollbar-width: none !important; }
  body::-webkit-scrollbar { display: none !important; }
  * { caret-color: transparent !important; }
`;

function parseArgs(argv) {
  const flags = new Set();
  const names = [];
  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg.slice(2));
    else names.push(arg);
  }
  return { flags, names };
}

function resolveTargetPath(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function waitForPageReady(page, target) {
  const readyTimeout = target.readyTimeoutMs ?? DEFAULTS.readyTimeoutMs;

  try {
    await page.waitForLoadState("domcontentloaded", { timeout: readyTimeout });
  } catch {
    // Continue — some SPAs never settle this event cleanly.
  }

  try {
    await page.waitForLoadState("load", { timeout: readyTimeout });
  } catch {
    // Continue with a selector / settle wait.
  }

  // networkidle is useful but can hang on analytics/websockets. Best-effort only.
  try {
    await page.waitForLoadState("networkidle", { timeout: 8000 });
  } catch {
    // Ignore.
  }

  if (target.waitForSelector) {
    await page.waitForSelector(target.waitForSelector, {
      state: "visible",
      timeout: readyTimeout,
    });
  }

  if (target.waitForText) {
    await page.getByText(target.waitForText, { exact: false }).first().waitFor({
      state: "visible",
      timeout: readyTimeout,
    });
  }

  if (target.scrollIntoView) {
    const loc = page.getByText(target.scrollIntoView, { exact: false }).first();
    await loc.waitFor({ state: "visible", timeout: readyTimeout });
    await loc.evaluate((el) => el.scrollIntoView({ block: "start", inline: "nearest" }));
  }

  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));

  const settleMs = target.waitMs ?? DEFAULTS.settleMs;
  if (settleMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, settleMs));
  }
}

async function hideNoise(page, target) {
  const selectors = [
    ...DEFAULTS.hideSelectors,
    ...(target.hideSelectors || []),
  ];

  await page.addStyleTag({ content: HIDE_STYLE });

  await page.evaluate((list) => {
    for (const selector of list) {
      document.querySelectorAll(selector).forEach((el) => {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
      });
    }
  }, selectors);

  if (target.hideText?.length) {
    for (const text of target.hideText) {
      const locators = page.getByText(text, { exact: false });
      const count = await locators.count();
      for (let i = 0; i < count; i++) {
        await locators.nth(i).evaluate((el) => {
          const node = el.closest("a, button, [role='button']") || el;
          node.style.setProperty("display", "none", "important");
        }).catch(() => {});
      }
    }
  }
}

async function captureTarget(browser, key, target) {
  if (!target.url) {
    console.warn(`skip ${key}: no url set`);
    return { key, skipped: true };
  }

  const outputPath = resolveTargetPath(target.output);
  ensureDir(outputPath);

  const contextOptions = {
    viewport: VIEWPORT,
    deviceScaleFactor: target.deviceScaleFactor ?? DEFAULTS.deviceScaleFactor,
    colorScheme: "light",
    reducedMotion: "reduce",
  };

  if (target.storageState) {
    const storagePath = resolveTargetPath(target.storageState);
    if (fs.existsSync(storagePath)) {
      contextOptions.storageState = storagePath;
    } else {
      console.warn(`  ${key}: storageState not found at ${target.storageState} — capturing logged-out view`);
    }
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(DEFAULTS.navigationTimeoutMs);

  console.log(`capturing ${key}`);
  console.log(`  ${target.url}`);
  console.log(`  → ${path.relative(ROOT, outputPath)}`);

  await page.goto(target.url, { waitUntil: "domcontentloaded" });
  await waitForPageReady(page, target);
  await hideNoise(page, target);

  const screenshotOptions = {
    path: outputPath,
    type: "jpeg",
    quality: target.jpegQuality ?? DEFAULTS.jpegQuality,
    fullPage: target.fullPage ?? DEFAULTS.fullPage,
    animations: "disabled",
    scale: "device",
  };

  if (target.clip) {
    screenshotOptions.clip = target.clip;
  }

  if (target.selector) {
    const locator = page.locator(target.selector).first();
    await locator.waitFor({ state: "visible", timeout: target.readyTimeoutMs ?? DEFAULTS.readyTimeoutMs });
    await locator.screenshot(screenshotOptions);
  } else {
    await page.screenshot(screenshotOptions);
  }

  await context.close();

  const bytes = fs.statSync(outputPath).size;
  console.log(`  saved ${(bytes / 1024).toFixed(1)} KB`);
  return { key, outputPath, bytes };
}

function optimizeWithSips(filePath, quality) {
  const { spawnSync } = require("child_process");
  const result = spawnSync(
    "sips",
    ["-s", "format", "jpeg", "-s", "formatOptions", String(quality), filePath, "--out", filePath],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "sips failed");
  }
}

function optimizeOutputs(targets) {
  console.log("optimizing JPEGs with sips…");
  for (const [key, target] of Object.entries(targets)) {
    const filePath = resolveTargetPath(target.output);
    if (!fs.existsSync(filePath)) {
      console.warn(`skip optimize ${key}: missing ${target.output}`);
      continue;
    }
    const before = fs.statSync(filePath).size;
    optimizeWithSips(filePath, 78);
    const after = fs.statSync(filePath).size;
    console.log(
      `  ${key}: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB`
    );
  }
}

async function main() {
  const { flags, names } = parseArgs(process.argv.slice(2));
  const selected = names.length
    ? Object.fromEntries(
        names.map((name) => {
          if (!screenshotTargets[name]) {
            throw new Error(`Unknown target "${name}". Known: ${Object.keys(screenshotTargets).join(", ")}`);
          }
          return [name, screenshotTargets[name]];
        })
      )
    : screenshotTargets;

  if (flags.has("optimize-only")) {
    optimizeOutputs(selected);
    return;
  }

  const browser = await chromium.launch({
    headless: !flags.has("headed"),
  });

  try {
    for (const [key, target] of Object.entries(selected)) {
      await captureTarget(browser, key, target);
    }
  } finally {
    await browser.close();
  }

  if (flags.has("optimize")) {
    optimizeOutputs(selected);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
