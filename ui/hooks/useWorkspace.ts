import { useEffect, useEffectEvent, useRef } from "react";
import { desktop as api } from "../services/desktop";
import { useConfirmation } from "./useConfirmation";
import { useExport } from "./useExport";
import { usePanelLayout } from "./usePanelLayout";
import { useRulerGesture } from "./useRulerGesture";
import { useShortcuts } from "./useShortcuts";
import { useDialogs } from "./workspace/useDialogs";
import { useEditing } from "./workspace/useEditing";
import { useEngineSession } from "./workspace/useEngineSession";
import { useNotices } from "./workspace/useNotices";
import { trackContainingClip, useSelection } from "./workspace/useSelection";
import { useTempoChange } from "./workspace/useTempoChange";
import { useTimeline } from "./workspace/useTimeline";

/**
 * Composes the workspace domains into the controller components receive.
 * Each domain owns its state and rules in ui/hooks/workspace/; this hook only
 * wires them together and handles the few cross-domain workflows below.
 */
export function useWorkspace() {
  const layout = usePanelLayout();
  const { confirmation, confirmAction, finishConfirmation } = useConfirmation();
  const notices = useNotices();
  const { setNotice } = notices;
  const session = useEngineSession({ setNotice });
  const { s, run, task, withBusy, busy, dirty, setDirty, setError } = session;
  const timeline = useTimeline(s);
  const picked = useSelection(s, session.starting);
  const { track, clipId, setClipId, setSelected, selectedRegions } = picked;
  const editing = useEditing({
    session,
    selection: picked,
    timeline,
    setNotice,
  });
  const dialogs = useDialogs({ run, track, setSelected });
  const tempo = useTempoChange(session);
  const ruler = useRulerGesture({
    session: s,
    zoom: timeline.zoom,
    secondsPerBar: timeline.secondsPerBar,
    run,
  });
  const exportState = useExport({
    session: s,
    busy,
    withBusy,
    setError,
    setNotice,
  });

  // A recovered session counts as unsaved work and skips the welcome guide.
  const recoverySeen = useRef(false);
  const announceRecovery = useEffectEvent(() => {
    setDirty(true);
    dialogs.setWelcome(false);
    setNotice("Restored your previous session, including unsaved edits.");
  });
  useEffect(() => {
    if (s.recovered && !recoverySeen.current) {
      recoverySeen.current = true;
      announceRecovery();
    }
  }, [s.recovered]);

  async function newProject() {
    if (busy || s.recording) return;
    if (
      dirty &&
      !(await confirmAction(
        "Start a new session? Unsaved edits will be lost.",
        "New session",
      ))
    )
      return;
    const result = await run({ op: "new" }, false);
    if (result) {
      setDirty(false);
      setClipId("");
      setSelected("");
      dialogs.setPanel("input");
    }
  }

  const shortcuts = useShortcuts({
    newProject,
    newTrack: () => {
      if (!busy && !s.recording) dialogs.setCreatingTrack(true);
    },
    play: () => run({ op: s.playing ? "stop" : "play" }, false),
    record: () => run({ op: s.recording ? "stop" : "record" }),
    loop: async () => {
      const enabled = !s.looping;
      if (
        await run({
          op: "loop",
          start: s.loopStart,
          end: s.loopEnd,
          enabled,
        })
      )
        setNotice(enabled ? "Loop on." : "Loop off.");
    },
    metronome: async () => {
      const value = !s.metronome;
      if (await run({ op: "metronome", value }))
        setNotice(value ? "Metronome on." : "Metronome off.");
    },
    start: () => run({ op: "seek", position: 0 }, false),
    save: () => task(() => api.save(), true),
    split: async () => {
      if (!trackContainingClip(s.tracks, clipId)) {
        setNotice("Select a region to split at the playhead.", "warning");
        return;
      }
      if (await editing.editSelected("split"))
        setNotice("Split region at playhead.");
    },
    copy: () => {
      const t = trackContainingClip(s.tracks, clipId);
      if (t) editing.copyRegion(t.id, clipId);
    },
    paste: async () => {
      if (!editing.clipboard) {
        setNotice("Copy a region first, then paste it.", "warning");
        return;
      }
      if (await editing.editSelected("copy"))
        setNotice("Pasted region at playhead.");
    },
    undo: () => {
      if (!s.playing) run({ op: "undo" });
    },
    redo: () => {
      if (!s.playing) run({ op: "redo" });
    },
    deleteTrack: async () => {
      if (
        track &&
        !s.playing &&
        (await confirmAction(
          `Delete ${track.name} and all its regions? You can undo this.`,
          "Delete track",
        ))
      )
        void editing.removeTrack(track);
    },
    delete: () => {
      if (s.recording || busy) return;
      if (selectedRegions.length > 1) {
        void editing.deleteRegions();
        return;
      }
      const t = trackContainingClip(s.tracks, clipId);
      const clip = t?.clips.find((candidate) => candidate.id === clipId);
      if (t && clip) void editing.removeClip(t, clip);
    },
  });

  const loop = ruler.selection
    ? {
        start: Math.min(ruler.selection.start, ruler.selection.end),
        end: Math.max(ruler.selection.start, ruler.selection.end),
      }
    : { start: s.loopStart, end: s.loopEnd };
  const hasClips = s.tracks.some((t) => t.clips.length),
    armed = s.tracks.filter((t) => t.armed).length;

  return {
    ...layout,
    ...shortcuts,
    confirmation,
    confirmAction,
    finishConfirmation,
    ...notices,
    ...session,
    ...timeline,
    ...picked,
    ...editing,
    ...dialogs,
    ...tempo,
    ...ruler,
    ...exportState,
    newProject,
    loop,
    hasClips,
    armed,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
