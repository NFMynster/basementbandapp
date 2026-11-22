import { useSyncExternalStore } from "react";
import type {
  EngineState,
  Live,
  LiveTrack,
  RecordingPreview,
  Session,
} from "../models";
import { setMeterLevels } from "./meterAnimator";

/**
 * The engine's continuously changing values: transport position, meter
 * peaks, audio load, tuner pitch and recording previews. Live frames bring
 * them up to 30 times a second (`watch_engine`), and command replies carry
 * them too. They stay out of React state so the app never re-renders for
 * them:
 *
 * - meters and the playhead draw from here directly;
 * - event handlers read the current value with `getLive()`;
 * - a component that shows a live value subscribes with `useLive`, and its
 *   selector returns a primitive or a stable reference, so it renders only
 *   when what it shows changes (a beat, a rounded number).
 */
let live: Live = {
  position: 0,
  masterPeak: 0,
  audioCpu: 0,
  tunerFrequency: 0,
  tracks: {},
};
const listeners = new Set<() => void>();
/** The engine revision the live values come from: a reply can arrive after
 * a newer frame and must not move the playhead back. */
let liveRevision = 0;

export function getLive() {
  return live;
}

export function subscribeLive(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The selected live value; re-renders only when it changes. */
export function useLive<T>(select: (live: Live) => T): T {
  return useSyncExternalStore(subscribeLive, () => select(live));
}

function publish(next: Live) {
  live = next;
  setMeterLevels(next);
  for (const listener of listeners) listener();
}

/** Shows a seek at once; the engine's reply confirms it. */
export function previewPosition(position: number) {
  publish({ ...live, position });
}

/** Applies a live frame. Recording waveforms arrive incrementally. */
export function acceptLive(next: Live, revision: number) {
  if (revision <= liveRevision) return;
  liveRevision = revision;
  const tracks: Record<string, LiveTrack> = {};
  for (const [id, track] of Object.entries(next.tracks))
    tracks[id] = {
      peak: track.peak,
      recordingPreview: continuePreview(
        live.tracks[id]?.recordingPreview,
        track.recordingPreview,
      ),
    };
  publish({ ...next, tracks });
}

/**
 * Splits a full engine state (a command reply) into the session React keeps
 * and its live values, which go to the store.
 */
export function acceptEngineState(state: EngineState): Session {
  const {
    position,
    masterPeak,
    audioCpu,
    tunerFrequency,
    revision,
    tracks,
    ...session
  } = state;
  const liveTracks: Record<string, LiveTrack> = {};
  const sessionTracks = tracks.map(({ peak, recordingPreview, ...track }) => {
    liveTracks[track.id] = { peak, recordingPreview };
    return track;
  });
  if (revision === undefined || revision > liveRevision) {
    liveRevision = revision ?? liveRevision;
    publish({
      position,
      masterPeak: masterPeak ?? 0,
      audioCpu: audioCpu ?? 0,
      tunerFrequency: tunerFrequency ?? 0,
      tracks: liveTracks,
    });
  }
  return { ...session, tracks: sessionTracks };
}

/**
 * A live frame's audio preview holds only the peaks after `from`; the ones
 * before it were sent earlier. A window that joined mid-take shows silence
 * for the part it missed.
 */
export function continuePreview(
  previous: RecordingPreview | undefined,
  next: RecordingPreview | undefined,
): RecordingPreview | undefined {
  if (next?.kind !== "audio" || next.from === undefined) return next;
  const { from, ...preview } = next;
  const kept = previous?.kind === "audio" ? previous.peaks.slice(0, from) : [];
  while (kept.length < from) kept.push(0);
  return { ...preview, peaks: kept.concat(next.peaks) };
}
