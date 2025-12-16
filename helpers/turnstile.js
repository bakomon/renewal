/**
 * Source: NopeCHA CAPTCHA Solver
 * - url: https://chromewebstore.google.com/detail/nopecha-captcha-solver/dknlfmjaanfblgfdfebhijalfmhmjjjo
 * - version: 0.5.4
 *
 * File:
 * - background.js
 * - captcha/turnstile.js
 * 
 * Similar:
 * - https://github.com/ZFC-Digital/puppeteer-real-browser/blob/510939f606df79e70688cc112e74b93eb1420a2d/lib/cjs/module/turnstile.js
 */


// keep last known mouse positions per page
const pageState = new WeakMap();

/* small easing and bezier helpers ported to puppeteer environment */
function easeCurve(e) {
    return 1 - Math.pow(1 - e, 3);
}
function cubicBezier(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return {
        x: Math.pow(u, 3) * p0.x +
           3 * Math.pow(u, 2) * t * p1.x +
           3 * u * Math.pow(t, 2) * p2.x +
           Math.pow(t, 3) * p3.x,
        y: Math.pow(u, 3) * p0.y +
           3 * Math.pow(u, 2) * t * p1.y +
           3 * u * Math.pow(t, 2) * p2.y +
           Math.pow(t, 3) * p3.y,
    };
}

/* human-like variable step sleep */
async function variableSleep(progress, minMs = 2, maxMs = 32) {
    const r = minMs + (1 - Math.sin(Math.PI * progress)) * (maxMs - minMs);
    await sleep(r);
}

/* compute a plausible starting point for move: use stored last or random near target */
async function getStartPos(page, targetX, targetY) {
    const state = pageState.get(page) || { positions: [] };
    if (state.positions.length > 0) {
        // use the last stored position
        return state.positions[state.positions.length - 1];
    }
    // fallback: try to read viewport center
    try {
        const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
        return { x: Math.max(0, Math.min(vp.w - 1, targetX + (Math.random() - 0.5) * 200)),
                 y: Math.max(0, Math.min(vp.h - 1, targetY + (Math.random() - 0.5) * 200)) };
    } catch {
        return { x: targetX + (Math.random() - 0.5) * 100, y: targetY + (Math.random() - 0.5) * 100 };
    }
}

/* store position history */
function pushPosition(page, pos) {
    let state = pageState.get(page);
    if (!state) {
        state = { positions: [] };
        pageState.set(page, state);
    }
    state.positions.push(pos);
    // keep reasonable history
    if (state.positions.length > 100) state.positions = state.positions.slice(-100);
}

/*
 * moveMouseHuman - emulate mouse path before clicking
 * page: puppeteer Page
 * toX,toY: absolute coordinates in the page viewport
 * opts: { stepsCap } optional
 */
async function moveMouseHuman(page, toX, toY, opts = {}) {
    const start = await getStartPos(page, toX, toY);
    const from = { x: start.x, y: start.y };
    // distance and steps
    const dx = toX - from.x;
    const dy = toY - from.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.min(64, Math.max(8, Math.ceil(dist / 8)));
    // control points heuristic similar to extension
    const cp1 = { x: from.x + dx * 0.2 + (Math.random() - 0.5) * 50, y: from.y + dy * 0.2 + (Math.random() - 0.5) * 50 };
    const cp2 = { x: from.x + dx * 0.6 + (Math.random() - 0.5) * 30, y: from.y + dy * 0.6 + (Math.random() - 0.5) * 30 };
    // iterate points and move
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const z = easeCurve(t);
        const p = cubicBezier(from, cp1, cp2, { x: toX, y: toY }, z);
        // apply tiny random jitter to intermediate steps (not final)
        if (i !== steps) {
            p.x += (Math.random() - 0.5) * 2;
            p.y += (Math.random() - 0.5) * 2;
        } else {
            // final point snap to exact target
            p.x = toX;
            p.y = toY;
        }
        try {
            // use puppeteer mouse.move with single step for exactness
            await page.mouse.move(Math.round(p.x), Math.round(p.y));
        } catch {}
        await variableSleep(z, 2, 32);
        // occasionally store intermediate points for future start positions
        if (Math.random() > 0.9) pushPosition(page, { x: p.x, y: p.y });
    }
    // ensure final stored position
    pushPosition(page, { x: toX, y: toY });
}

function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
}

/* small helper to compute click jitter inside the interactive area */
function computeJitter(pad, gap) {
    // keep behavior identical: small random offset bounded by pad/gap
    const range = Math.max(pad - gap * 2, 0);
    return {
        x: Math.floor((Math.random() - 0.5) * 0.5 * range),
        y: Math.floor((Math.random() - 0.5) * 0.5 * range),
    };
}

async function getElementBox(elementHandle, page) {
    // boundingBox may return null for transformed/invisible nodes, fallback to DOM rect
    let box = await elementHandle.boundingBox();
    if (box) return box;
    return await page.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
    }, elementHandle);
}

async function locateTurnstileFrame(page) {
    // Try frames by URL heuristics first
    const frames = page.frames();
    for (const frame of frames) {
        const url = frame.url() || '';
        if (url.includes('turnstile') || url.includes('challenges.cloudflare') || url.includes('cloudflare.com')) {
            try {
                const frameEl = await frame.frameElement();
                if (!frameEl) continue;
                const box = await getElementBox(frameEl, page);
                if (box && box.width > 0 && box.height > 0) {
                    return { x: box.x, y: box.y, w: box.width, h: box.height };
                }
            } catch (e) {
                // ignore cross-origin/frame failures and continue
            }
        }
    }

    // Fallback: query common selectors
    const selectors = [
        'iframe[src*="turnstile"]',
        'iframe[title*="turnstile"]',
        'iframe[src*="challenges.cloudflare"]',
        'iframe[src*="cloudflare"]'
    ];
    for (const sel of selectors) {
        const handle = await page.$(sel);
        if (!handle) continue;
        const box = await getElementBox(handle, page);
        if (box && box.width > 0 && box.height > 0) {
            return { x: box.x, y: box.y, w: box.width, h: box.height };
        }
    }

    return null;
}

async function isTurnstileSolved(page) {
    // check for token field first
    try {
        const val = await page.$eval('input[name="cf-turnstile-response"]', el => el.value || '');
        if (val && val.length > 20) return true;
    } catch (e) {
        // ignore if element not present
    }
    // fallback: if turnstile frame is gone, consider it solved/cleared
    const frame = await locateTurnstileFrame(page);
    return frame === null;
}

const DEFAULT_SETTINGS = {
    turnstile_solve_delay: true,
    turnstile_solve_delay_time: 5000,
};

let isSolving = false;

/**
 * solve() - Puppeteer equivalent of the extension's O() turnstile solver routine
 * @param {import('puppeteer').Page} page
 * @param {Object} settings - optional settings object; fallback to DEFAULT_SETTINGS
 */
async function solve(page, settings = {}) {
    if (isSolving) return;
    isSolving = true;
    settings = { ...DEFAULT_SETTINGS, ...settings };

    try {
        await sleep(1000); // wait = 1s

        for (let attempt = 0; attempt < 3; attempt++) {
            if (settings.turnstile_solve_delay && settings.turnstile_solve_delay_time > 0) {
                await sleep(settings.turnstile_solve_delay_time);
            }

            await sleep(2500);

            const frameBox = await locateTurnstileFrame(page);
            if (frameBox === null) {
                // no visible frame found, wait and retry
                await sleep(2500);
                continue;
            }

            // destructure with clear names
            const { x: frameX, y: frameY, w: frameW, h: frameH } = frameBox;

            // constants describing hit area inside the frame (kept from original)
            const BUTTON_X_OFFSET = 16;
            const PAD = 30;
            const GAP = 4;

            const jitter = computeJitter(PAD, GAP);
            const clickX = Math.floor(frameX + BUTTON_X_OFFSET + Math.floor(PAD / 2) + jitter.x);
            const clickY = Math.floor(frameY + Math.floor(frameH / 2) + jitter.y);

            // move mouse with human-like path before clicking
            await moveMouseHuman(page, clickX, clickY);

            // clickAbs: left click with small human-like delay
            const delay = Math.floor(30 + Math.random() * 30);
            await page.mouse.click(clickX, clickY, { button: 'left', delay });

            await sleep(5000);

            // if solved (token present and long enough) or frame gone, stop attempts
            if (await isTurnstileSolved(page)) {
                break;
            }

            console.log(`Turnstile solve attempt ${attempt + 1} failed, retrying...`);
        }
    } finally {
        isSolving = false;
    }
}

module.exports = {
    solve,
    sleep,
    locateTurnstileFrame,
    moveMouseHuman,
};
