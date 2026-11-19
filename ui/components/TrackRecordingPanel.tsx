import { useRef } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  Mic2,
  Volume2,
  Trash2,
} from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import type { Track } from "../models";
import { desktop as api } from "../services/desktop";
import { LevelSlider } from "./LevelSlider";
import { TrackEffect } from "./TrackEffects";
import { TrackAppearance } from "./TrackAppearance";
export function TrackRecordingPanel({
  controller,
  track,
}: {
  controller: WorkspaceController;
  track: Track;
}) {
  const { s, update, openSetup, busy, task } = controller;
  const panGesture = useRef<{ id: string; released: boolean } | undefined>(
    undefined,
  );
  return (
    <div className="recording-controls">
      <div className="input-block">
        <h3>Track</h3>
        <div className="track-identity">
          <TrackAppearance track={track} update={update} />
          <input
            aria-label="Track name"
            value={track.name}
            onChange={(e) => update(track, { name: e.target.value })}
          />
        </div>
        <div className="track-file-actions">
          <button
            className="text-button"
            disabled={s.recording || busy}
            onClick={() => task(() => api.importAudio(track.id))}
          >
            <ArrowDownToLine size={12} />
            {track.kind === "midi" ? "Import MIDI" : "Import audio"}
          </button>
          <button
            className="text-button"
            disabled={s.playing || busy}
            onClick={async () => {
              if (
                await controller.confirmAction(
                  `Delete ${track.name} from this session? Recorded audio files will be kept.`,
                  "Delete track",
                )
              )
                void controller.removeTrack(track);
            }}
          >
            <Trash2 size={12} />
            Delete track
          </button>
        </div>
      </div>
      <div className="input-block">
        <h3>Input</h3>
        <button className="input-selector" onClick={openSetup}>
          <Mic2 size={15} />
          {track.kind === "midi"
            ? "MIDI device & channel"
            : `Input ${track.input + 1}`}
          <ChevronDown size={14} />
        </button>
        {track.kind === "audio" && (
          <button
            className="monitor-control"
            aria-label="Monitor track"
            aria-pressed={track.monitor}
            disabled={busy}
            onClick={() => update(track, { monitor: !track.monitor })}
          >
            <Volume2 size={13} /> Monitor
            <span>{track.monitor ? "On" : "Off"}</span>
          </button>
        )}
      </div>
      <div className="input-block level-block">
        <h3>Level & pan</h3>
        <div className="recording-volume">
          <span>
            Volume{" "}
            <output>
              {track.gain === 0
                ? "\u2212\u221e"
                : (20 * Math.log10(track.gain)).toFixed(1)}{" "}
              dB
            </output>
          </span>
          <LevelSlider
            label="Track volume"
            value={track.gain}
            max={1.5}
            peak={track.peak}
            onChange={(gain, historyGroup) =>
              update(track, { gain, historyGroup })
            }
          />
        </div>
        <div className="pan-row">
          <span>L</span>
          <input
            aria-label="Track pan"
            title="Pan - double-click to center"
            onDoubleClick={() => update(track, { pan: 0 })}
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={track.pan}
            onPointerDown={() => {
              panGesture.current = {
                id: crypto.randomUUID(),
                released: false,
              };
            }}
            onPointerUp={() => {
              if (panGesture.current) panGesture.current.released = true;
            }}
            onPointerCancel={() => {
              panGesture.current = undefined;
            }}
            onBlur={() => {
              panGesture.current = undefined;
            }}
            onKeyDown={(e) => {
              if (e.key === "0") {
                e.preventDefault();
                update(track, { pan: 0 });
              }
              if (panGesture.current?.released) panGesture.current = undefined;
            }}
            onChange={(e) => {
              const current = panGesture.current;
              update(track, {
                pan: +e.target.value,
                historyGroup: current?.id,
              });
            }}
          />
          <span>R</span>
        </div>
      </div>
      {track.kind === "audio" && (
        <TrackEffect
          key={`${track.id}-gate`}
          effect="gate"
          track={track}
          update={update}
        />
      )}
    </div>
  );
}
