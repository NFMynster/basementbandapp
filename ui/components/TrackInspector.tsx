import { TrackEffect } from "./TrackEffects";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Maximize2,
  Minimize2,
  AudioLines,
  ChartNoAxesColumn,
  Piano,
  Mic2,
  SlidersHorizontal,
} from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { desktop as api } from "../services/desktop";
import { ClipSound } from "./ClipSound";
import { PanelResize } from "./PanelResize";
import { TrackEqualizer } from "./TrackEqualizer";
import { MidiEditor } from "./MidiEditor";
import { TrackRecordingPanel } from "./TrackRecordingPanel";
import { TrackPluginsPanel } from "./TrackPluginsPanel";
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
  const { track, panel, setPanel, update, task } = controller;
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);
  const midiExpanded = expandedPanel === "notes" && panel === "notes";
  const eqExpanded = expandedPanel === "eq" && panel === "eq";
  const workspaceToggle = useRef<HTMLButtonElement>(null);
  const expansionAnimation = useRef<Animation | null>(null);
  function toggleExpanded(open: boolean) {
    const element = inspector.current;
    expansionAnimation.current?.cancel();
    const previousTop = element?.getBoundingClientRect().top ?? 0;
    flushSync(() => setExpandedPanel(open ? panel : null));
    if (
      element &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const offset = previousTop - element.getBoundingClientRect().top;
      expansionAnimation.current = element.animate(
        [
          { transform: `translateY(${offset}px)`, opacity: 0.8 },
          { transform: "translateY(0)", opacity: 1 },
        ],
        { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
    if (open) element?.focus({ preventScroll: true });
    else workspaceToggle.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    setExpandedPanel(null);
    expansionAnimation.current?.cancel();
  }, [panel]);
  useEffect(() => () => expansionAnimation.current?.cancel(), []);
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
        className={`inspector ${panel === "notes" ? "with-notes" : ""} ${panel === "notes" && midiExpanded ? "midi-expanded" : ""} ${panel === "eq" && eqExpanded ? "eq-expanded" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape" && (eqExpanded || midiExpanded)) {
            e.stopPropagation();
            toggleExpanded(false);
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
          </div>
          {(panel === "eq" || panel === "notes") && (
            <button
              ref={workspaceToggle}
              className="editor-workspace-toggle"
              aria-label={
                eqExpanded || midiExpanded
                  ? "Restore editor"
                  : panel === "eq"
                    ? "Expand equalizer"
                    : "Maximize MIDI editor"
              }
              aria-expanded={eqExpanded || midiExpanded}
              title={
                eqExpanded || midiExpanded
                  ? "Return to arrangement (Esc)"
                  : "Expand editor"
              }
              onClick={() => toggleExpanded(!(eqExpanded || midiExpanded))}
            >
              {eqExpanded || midiExpanded ? (
                <Minimize2 size={14} />
              ) : (
                <Maximize2 size={14} />
              )}
              {eqExpanded || midiExpanded
                ? "Done"
                : panel === "eq"
                  ? "Edit EQ"
                  : "Edit MIDI"}
            </button>
          )}
        </div>
        {track && (
          <div key={panel} className={`inspector-content inspector-${panel}`}>
            {panel === "region" ? (
              <ClipSound controller={controller} />
            ) : panel === "eq" ? (
              <div className="track-sound-panel">
                <TrackEqualizer
                  track={track}
                  update={update}
                  sampleRate={controller.s.sampleRate}
                  expanded={eqExpanded}
                  onExpand={() => toggleExpanded(true)}
                />
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
              <TrackRecordingPanel controller={controller} track={track} />
            ) : (
              <TrackPluginsPanel controller={controller} track={track} />
            )}
          </div>
        )}
      </section>
    </>
  );
}
