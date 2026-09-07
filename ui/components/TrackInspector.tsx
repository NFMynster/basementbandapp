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
export function TrackInspector({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const { track, panel, setPanel, s, update, run, openSetup, busy, task } =
    controller;
  return (
    <>
      <section className="inspector">
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
                      Import audio
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
                </div>
                <div className="input-block">
                  <label>AUDIO INPUT</label>
                  <button className="input-selector" onClick={openSetup}>
                    <Mic2 size={15} />
                    Input {track.input + 1}
                    <ChevronDown size={14} />
                  </button>
                  <span className="subtle">
                    Mono · one instrument per track
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
                    <strong>Hear yourself without the delay.</strong>
                    <p>
                      Use direct monitoring on your audio interface.
                      <br />
                      This first version records your input dry.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="plugin-intro">
                  <span className="eyebrow">BRING YOUR OWN SOUND</span>
                  <h3>Your favorite amp. Right here.</h3>
                  <p>
                    Load an installed VST3 effect for this track’s playback.
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
                        Add VST3 plug-in
                        <small>Choose an installed .vst3 bundle</small>
                      </span>
                    </button>
                  )}
                </div>
                <p className="plugin-note">
                  One effect per track in this iteration.
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
