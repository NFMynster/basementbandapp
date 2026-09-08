import { LevelSlider } from "./LevelSlider";
import { useState } from "react";
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
  const commitTempo = () => {
    if (tempoDraft === null) return;
    const value = Number(tempoDraft);
    if (
      tempoDraft.trim() &&
      Number.isFinite(value) &&
      value >= 40 &&
      value <= 240
    )
      void run({ op: "tempo", value }).finally(() =>
        setTempoDraft((current) => (current === tempoDraft ? null : current)),
      );
    else setTempoDraft(null);
  };
  return (
    <>
      <section className="transport">
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
          <button
            className={"icon-button " + (s.metronome ? "loop-active" : "")}
            title={`Metronome · ${keyLabel(controller.bindings.metronome)}`}
            aria-pressed={!!s.metronome}
            onClick={() => run({ op: "metronome", value: !s.metronome })}
          >
            <Timer size={22} />
          </button>
          <button
            className={
              "icon-button count-in-button " + (s.countIn ? "loop-active" : "")
            }
            title="Count-in · 3 beats before recording"
            aria-pressed={!!s.countIn}
            disabled={s.recording}
            onClick={() => run({ op: "countIn", value: !s.countIn })}
          >
            123
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
            onChange={(value) => run({ op: "master", value })}
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
