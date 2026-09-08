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
import { TrackAppearance } from "./TrackAppearance";
import { ExportSettings } from "./ExportSettings";
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
  const panGesture = useRef<{ id: string; released: boolean } | undefined>(
    undefined,
  );
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
              className={panel === "export" ? "tab active" : "tab"}
              onClick={() => setPanel("export")}
            >
              Export
            </button>
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
            {panel === "export" ? (
              <ExportSettings controller={controller} />
            ) : panel === "input" ? (
              <>
                <div className="input-block">
                  <label>TRACK NAME</label>
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
                      disabled={s.playing}
                      onClick={() => {
                        if (confirm(`Remove ${track.name} from this session?`))
                          void controller.removeTrack(track);
                      }}
                    >
                      <Trash2 size={12} />
                      Remove
                    </button>
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
                      ? "Enable monitoring to hear your instrument"
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
                      onPointerDown={() => {
                        panGesture.current = {
                          id: crypto.randomUUID(),
                          released: false,
                        };
                      }}
                      onPointerUp={() => {
                        if (panGesture.current)
                          panGesture.current.released = true;
                      }}
                      onPointerCancel={() => {
                        panGesture.current = undefined;
                      }}
                      onBlur={() => {
                        panGesture.current = undefined;
                      }}
                      onKeyDown={() => {
                        if (panGesture.current?.released)
                          panGesture.current = undefined;
                      }}
                      onChange={(e) => {
                        const current = panGesture.current;
                        update(track, {
                          pan: +e.target.value,
                          historyGroup: current?.id,
                        });
                        if (current?.released) panGesture.current = undefined;
                      }}
                    />
                    <span>R</span>
                    <span className="gain-value">
                      {track.gain === 0
                        ? "−∞"
                        : (20 * Math.log10(track.gain)).toFixed(1)}{" "}
                      dB
                    </span>
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
                        ? "Load a VST3 instrument. MIDI hardware is optional."
                        : "Use direct monitoring on your audio interface."}
                      <br />
                      {track.kind === "midi"
                        ? "Monitor to audition; mark to record incoming MIDI."
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
                <div className="plugin-details">
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
                    {track.kind === "midi"
                      ? "One instrument per MIDI track. No sounds bundled."
                      : "One effect per audio track in this iteration."}
                    <br />
                    Stop playback before loading a plug-in.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}
