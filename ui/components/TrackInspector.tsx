import { LevelSlider } from "./LevelSlider";
import { TrackEffect } from "./TrackEffects";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Maximize2,
  Minimize2,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  ChartNoAxesColumn,
  Piano,
  ChevronDown,
  Mic2,
  Volume2,
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
  const [midiExpanded, setMidiExpanded] = useState(false);
  useEffect(() => {
    if (panel !== "notes") setMidiExpanded(false);
  }, [panel]);
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
        className={`inspector ${panel === "notes" ? "with-notes" : ""} ${panel === "notes" && midiExpanded ? "midi-expanded" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape" && midiExpanded) {
            e.stopPropagation();
            setMidiExpanded(false);
          }
        }}
        tabIndex={-1}
        aria-label={`${track?.name || "Track"} properties`}
      >
        <PanelResize
          axis="vertical"
          label="Properties panel height"
          value={controller.inspectorHeight}
          min={200}
          max={controller.inspectorMax}
          reset={380}
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
              (c) =>
                c.id === controller.clipId &&
                (c.kind === "audio" || !!c.takeGroup),
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
                MIDI
              </button>
            )}
            {panel === "notes" && (
              <button
                aria-label={
                  midiExpanded ? "Restore MIDI editor" : "Maximize MIDI editor"
                }
                title={
                  midiExpanded ? "Restore editor (Esc)" : "Maximize editor"
                }
                aria-pressed={midiExpanded}
                onClick={() => setMidiExpanded((v) => !v)}
              >
                {midiExpanded ? (
                  <Minimize2 size={14} />
                ) : (
                  <Maximize2 size={14} />
                )}
              </button>
            )}
          </div>
        </div>
        {track && (
          <div key={panel} className={`inspector-content inspector-${panel}`}>
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
                  <h3>Input</h3>
                  <button className="input-selector" onClick={openSetup}>
                    <Mic2 size={15} />
                    {track.kind === "midi"
                      ? "MIDI device & channel"
                      : `Input ${track.input + 1}`}
                    <ChevronDown size={14} />
                  </button>
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
                </div>
                <div className="input-block level-block">
                  <h3>Level & pan</h3>
                  <div className="recording-volume">
                    <span>
                      Volume{" "}
                      <output>
                        {track.gain === 0
                          ? "??"
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
            ) : (
              <div className="plugins-panel">
                <div className="plugin-toolbar">
                  <h3>Plug-ins</h3>
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
                                  ? "Instrument"
                                  : "Effect"}
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
                            <small>
                              Choose from your library or drop a VST3 here
                            </small>
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
                          <small>{effect.bypass ? "Bypassed" : "Effect"}</small>
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
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
