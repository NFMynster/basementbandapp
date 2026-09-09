import { TrackEffect } from "./TrackEffects";
import { useEffect, useRef } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  ChartNoAxesColumn,
  Piano,
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
import { ClipSound } from "./ClipSound";
import { PanelResize } from "./PanelResize";
import { TrackEqualizer } from "./TrackEqualizer";
import { MidiEditor } from "./MidiEditor";
import { TrackAppearance } from "./TrackAppearance";
export function TrackInspector({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const inspector = useRef<HTMLElement>(null);
  const effectDrag = useRef<string | null>(null);
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
        style={{ height: controller.inspectorHeight }}
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
        className={`inspector ${panel === "notes" ? "with-notes" : ""}`}
        tabIndex={-1}
        aria-label={`${track?.name || "Track"} properties`}
      >
        <PanelResize
          axis="vertical"
          label="Properties panel height"
          value={controller.inspectorHeight}
          min={200}
          max={controller.inspectorMax}
          reset={300}
          onChange={controller.setInspectorHeight}
        />
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
            <button
              className={panel === "eq" ? "tab active" : "tab"}
              onClick={() => setPanel("eq")}
            >
              <ChartNoAxesColumn size={14} />
              EQ & Effects
            </button>
            {track?.clips.some(
              (c) => c.id === controller.clipId && c.kind === "audio",
            ) && (
              <button
                className={panel === "region" ? "tab active" : "tab"}
                onClick={() => setPanel("region")}
              >
                <AudioLines size={14} />
                Region
              </button>
            )}
            {track?.kind === "midi" && (
              <button
                className={panel === "notes" ? "tab active" : "tab"}
                onClick={() => setPanel("notes")}
              >
                <Piano size={14} />
                Notes
              </button>
            )}
          </div>
          <span className="inspector-hint">Your sound. Your session.</span>
        </div>
        {track && (
          <div className="inspector-content">
            {panel === "region" ? (
              <ClipSound controller={controller} />
            ) : panel === "eq" ? (
              <div className="track-sound-panel">
                <TrackEqualizer track={track} update={update} />
                <div className="track-built-ins">
                  <TrackEffect
                    key={`${track.id}-compressor`}
                    effect="compressor"
                    track={track}
                    update={update}
                  />
                  <TrackEffect
                    key={`${track.id}-reverb`}
                    effect="reverb"
                    track={track}
                    update={update}
                  />
                </div>
              </div>
            ) : panel === "notes" ? (
              <MidiEditor
                key={`${track.id}:${controller.clipId}`}
                controller={controller}
              />
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
                      onClick={async () => {
                        if (
                          await controller.confirmAction(
                            `Remove ${track.name} from this session?`,
                            "Remove track",
                          )
                        )
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
                        if (panGesture.current)
                          panGesture.current.released = true;
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
                {track.kind === "audio" && (
                  <TrackEffect
                    key={`${track.id}-gate`}
                    effect="gate"
                    track={track}
                    update={update}
                  />
                )}
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
                  <button
                    disabled={s.playing || busy}
                    onClick={() =>
                      controller.setSoundBrowser({
                        track: track.id,
                        presets: true,
                      })
                    }
                  >
                    Track presets
                  </button>
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
                  <div
                    className="plugin-chain"
                    aria-label="Plug-ins in processing order"
                  >
                    <div
                      className="plugin-slot"
                      draggable={
                        track.kind === "audio" &&
                        !!track.pluginName &&
                        !s.playing &&
                        !busy
                      }
                      onDragStart={(e) => {
                        effectDrag.current = "primary";
                        e.dataTransfer.setData("text/plain", "primary");
                      }}
                      onDragEnd={() => {
                        effectDrag.current = null;
                      }}
                      onDragOver={(e) => {
                        if (track.kind === "audio" && effectDrag.current) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      onDrop={(e) => {
                        if (
                          track.kind !== "audio" ||
                          !effectDrag.current ||
                          effectDrag.current === "primary"
                        )
                          return;
                        e.preventDefault();
                        e.stopPropagation();
                        void run({
                          op: "reorderEffect",
                          track: track.id,
                          effect: effectDrag.current,
                          index: -1,
                        });
                        effectDrag.current = null;
                      }}
                    >
                      {track.pluginName ? (
                        <>
                          {track.kind === "audio" &&
                            !!track.effects?.length && (
                              <button
                                aria-label="Move first effect later"
                                disabled={s.playing || busy}
                                onClick={() =>
                                  void run({
                                    op: "reorderEffect",
                                    track: track.id,
                                    effect: "primary",
                                    index: 0,
                                  })
                                }
                              >
                                <ArrowRight size={14} />
                              </button>
                            )}
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
                            onClick={() =>
                              controller.setSoundBrowser({ track: track.id })
                            }
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
                          onClick={() =>
                            controller.setSoundBrowser({ track: track.id })
                          }
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
                    {(track.effects ?? []).map((effect, index) => (
                      <div
                        className="plugin-slot"
                        key={effect.id}
                        draggable={!s.playing && !busy}
                        onDragStart={(e) => {
                          effectDrag.current = effect.id;
                          e.dataTransfer.setData("text/plain", effect.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          effectDrag.current = null;
                        }}
                        onDragOver={(e) => {
                          if (effectDrag.current) {
                            e.preventDefault();
                            e.stopPropagation();
                          }
                        }}
                        onDrop={(e) => {
                          if (!effectDrag.current) return;
                          e.preventDefault();
                          e.stopPropagation();
                          void run({
                            op: "reorderEffect",
                            track: track.id,
                            effect: effectDrag.current,
                            index,
                          });
                          effectDrag.current = null;
                        }}
                      >
                        <button
                          aria-label={`Move ${effect.name} earlier`}
                          disabled={
                            s.playing ||
                            busy ||
                            (track.kind === "midi" && index === 0)
                          }
                          onClick={() =>
                            void run({
                              op: "reorderEffect",
                              track: track.id,
                              effect: effect.id,
                              index: index - 1,
                            })
                          }
                        >
                          <ArrowLeft size={14} />
                        </button>
                        <button
                          aria-label={`Move ${effect.name} later`}
                          disabled={
                            s.playing ||
                            busy ||
                            index === (track.effects?.length ?? 0) - 1
                          }
                          onClick={() =>
                            void run({
                              op: "reorderEffect",
                              track: track.id,
                              effect: effect.id,
                              index: index + 1,
                            })
                          }
                        >
                          <ArrowRight size={14} />
                        </button>
                        <button
                          title={`Bypass ${effect.name}`}
                          aria-pressed={!effect.bypass}
                          className={effect.bypass ? "" : "on"}
                          disabled={s.playing || busy}
                          onClick={() =>
                            run({
                              op: "bypass",
                              track: track.id,
                              effect: effect.id,
                              value: !effect.bypass,
                            })
                          }
                        >
                          <Power size={18} />
                        </button>
                        <div>
                          <strong>
                            {index + 1}. {effect.name}
                          </strong>
                          <small>
                            {effect.bypass ? "Bypassed" : "Stereo effect"}
                          </small>
                        </div>
                        <button
                          onClick={() =>
                            run(
                              {
                                op: "editor",
                                track: track.id,
                                effect: effect.id,
                              },
                              false,
                            )
                          }
                        >
                          Open editor
                        </button>
                        <button
                          title={`Remove ${effect.name}`}
                          disabled={s.playing || busy}
                          onClick={() =>
                            run({
                              op: "removePlugin",
                              track: track.id,
                              effect: effect.id,
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    {track.pluginName && (
                      <button
                        disabled={
                          s.playing ||
                          busy ||
                          (track.effects?.length ?? 0) >= 16
                        }
                        onClick={() =>
                          controller.setSoundBrowser({
                            track: track.id,
                            append: true,
                          })
                        }
                      >
                        <Plus size={16} /> Add VST3 effect
                      </button>
                    )}
                  </div>
                  <p className="plugin-note">
                    {track.kind === "midi"
                      ? "Instrument first, then effects from left to right."
                      : "Effects process from left to right."}{" "}
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
