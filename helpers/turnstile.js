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


const {
    disablePointerVisual,
    enableMovementVisual,
    updateMovementVisual,
    showClickVisual
} = require('./mouseVisual');

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

/* compute a plausible starting point for move: pick a random point far from target */
async function getStartPos(page, targetX, targetY) {
    // always pick a random corner and offset from it by a random angle (degrees) + distance
    try {
        const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
        const corners = [
            { x: 0, y: 0 },                       // top-left
            { x: vp.w - 1, y: 0 },                // top-right
            { x: 0, y: vp.h - 1 },                // bottom-left
            { x: vp.w - 1, y: vp.h - 1 },         // bottom-right
        ];
        const corner = corners[Math.floor(Math.random() * corners.length)];
        // pick an angle in degrees within the 0-90° quadrant relative to the corner, convert to radians
        const angleDeg = Math.random() * 90;
        const angle = angleDeg * (Math.PI / 180);
        // distance: choose a reasonable distance based on viewport diagonal
        const diag = Math.hypot(vp.w, vp.h);
        const minR = Math.min(80, diag * 0.05);
        const maxR = Math.min(300, diag * 0.35);
        const r = minR + Math.random() * (maxR - minR);

        // determine direction signs so angle points into the page from the chosen corner
        const dirX = corner.x === 0 ? 1 : -1;
        const dirY = corner.y === 0 ? 1 : -1;

        let x = corner.x + Math.cos(angle) * r * dirX;
        let y = corner.y + Math.sin(angle) * r * dirY;

        // clamp to viewport
        x = Math.max(0, Math.min(vp.w - 1, Math.round(x)));
        y = Math.max(0, Math.min(vp.h - 1, Math.round(y)));
        return { x, y };
    } catch {
        // fallback: simple corner-based offsets if evaluation fails
        const cornerX = Math.random() < 0.5 ? 0 : 1;
        const cornerY = Math.random() < 0.5 ? 0 : 1;
        const angle = (Math.random() * 90) * (Math.PI / 180);
        const r = 100 + Math.random() * 200;
        const dirX = cornerX === 0 ? 1 : -1;
        const dirY = cornerY === 0 ? 1 : -1;
        return {
            x: Math.round((cornerX === 0 ? 0 : 800) + Math.cos(angle) * r * dirX),
            y: Math.round((cornerY === 0 ? 0 : 600) + Math.sin(angle) * r * dirY),
        };
    }
}

/*
 * moveMouseHuman - emulate mouse path before clicking
 * page: puppeteer Page
 * toX,toY: absolute coordinates in the page viewport
 */
async function moveMouseHuman(page, toX, toY, opts = {}) {
    const visual = opts.enableVisual;
    if (visual) await enableMovementVisual(page);

    const start = await getStartPos(page, toX, toY);
    const from = { x: start.x, y: start.y };
    // distance and steps
    const dx = toX - from.x;
    const dy = toY - from.y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.min(96, Math.max(12, Math.ceil(dist / 6)));

    // control points heuristic similar to extension (kept)
    const cp1 = { x: from.x + dx * 0.2 + (Math.random() - 0.5) * 50, y: from.y + dy * 0.2 + (Math.random() - 0.5) * 50 };
    const cp2 = { x: from.x + dx * 0.6 + (Math.random() - 0.5) * 30, y: from.y + dy * 0.6 + (Math.random() - 0.5) * 30 };

    // helper: cubic bezier derivative (tangent)
    function cubicBezierTangent(p0, p1, p2, p3, t) {
        const u = 1 - t;
        return {
            x: 3 * (Math.pow(u, 2) * (p1.x - p0.x) + 2 * u * t * (p2.x - p1.x) + Math.pow(t, 2) * (p3.x - p2.x)),
            y: 3 * (Math.pow(u, 2) * (p1.y - p0.y) + 2 * u * t * (p2.y - p1.y) + Math.pow(t, 2) * (p3.y - p2.y)),
        };
    }

    // winding oscillation parameters (randomized per move)
    const maxAmp = Math.min(60, Math.max(12, dist * 0.04)); // max perpendicular amplitude
    const freq = 1 + Math.random() * 2.2;                    // number of oscillation cycles along path
    const phase = Math.random() * Math.PI * 2;

    // iterate points and move, add perpendicular sinusoidal offset to create winding curve
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const z = easeCurve(t);
        const p = cubicBezier(from, cp1, cp2, { x: toX, y: toY }, z);

        // compute tangent and perpendicular unit vector
        const tan = cubicBezierTangent(from, cp1, cp2, { x: toX, y: toY }, z);
        const len = Math.hypot(tan.x, tan.y) || 1;
        const ux = tan.x / len;
        const uy = tan.y / len;
        // perpendicular (rotated 90deg)
        const px = -uy;
        const py = ux;

        // amplitude taper: stronger in middle, zero at ends
        const taper = Math.sin(Math.PI * t); // 0 at ends, 1 in middle
        const oscillation = Math.sin(2 * Math.PI * freq * t + phase);
        const offsetAmt = maxAmp * taper * oscillation;

        // apply winding offset (smaller jitter for final step)
        if (i !== steps) {
            p.x += px * offsetAmt + (Math.random() - 0.5) * 3;
            p.y += py * offsetAmt + (Math.random() - 0.5) * 3;
        } else {
            // final point snap to exact target
            p.x = toX;
            p.y = toY;
        }

        try {
            // use puppeteer mouse.move with single step for exactness
            await page.mouse.move(Math.round(p.x), Math.round(p.y));
        } catch {}
        if (visual) await updateMovementVisual(page, p.x, p.y);
        await variableSleep(z, 4, 36);
    }

    if (visual) await disablePointerVisual(page);
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

async function isTurnstileSolved(page, challenge = false) {
    // check for token field first
    try {
        const val = await page.$eval('input[name="cf-turnstile-response"]', el => el.value || '');
        if (val && val.length > 20) return true;
    } catch (e) {
        // ignore if element not present
    }

    if (challenge) {
        // For challenge pages, check in this order:
        // 1) frame is gone
        // 2) .lds-ring visible

        try {
            await page.waitForSelector('.lds-ring', { visible: true, timeout: 2000 });
            return true;
        } catch (e) {
            // not present
        }

        const frame = await locateTurnstileFrame(page);
        return frame === null;
    }

    return false;
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

        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // console.log(`Turnstile solve attempt: ${attempt + 1}/${maxAttempts}`);

            if (settings.turnstile_solve_delay && settings.turnstile_solve_delay_time > 0) {
                await sleep(settings.turnstile_solve_delay_time);
            }

            await sleep(2500);

            const frameBox = await locateTurnstileFrame(page);
            if (frameBox === null) {
                // no visible frame found, wait and retry
                await sleep(2500);
                console.log(`⚠️ Turnstile frame not found, retrying...`);
                continue;
            }

            // destructure with clear names
            const { x: frameX, y: frameY, w: frameW, h: frameH } = frameBox;

            // constants describing hit area inside the frame
            const LEFT_OFFSET = Math.floor(frameW * 0.054); // 5.4% of frame width (checkbox parent margin left)
            const RIGHT_OFFSET = Math.floor(frameW * 0.404) + LEFT_OFFSET; // 40.4% of frame width (branding width + space-between width)
            const BUTTON_X_OFFSET = LEFT_OFFSET + Math.floor(Math.random() * (frameW - LEFT_OFFSET - RIGHT_OFFSET + 1));
            const PAD = 30;
            const GAP = 4;

            const jitter = computeJitter(PAD, GAP);
            const clickX = Math.floor(frameX + BUTTON_X_OFFSET + Math.floor(PAD / 2) + jitter.x);
            const clickY = Math.floor(frameY + Math.floor(frameH / 2) + jitter.y);

            // move mouse with human-like path before clicking
            await moveMouseHuman(page, clickX, clickY, { enableVisual: true });

            await showClickVisual(page, clickX, clickY);

            // clickAbs: left click with small human-like delay
            const delay = Math.floor(30 + Math.random() * 30);
            await page.mouse.click(clickX, clickY, { button: 'left', delay });

            // repeatedly check for solved state
            const CHECK_TIMEOUT = 5000;
            const CHECK_INTERVAL = 250;
            const start = Date.now();
            let solved = false;
            while (Date.now() - start < CHECK_TIMEOUT) {
                if (await isTurnstileSolved(page, settings.challenge_page)) {
                    solved = true;
                    break;
                }
                await sleep(CHECK_INTERVAL);
            }

            // if solved, stop attempts
            if (solved) {
                break;
            }

            console.log(`⚠️ Turnstile solve attempt ${attempt + 1} failed, retrying...`);
        }
    } finally {
        isSolving = false;
    }
}

module.exports = {
    solve,
    sleep,
    locateTurnstileFrame,
    moveMouseHuman
};
