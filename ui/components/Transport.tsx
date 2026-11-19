import { Tuner } from "./Tuner";
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
import type { MetronomeSound } from "../models";
const metronomeSounds: [MetronomeSound, string][] = [
  ["beep", "Beep"],
  ["woodblock", "Wood block"],
  ["stick", "Stick"],
];
/**
 * A typed tempo, shared by the transport display and the metronome menu.
 * Applies on Enter or blur when it is a whole range value; Escape reverts.
 */
function TempoInput({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (bpm: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const bpm = Number(draft);
    if (draft.trim() && Number.isFinite(bpm) && bpm >= 40 && bpm <= 240)
      onCommit(bpm);
    setDraft(null);
  };
  return (
    <input
      aria-label={label}
      type="number"
      min="40"
      max="240"
      value={draft ?? value}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}

export function Transport({ controller }: { controller: WorkspaceController }) {
  const { s, run, busy, bar, beat, openSetup, showHelp, setHelp } = controller;
  const [clickVolumeOpen, setClickVolumeOpen] = useState(false);
  const clickVolume = useRef<HTMLDivElement>(null);
  const volumeGesture = useRef<string | undefined>(undefined);
  const taps = useRef<number[]>([]);
  const tapApply = useRef<number | undefined>(undefined);
  const [tapBpm, setTapBpm] = useState<number | null>(null);
  useEffect(() => () => window.clearTimeout(tapApply.current), []);
  // Averages up to five taps; a pause longer than two seconds starts over.
  // The tempo applies once tapping stops, so a session with regions asks how
  // they should follow only once.
  function tapTempo() {
    if (s.recording || busy) return;
    const now = performance.now(),
      last = taps.current.at(-1);
    taps.current = [
      ...(last !== undefined && now - last > 2000 ? [] : taps.current),
      now,
    ].slice(-5);
    window.clearTimeout(tapApply.current);
    if (taps.current.length < 2) {
      setTapBpm(null);
      return;
    }
    const interval = (now - taps.current[0]) / (taps.current.length - 1);
    const bpm = Math.max(40, Math.min(240, Math.round(60000 / interval)));
    setTapBpm(bpm);
    tapApply.current = window.setTimeout(() => {
      taps.current = [];
      setTapBpm(null);
      void controller.requestTempo(bpm);
    }, 1500);
  }
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
            <TempoInput
              label="Tempo"
              value={s.tempo}
              disabled={s.recording}
              onCommit={(bpm) => void controller.requestTempo(bpm)}
            />
            <small>TEMPO</small>
          </div>
          <div>
            <strong>4/4</strong>
            <small>TIME</small>
          </div>
        </div>
        <div className="transport-right">
          <Tuner controller={controller} />
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
              title={`Metronome · ${keyLabel(controller.bindings.metronome)} · Right-click for volume, tap tempo and sound`}
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
                className="metronome-menu"
                role="dialog"
                aria-label="Metronome settings"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setClickVolumeOpen(false);
                  if (
                    e.code === "KeyT" &&
                    !e.repeat &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    !e.altKey
                  ) {
                    e.preventDefault();
                    tapTempo();
                  }
                }}
                onBlur={(e) => {
                  // Tabbing out closes the menu; clicks are handled above.
                  if (
                    e.relatedTarget &&
                    !e.currentTarget.contains(e.relatedTarget as Node)
                  )
                    setClickVolumeOpen(false);
                }}
              >
                <div className="metronome-volume">
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
                <div className="metronome-options">
                  <div
                    className={"metronome-tempo " + (tapBpm ? "tapping" : "")}
                  >
                    <label>
                      <TempoInput
                        label="Tempo in BPM"
                        value={tapBpm ?? s.tempo}
                        disabled={s.recording || busy}
                        onCommit={(bpm) => void controller.requestTempo(bpm)}
                      />
                      <small>BPM</small>
                    </label>
                    <button
                      className="tap-tempo"
                      title="Tap in time to set the tempo (or press T)"
                      disabled={s.recording || busy}
                      onClick={tapTempo}
                    >
                      {tapBpm ? "Keep tapping" : "Tap"}
                    </button>
                  </div>
                  <div
                    className="metronome-sounds"
                    role="radiogroup"
                    aria-label="Metronome sound"
                  >
                    {metronomeSounds.map(([value, label]) => (
                      <button
                        key={value}
                        role="radio"
                        aria-checked={(s.metronomeSound ?? "beep") === value}
                        onClick={() =>
                          void run({ op: "metronomeSound", value })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
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
