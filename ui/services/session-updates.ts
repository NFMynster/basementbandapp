import type { Command, Session } from "../models";

// Immediate previews only; the engine response remains authoritative.
export function optimisticSession(
  s: Session,
  command: Command,
): Session | null {
  switch (command.op) {
    case "loop": {
      const start = Math.max(0, command.start),
        end = Math.max(start + 0.05, command.end);
      return {
        ...s,
        loopStart: start,
        loopEnd: end,
        looping: command.enabled,
      };
    }
    case "limiter":
      return { ...s, limiterEnabled: command.value };
    case "metronome":
      return { ...s, metronome: command.value };
    // Opening the tuner opens the audio input, which restarts the device.
    // Show (or close) the dialog at once instead of after the restart.
    case "tuner":
      return { ...s, tunerTrack: command.track ?? "" };
    case "metronomeSound":
      return { ...s, metronomeSound: command.value };
    case "countIn":
      return { ...s, countIn: command.value };
    case "tempo":
      return { ...s, tempo: Math.max(40, Math.min(240, command.value)) };
    case "master":
      return {
        ...s,
        masterGain: Math.max(0, Math.min(2, command.value)),
      };
    case "rename":
      return { ...s, title: command.title.slice(0, 100) };
    case "bypass":
      if (command.effect) return null;
      return {
        ...s,
        tracks: s.tracks.map((track) =>
          track.id === command.track
            ? { ...track, bypass: command.value }
            : track,
        ),
      };
    case "editClip": {
      if (command.action !== "sound") return null;
      const patch = Object.fromEntries(
        ["gain", "fadeIn", "fadeOut"]
          .filter((key) => command[key as "gain"] !== undefined)
          .map((key) => [key, command[key as "gain"]]),
      );
      return {
        ...s,
        tracks: s.tracks.map((t) =>
          t.id !== command.track
            ? t
            : {
                ...t,
                clips: t.clips.map((c) =>
                  c.id !== command.clip ? c : { ...c, ...patch },
                ),
              },
        ),
      };
    }
    case "track": {
      const { op: ignored, track: trackId, historyGroup, ...patch } = command;
      return {
        ...s,
        tracks: s.tracks.map((track) =>
          track.id === trackId ? { ...track, ...patch } : track,
        ),
      };
    }
    default:
      return null;
  }
}
