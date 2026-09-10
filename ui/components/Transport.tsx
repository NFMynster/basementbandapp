import { LevelSlider } from "./LevelSlider";
import { useEffect, useRef, useState } from "react";
import {
  HelpCircle,
  Timer,
  Repeat2 as Loop,
  Play,
  SkipBack,
  SlidersHorizontal,
  Square,
  Volume2,
} from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { keyLabel } from "../hooks/useShortcuts";
export function Transport({ controller }: { controller: WorkspaceController }) {
  const { s, run, busy, bar, beat, openSetup, showHelp, setHelp } = controller;
  const [tempoDraft, setTempoDraft] = useState<string | null>(null);
  const [clickVolumeOpen, setClickVolumeOpen] = useState(false);
  const clickVolume = useRef<HTMLDivElement>(null);
  const volumeGesture = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!clickVolumeOpen) return;
    clickVolume.current?.querySelector("input")?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!clickVolume.current?.contains(event.target as Node))
        setClickVolumeOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [clickVolumeOpen]);
  const commitTempo = () => {
    if (tempoDraft === null) return;
    const value = Number(tempoDraft);
    if (
      tempoDraft.trim() &&
      Number.isFinite(value) &&
      value >= 40 &&
      value <= 240
    )
      void controller.requestTempo(value);
    setTempoDraft(null);
  };
  return (
    <>
      <section
        className={`transport ${clickVolumeOpen ? "metronome-open" : ""}`}
      >
        <div className="transport-left">
          <button
            className="icon-button"
            title="Input settings"
            onClick={openSetup}
          >
            <SlidersHorizontal size={20} />
          </button>
          <span className="divider" />
          <button
            className="icon-button"
            title={`Back to start · ${keyLabel(controller.bindings.start)}`}
            disabled={s.recording}
            onClick={() => run({ op: "seek", position: 0 }, false)}
          >
            <SkipBack size={22} />
          </button>
          <button
            className="icon-button"
            title={
              s.playing
                ? `Stop · ${keyLabel(controller.bindings.play)}`
                : "Stop"
            }
            onClick={() => run({ op: "stop" }, s.recording)}
          >
            <Square size={18} fill="currentColor" />
          </button>
          <button
            className={"play-button " + (s.playing ? "active" : "")}
            title={`${s.playing ? "Stop" : "Play"} · ${keyLabel(controller.bindings.play)}`}
            onClick={() => run({ op: s.playing ? "stop" : "play" }, false)}
          >
            <Play size={21} fill="currentColor" />
          </button>
          <button
            className={"record-button " + (s.recording ? "recording" : "")}
            title={`${s.recording ? "Stop recording" : "Record marked tracks"} · ${keyLabel(controller.bindings.record)}`}
            disabled={busy}
            onClick={() => run({ op: s.recording ? "stop" : "record" })}
          >
            <span />
          </button>
        </div>
        <div className="lcd">
          <div className="position">
            <strong>
              {String(bar).padStart(3, "0")}
              <span>{beat} 1</span>
            </strong>
            <small>
              BAR <span>BEAT</span>
            </small>
          </div>
          <div className="lcd-tempo">
            <input
              aria-label="Tempo"
              type="number"
              min="40"
              max="240"
              value={tempoDraft ?? s.tempo}
              disabled={s.recording}
              onChange={(e) => setTempoDraft(e.target.value)}
              onBlur={commitTempo}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setTempoDraft(null);
                }
              }}
            />
            <small>TEMPO</small>
          </div>
          <div>
            <strong>4/4</strong>
            <small>TIME</small>
          </div>
        </div>
        <div className="transport-right">
          <button
            className={"icon-button " + (s.looping ? "loop-active" : "")}
            title={`Cycle selection · ${keyLabel(controller.bindings.loop)}`}
            disabled={s.recording}
            onClick={() =>
              run({
                op: "loop",
                start: s.loopStart,
                end: s.loopEnd,
                enabled: !s.looping,
              })
            }
          >
            <Loop size={23} />
          </button>
          <div className="metronome-control" ref={clickVolume}>
            <button
              className={"icon-button " + (s.metronome ? "loop-active" : "")}
              title={`Metronome · ${keyLabel(controller.bindings.metronome)} · Right-click for volume`}
              aria-pressed={!!s.metronome}
              aria-haspopup="dialog"
              aria-expanded={clickVolumeOpen}
              onContextMenu={(e) => {
                e.preventDefault();
                setClickVolumeOpen((v) => !v);
              }}
              onClick={() => run({ op: "metronome", value: !s.metronome })}
            >
              <Timer size={22} />
            </button>
            {clickVolumeOpen && (
              <div
                className="metronome-volume"
                role="dialog"
                aria-label="Metronome volume"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape" || e.key === "Tab")
                    setClickVolumeOpen(false);
                }}
              >
                <Volume2 size={15} aria-hidden="true" />
                <input
                  type="range"
                  aria-label="Metronome volume"
                  aria-orientation="vertical"
                  min={0}
                  max={400}
                  step={5}
                  value={Math.round((s.metronomeGain ?? 1) * 100)}
                  aria-valuetext={`${Math.round((s.metronomeGain ?? 1) * 100)} percent`}
                  onPointerDown={() => {
                    volumeGesture.current = crypto.randomUUID();
                  }}
                  onPointerUp={() => {
                    volumeGesture.current = undefined;
                  }}
                  onBlur={() => {
                    volumeGesture.current = undefined;
                  }}
                  onChange={(e) =>
                    void run({
                      op: "metronomeVolume",
                      value: +e.target.value / 100,
                      historyGroup: volumeGesture.current,
                    })
                  }
                />
                <output>{Math.round((s.metronomeGain ?? 1) * 100)}%</output>
              </div>
            )}
          </div>
          <button
            className={
              "icon-button count-in-button " + (s.countIn ? "loop-active" : "")
            }
            title="Count-in · 4 beats before recording"
            aria-pressed={!!s.countIn}
            disabled={s.recording}
            onClick={() => run({ op: "countIn", value: !s.countIn })}
          >
            1234
          </button>
          <span className="divider" />
          <Volume2 size={18} />
          <LevelSlider
            label="Output volume"
            max={2}
            value={s.masterGain ?? 1}
            peak={
              s.masterPeak ??
              Math.max(...s.tracks.map((t) => t.peak), 0) * (s.masterGain ?? 1)
            }
            onChange={(value, historyGroup) =>
              run({ op: "master", value, historyGroup })
            }
          />
          <button
            className="icon-button"
            title="Quick guide"
            onClick={() => setHelp(!showHelp)}
          >
            <HelpCircle size={19} />
          </button>
        </div>
      </section>
    </>
  );
}
