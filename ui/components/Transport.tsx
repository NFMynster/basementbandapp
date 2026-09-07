import {
  HelpCircle,
  Repeat2 as Loop,
  Play,
  SkipBack,
  SlidersHorizontal,
  Square,
  Volume2,
} from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
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
            title="Back to start"
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
            title="Play / stop · Space"
            onClick={() => run({ op: s.playing ? "stop" : "play" }, false)}
          >
            <Play size={21} fill="currentColor" />
          </button>
          <button
            className={"record-button " + (s.recording ? "recording" : "")}
            title="Record marked tracks · R"
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
            title="Cycle selection · L"
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
