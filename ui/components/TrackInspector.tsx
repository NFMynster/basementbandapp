import { useEffect, useRef } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  Headphones,
  Mic2,
  Plus,
  Power,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { desktop as api } from "../services/desktop";
import { TrackIcon, trackIcons } from "./TrackIcon";
export function TrackInspector({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => {
    if (controller.propertiesPing)
      inspector.current?.focus({ preventScroll: true });
  }, [controller.propertiesPing]);
  const { track, panel, setPanel, s, update, run, openSetup, busy, task } =
    controller;
  return (
    <>
      <section
        ref={inspector}
        onDragOver={(e) => {
          if (panel === "plugins") e.preventDefault();
        }}
        onDrop={(e) => {
          if (panel === "plugins" && track) {
            e.preventDefault();
            task(() =>
              api.dropFiles(Array.from(e.dataTransfer.files), track.id, true),
            );
          }
        }}
        className="inspector"
        tabIndex={-1}
        aria-label={`${track?.name || "Track"} properties`}
      >
        {controller.propertiesPing > 0 && (
          <span
            key={controller.propertiesPing}
            className="properties-ping"
            aria-hidden="true"
          />
        )}
        <div className="inspector-toolbar">
          <div className="selected-track">
            <span style={{ background: track?.color }} />
            {track?.name || "Track controls"}
          </div>
          <div className="tabs">
            <button
              className={panel === "input" ? "tab active" : "tab"}
              onClick={() => setPanel("input")}
            >
              <Mic2 size={14} />
              Recording
            </button>
            <button
              className={panel === "plugins" ? "tab active" : "tab"}
              onClick={() => setPanel("plugins")}
            >
              <SlidersHorizontal size={14} />
              Plug-ins
            </button>
          </div>
          <span className="inspector-hint">Your sound. Your session.</span>
        </div>
        {track && (
          <div className="inspector-content">
            {panel === "input" ? (
              <>
                <div className="input-block">
                  <label>TRACK NAME</label>
                  <input
                    aria-label="Track name"
                    value={track.name}
                    onChange={(e) => update(track, { name: e.target.value })}
                  />
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
                      disabled={s.playing}
                      onClick={() => {
                        if (confirm(`Remove ${track.name} from this session?`))
                          run({ op: "removeTrack", track: track.id });
                      }}
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
                  </div>
                  <div className="icon-choices" aria-label="Track icon">
                    <input
                      type="color"
                      aria-label="Track color"
                      value={track.color}
                      onChange={(e) => update(track, { color: e.target.value })}
                    />
                    {Object.keys(trackIcons).map((icon) => (
                      <button
                        key={icon}
                        aria-label={`${icon} icon`}
                        aria-pressed={track.icon === icon}
                        onClick={() => update(track, { icon })}
                      >
                        <TrackIcon icon={icon} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="input-block">
                  <label>
                    {track.kind === "midi" ? "MIDI INPUT" : "AUDIO INPUT"}
                  </label>
                  <button className="input-selector" onClick={openSetup}>
                    <Mic2 size={15} />
                    {track.kind === "midi"
                      ? "MIDI device & channel"
                      : `Input ${track.input + 1}`}
                    <ChevronDown size={14} />
                  </button>
                  <span className="subtle">
                    {track.kind === "midi"
                      ? "Mark track to hear your instrument"
                      : "Mono · one instrument per track"}
                  </span>
                </div>
                <div className="input-block level-block">
                  <label>LEVEL & PAN</label>
                  <div className="pan-row">
                    <span>L</span>
                    <input
                      aria-label="Track pan"
                      type="range"
                      min="-1"
                      max="1"
                      step="0.01"
                      value={track.pan}
                      onChange={(e) => update(track, { pan: +e.target.value })}
                    />
                    <span>R</span>
                    <span className="gain-value">
                      {track.gain === 0
                        ? "−∞"
                        : (20 * Math.log10(track.gain)).toFixed(1)}{" "}
                      dB
                    </span>
                  </div>
                  <div className="level-meter">
                    <i
                      style={{ width: `${Math.min(100, track.peak * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="record-tip">
                  <span className="tip-icon">
                    <Headphones size={21} />
                  </span>
                  <div>
                    <strong>
                      {track.kind === "midi"
                        ? "Your pads. Your instrument."
                        : "Hear yourself without the delay."}
                    </strong>
                    <p>
                      {track.kind === "midi"
                        ? "Choose a MIDI input and load a VST3 instrument."
                        : "Use direct monitoring on your audio interface."}
                      <br />
                      {track.kind === "midi"
                        ? "Mark this track to play and record MIDI."
                        : "Audio recording uses device-latency correction."}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="plugin-intro">
                  <span className="eyebrow">BRING YOUR OWN SOUND</span>
                  <h3>
                    {track.kind === "midi"
                      ? "Your drum kit. Your keys."
                      : "Your favorite amp. Right here."}
                  </h3>
                  <p>
                    {track.kind === "midi"
                      ? "Load an installed VST3 instrument to turn MIDI into sound."
                      : "Load an installed VST3 effect for this track’s playback."}
                  </p>
                </div>
                <div className="plugin-slot">
                  {track.pluginName ? (
                    <>
                      <button
                        title="Bypass plugin"
                        className={track.bypass ? "" : "on"}
                        onClick={() =>
                          run({
                            op: "bypass",
                            track: track.id,
                            value: !track.bypass,
                          })
                        }
                      >
                        <Power size={18} />
                      </button>
                      <div>
                        <strong>{track.pluginName}</strong>
                        <small>
                          {track.bypass
                            ? "Bypassed"
                            : track.kind === "midi"
                              ? "MIDI instrument · live & playback"
                              : "Stereo effect · playback"}
                        </small>
                      </div>
                      <button
                        onClick={() =>
                          run({ op: "editor", track: track.id }, false)
                        }
                      >
                        Open editor
                      </button>
                      <button
                        title="Replace plugin"
                        disabled={s.playing || busy}
                        onClick={() => task(() => api.plugin(track.id))}
                      >
                        Replace
                      </button>
                      <button
                        title="Remove plugin"
                        disabled={s.playing || busy}
                        onClick={() =>
                          run({ op: "removePlugin", track: track.id })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={s.playing || busy}
                      onClick={() => task(() => api.plugin(track.id))}
                    >
                      <Plus size={20} />
                      <span>
                        {track.kind === "midi"
                          ? "Add VST3 instrument"
                          : "Add VST3 plug-in"}
                        <small>Choose or drop a .vst3 file or bundle</small>
                      </span>
                    </button>
                  )}
                </div>
                <p className="plugin-note">
                  <button
                    className="text-button"
                    disabled={s.playing || busy}
                    onClick={() => task(() => api.plugin(track.id, true))}
                  >
                    Choose a bundle folder…
                  </button>
                  {track.kind === "midi"
                    ? "One instrument per MIDI track. No sounds bundled."
                    : "One effect per audio track in this iteration."}
                  <br />
                  Stop playback before loading a plug-in.
                </p>
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}
