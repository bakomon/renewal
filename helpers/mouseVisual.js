/**
 * Visual helper for mouse overlay and click/move visualization.
 */

async function disablePointerVisual(page) {
    await page.evaluate(() => {
        try {
            if (window.__mouse_visual_overlay) {
                window.__mouse_visual_overlay.remove();
                delete window.__mouse_visual_overlay;
            }
            if (window.__mouse_visual_canvas) {
                window.__mouse_visual_canvas.remove();
                delete window.__mouse_visual_canvas;
            }
            if (window.__mouse_visual_resize_handler) {
                window.removeEventListener('resize', window.__mouse_visual_resize_handler);
                delete window.__mouse_visual_resize_handler;
            }
            if (window.__mouse_visual_click_handler) {
                window.removeEventListener('click', window.__mouse_visual_click_handler);
                delete window.__mouse_visual_click_handler;
            }
            delete window.__mouse_visual_ctx;
        } catch (e) {
            // ignore
        }
    });
}

async function updateMovementVisual(page, x, y) {
    await page.evaluate(([x, y]) => {
        const ov = window.__mouse_visual_overlay;
        if (ov) {
            ov.style.left = `${x}px`;
            ov.style.top = `${y}px`;
        }
        const ctx = window.__mouse_visual_ctx;
        if (ctx) {
            ctx.fillStyle = 'rgba(255,0,0,0.6)';
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, 2 * Math.PI);
            ctx.fill();
        }
    }, [x, y]);
}

async function enableMovementVisual(page) {
    await page.evaluate(() => {
        if (window.__mouse_visual_overlay) return;

        const ov = document.createElement('div');
        ov.id = '__mouse_visual_overlay';
        ov.style.position = 'fixed';
        ov.style.zIndex = 2147483647;
        ov.style.pointerEvents = 'none';
        ov.style.width = '12px';
        ov.style.height = '12px';
        ov.style.background = 'rgba(255,0,0,0.9)';
        ov.style.borderRadius = '50%';
        ov.style.transform = 'translate(-50%,-50%)';
        ov.style.left = '0px';
        ov.style.top = '0px';
        document.body.appendChild(ov);

        const canvas = document.createElement('canvas');
        canvas.id = '__mouse_visual_canvas';
        canvas.style.position = 'fixed';
        canvas.style.zIndex = 2147483646;
        canvas.style.left = '0';
        canvas.style.top = '0';
        canvas.style.pointerEvents = 'none';
        canvas.width = innerWidth;
        canvas.height = innerHeight;
        document.body.appendChild(canvas);

        window.__mouse_visual_overlay = ov;
        window.__mouse_visual_canvas = canvas;
        window.__mouse_visual_ctx = canvas.getContext('2d');

        if (!window.__mouse_visual_resize_handler) {
            window.__mouse_visual_resize_handler = () => {
                const c = window.__mouse_visual_canvas;
                if (c) {
                    c.width = innerWidth;
                    c.height = innerHeight;
                }
            };
            window.addEventListener('resize', window.__mouse_visual_resize_handler);
        }
    });
}

// show a click visual (ripple) at x,y; returns after animation completes
async function showClickVisual(page, x, y) {
    // ensure any pointer overlays are removed first
    await disablePointerVisual(page);

    await page.evaluate(([cx, cy]) => {
        return new Promise((resolve) => {
            const el = document.createElement('div');
            el.style.position = 'fixed';
            el.style.left = `${cx}px`;
            el.style.top = `${cy}px`;
            el.style.transform = 'translate(-50%,-50%)';
            el.style.pointerEvents = 'none';
            el.style.borderRadius = '50%';
            el.style.width = '1px';
            el.style.height = '1px';
            el.style.boxSizing = 'border-box';
            el.style.border = '4px solid rgba(0, 247, 255, 1)';
            el.style.zIndex = 2147483647;
            document.body.appendChild(el);

            const anim = el.animate([
                { transform: 'translate(-50%,-50%) scale(0)', opacity: 1 },
                { transform: 'translate(-50%,-50%) scale(4)', opacity: 0.3 }
            ], {
                duration: 550,
                easing: 'cubic-bezier(.2,.8,.2,1)'
            });

            anim.onfinish = () => {
                el.remove();
                resolve();
            };
        });
    }, [x, y]);
}

module.exports = {
    disablePointerVisual,
    enableMovementVisual,
    updateMovementVisual,
    showClickVisual
};