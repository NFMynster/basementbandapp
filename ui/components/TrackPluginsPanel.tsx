import { useRef, type MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  KeyboardMusic,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import type { AmpCharacter, Track } from "../models";
import { desktop as api } from "../services/desktop";

// Factory presets from desktop/starter-sounds.cjs, keyed by their amp.
export const STARTER_SOUNDS: Record<Exclude<AmpCharacter, "none">, string> = {
  clean: "Clean guitar",
  crunch: "Crunch guitar",
  lead: "Lead guitar",
  bass: "Bass",
};

// Double-clicking a plug-in card opens its editor; double-clicks on the card's
// own buttons (bypass, move, remove) keep their meaning.
const onButton = (e: MouseEvent<HTMLElement>) =>
  !!(e.target as HTMLElement).closest("button");

export function TrackPluginsPanel({
  controller,
  track,
}: {
  controller: WorkspaceController;
  track: Track;
}) {
  const { s, run, busy } = controller;
  const effectDrag = useRef<string | null>(null);
  const amp = track.kind === "audio" ? (track.ampCharacter ?? "none") : "none";
  const emptyChain =
    track.kind === "audio" &&
    amp === "none" &&
    !track.pluginName &&
    !track.effects?.length;
  const applyStarter = (character: string) =>
    controller.task(
      async () =>
        (
          await api.soundLibrary({
            op: "applyPreset",
            track: track.id,
            id: `starter-${character}`,
          })
        ).session ?? null,
    );
  return (
    <div className="plugins-panel">
      <div className="plugin-toolbar">
        <h3>Plug-ins</h3>
      </div>
      <div className="plugin-details">
        {emptyChain && (
          <div
            className="starter-sounds"
            role="group"
            aria-label="Starter sounds"
          >
            <span>Start with a sound</span>
            {Object.entries(STARTER_SOUNDS).map(([character, name]) => (
              <button
                key={character}
                disabled={s.playing || busy}
                onClick={() => void applyStarter(character)}
              >
                {name}
              </button>
            ))}
            <small>
              Want more amps and effects? Any VST3 amp sim works here.
            </small>
          </div>
        )}
        <div className="plugin-chain" aria-label="Plug-ins in processing order">
          {amp !== "none" && (
            <div className="plugin-slot">
              <button
                title="Enable starter sound"
                aria-pressed={!track.ampBypass}
                className={track.ampBypass ? "" : "on"}
                disabled={busy}
                onClick={() =>
                  controller.update(track, { ampBypass: !track.ampBypass })
                }
              >
                <Power size={18} />
              </button>
              <div>
                <strong>{STARTER_SOUNDS[amp]}</strong>
                <small>{track.ampBypass ? "Bypassed" : "Starter sound"}</small>
              </div>
              <button
                title="Remove starter sound"
                disabled={busy}
                onClick={() =>
                  controller.update(track, {
                    ampCharacter: "none",
                    ampBypass: false,
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
          <div
            className={
              "plugin-slot" +
              (track.kind === "midi" && !track.pluginName
                ? " instrument-empty"
                : "")
            }
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
            onDoubleClick={(e) => {
              if (track.pluginName && !onButton(e))
                void run({ op: "editor", track: track.id }, false);
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
                {track.kind === "audio" && !!track.effects?.length && (
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
                  title="Enable plug-in"
                  aria-pressed={!track.bypass}
                  disabled={s.playing || busy}
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
                  onClick={() => run({ op: "editor", track: track.id }, false)}
                >
                  Open editor
                </button>
                <button
                  title="Replace plug-in"
                  disabled={s.playing || busy}
                  onClick={() =>
                    controller.setSoundBrowser({ track: track.id })
                  }
                >
                  Replace
                </button>
                <button
                  title="Remove plug-in"
                  disabled={s.playing || busy}
                  onClick={() => run({ op: "removePlugin", track: track.id })}
                >
                  <Trash2 size={15} />
                </button>
              </>
            ) : track.kind === "midi" ? (
              // An empty MIDI track is silent until it has an instrument, so
              // the slot itself explains that instead of a separate banner.
              <>
                <span className="instrument-empty-icon" aria-hidden="true">
                  <KeyboardMusic size={20} />
                </span>
                <div>
                  <strong>This track has no sound yet</strong>
                  <p>
                    MIDI tracks play through a VST3 instrument: piano, synth,
                    drums or strings. Plenty of good ones are free.
                  </p>
                  <button
                    className="instrument-empty-add"
                    disabled={s.playing || busy}
                    onClick={() =>
                      controller.setSoundBrowser({ track: track.id })
                    }
                  >
                    <Plus size={15} /> Add VST3 instrument
                  </button>
                  <small>or drop a .vst3 file here</small>
                </div>
              </>
            ) : (
              <button
                disabled={s.playing || busy}
                onClick={() => controller.setSoundBrowser({ track: track.id })}
              >
                <Plus size={20} />
                <span>
                  Add VST3 plug-in
                  <small>Choose from your library or drop a VST3 here</small>
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
              onDoubleClick={(e) => {
                if (!onButton(e))
                  void run(
                    { op: "editor", track: track.id, effect: effect.id },
                    false,
                  );
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
                  s.playing || busy || (track.kind === "midi" && index === 0)
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
                title={`Enable ${effect.name}`}
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
              disabled={s.playing || busy || (track.effects?.length ?? 0) >= 16}
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
  );
}
