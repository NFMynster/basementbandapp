import type { Live } from "../models";

/**
 * Draws every level meter with peak-meter ballistics from one shared frame
 * loop: a meter jumps up to a new peak and falls back at FALL_DB_PER_SECOND.
 *
 * Levels come from each live frame (`setMeterLevels`, called by the live
 * store), without a React render; the fall is drawn at up to METER_FPS in
 * between. Only a composited
 * `transform` changes, so the browser never repaints, the loop stops once
 * every meter has settled, and changes too small to see never wake it.
 */

/** Smooth enough for the fall; the display refresh rate is not needed. */
const METER_FPS = 100;
/** Release speed, a common DAW peak-meter default. */
const FALL_DB_PER_SECOND = 20;
/** Below -60 dB the meter reads empty. */
const FLOOR = 0.001;
/** Level changes below this (a fraction of the meter) are not drawn. */
const VISIBLE_STEP = 0.002;

type Meter = {
  /** "master" or a track id. */
  source: string;
  /** Inactive meters read empty (a track header meters only while armed). */
  active: boolean;
  /** The newest level for this meter. */
  target: number;
  /** The level the ballistics have reached. */
  shown: number;
  /** The level last written to the cover. */
  written: number;
};

const meters = new Map<HTMLElement, Meter>();
/** The newest peaks by source: "master" and each track id. */
let latest = new Map<string, number>();
let frame = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastDraw = 0;
let lastTick = 0;

function levelFor(meter: Pick<Meter, "source" | "active">) {
  if (!meter.active) return 0;
  return Math.min(1, Math.max(0, latest.get(meter.source) || 0));
}

function draw(cover: HTMLElement, meter: Meter, level: number) {
  // The cover hides the unlit part of the gradient: slide it right by the level.
  cover.style.transform = `translateX(${(level * 100).toFixed(2)}%)`;
  meter.written = level;
}

/** Requests the next capped frame: a timer waits out the frame interval, then
 * one animation frame aligns the draw to the display. Every requested frame
 * draws, so the browser never produces frames in between. */
function schedule() {
  if (frame || timer) return;
  const now = performance.now();
  // Waking from idle: the fall starts from now, not from the last frame.
  if (now - lastTick > 100) lastTick = now;
  // Pacing uses the clock, not animation-frame timestamps, which can lag the
  // timer and would cost an extra frame. The animation frame lands at the
  // next refresh, so the timer fires a little early.
  const wait = lastDraw + 1000 / METER_FPS - now - 2;
  if (wait > 1) {
    timer = setTimeout(() => {
      timer = undefined;
      frame = requestAnimationFrame(tick);
    }, wait);
  } else frame = requestAnimationFrame(tick);
}

function tick() {
  frame = 0;
  const now = performance.now();
  const elapsed = Math.min(100, Math.max(0, now - lastTick));
  lastTick = lastDraw = now;
  const fall = 10 ** ((-FALL_DB_PER_SECOND * elapsed) / 1000 / 20);
  let falling = false;
  for (const [cover, meter] of meters) {
    let settled = true;
    if (meter.target >= meter.shown) meter.shown = meter.target;
    else {
      meter.shown *= fall;
      settled = meter.shown <= meter.target || meter.shown < FLOOR;
      if (settled) meter.shown = meter.target;
      else falling = true;
    }
    if (
      Math.abs(meter.shown - meter.written) >= VISIBLE_STEP ||
      (settled && meter.shown !== meter.written)
    )
      draw(cover, meter, meter.shown);
  }
  if (falling) schedule();
}

function retarget(meter: Meter) {
  const target = levelFor(meter);
  if (Math.abs(target - meter.target) < VISIBLE_STEP && target !== 0) return;
  if (target === meter.target) return;
  meter.target = target;
  schedule();
}

/** Applies the peaks of a live frame to every meter. */
export function setMeterLevels(live: Live) {
  latest = new Map(
    Object.entries(live.tracks).map(([id, track]) => [id, track.peak]),
  );
  latest.set("master", live.masterPeak);
  for (const meter of meters.values()) retarget(meter);
}

/** Shows `source` ("master" or a track id) on `cover`; call again when
 * `active` changes. The first call draws the current level at once. */
export function setMeterSource(
  cover: HTMLElement,
  source: string,
  active: boolean,
) {
  const meter = meters.get(cover);
  if (!meter) {
    const level = levelFor({ source, active });
    const created = {
      source,
      active,
      target: level,
      shown: level,
      written: -1,
    };
    meters.set(cover, created);
    draw(cover, created, level);
    return;
  }
  meter.source = source;
  meter.active = active;
  retarget(meter);
}

export function removeMeter(cover: HTMLElement) {
  meters.delete(cover);
  if (meters.size) return;
  cancelAnimationFrame(frame);
  clearTimeout(timer);
  frame = 0;
  timer = undefined;
}
