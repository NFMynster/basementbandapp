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
            title="Stop"
            onClick={() => run({ op: "stop" }, s.recording)}
          >
            <Square size={18} fill="currentColor" />
          </button>
          <button
            className={"play-button " + (s.playing ? "active" : "")}
            title={`Play / stop · ${keyLabel(controller.bindings.play)}`}
            onClick={() => run({ op: s.playing ? "stop" : "play" }, false)}
          >
            <Play size={21} fill="currentColor" />
          </button>
          <button
            className={"record-button " + (s.recording ? "recording" : "")}
            title={`Record marked tracks · ${keyLabel(controller.bindings.record)}`}
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
              value={s.tempo}
              disabled={s.recording}
              onChange={(e) =>
                run({ op: "tempo", value: Number(e.target.value) })
              }
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
          <div className="master-meter">
            <i
              style={{
                width: `${Math.min(100, Math.max(...s.tracks.map((t) => t.peak), 0) * 100)}%`,
              }}
            />
          </div>
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
