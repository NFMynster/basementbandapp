/**
 * Draws every level meter with peak-meter ballistics from one shared frame
 * loop: a meter jumps up to a new peak at once and falls back at
 * FALL_DB_PER_SECOND.
 *
 * Levels arrive with the engine poll (20 per second). Attacks are drawn the
 * moment they arrive, so they are never delayed or softened; the fall is drawn
 * on every display frame, so the meter moves smoothly between polls.
 * Only a composited `transform` changes, so the browser never repaints, the
 * loop stops once every meter has settled, and changes too small to see never
 * wake it.
 */

/** Release speed, a common DAW peak-meter default. */
const FALL_DB_PER_SECOND = 20;
/** Below -60 dB the meter reads empty. */
const FLOOR = 0.001;
/** Level changes below this (a fraction of the meter) are not drawn. */
const VISIBLE_STEP = 0.002;

type Meter = {
  /** The newest level from the engine. */
  target: number;
  /** The level the ballistics have reached. */
  shown: number;
  /** The level last written to the cover. */
  written: number;
};

const meters = new Map<HTMLElement, Meter>();
let frame = 0;
let lastTick = 0;

function draw(cover: HTMLElement, meter: Meter, level: number) {
  // The cover hides the unlit part of the gradient: slide it right by the level.
  cover.style.transform = `translateX(${(level * 100).toFixed(2)}%)`;
  meter.written = level;
}

function tick(now: number) {
  frame = 0;
  const elapsed = Math.min(100, Math.max(0, now - lastTick));
  lastTick = now;
  const fall = 10 ** ((-FALL_DB_PER_SECOND * elapsed) / 1000 / 20);
  let falling = false;
  for (const [cover, meter] of meters) {
    if (meter.shown <= meter.target) continue;
    meter.shown *= fall;
    const settled = meter.shown <= meter.target || meter.shown < FLOOR;
    if (settled) meter.shown = meter.target;
    else falling = true;
    if (
      Math.abs(meter.shown - meter.written) >= VISIBLE_STEP ||
      (settled && meter.shown !== meter.written)
    )
      draw(cover, meter, meter.shown);
  }
  if (falling) frame = requestAnimationFrame(tick);
}

/** Sets a meter's level (0-1). The first call draws it at once. */
export function setMeterLevel(cover: HTMLElement, level: number) {
  const target = Math.min(1, Math.max(0, level || 0));
  const meter = meters.get(cover);
  if (!meter) {
    const created = { target, shown: target, written: -1 };
    meters.set(cover, created);
    draw(cover, created, target);
    return;
  }
  if (Math.abs(target - meter.target) < VISIBLE_STEP) return;
  meter.target = target;
  if (target >= meter.shown) {
    // Attack: draw the new peak now rather than on the next frame.
    meter.shown = target;
    if (Math.abs(target - meter.written) >= VISIBLE_STEP)
      draw(cover, meter, target);
    return;
  }
  if (!frame) {
    lastTick = performance.now();
    frame = requestAnimationFrame(tick);
  }
}

export function removeMeter(cover: HTMLElement) {
  meters.delete(cover);
  if (meters.size || !frame) return;
  cancelAnimationFrame(frame);
  frame = 0;
}
