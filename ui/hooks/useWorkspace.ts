import { useRulerGesture } from "./useRulerGesture";
import { useExport } from "./useExport";
import { optimisticSession } from "../services/session-updates";
import { useConfirmation } from "./useConfirmation";
import { usePanelLayout } from "./usePanelLayout";
import { useShortcuts } from "./useShortcuts";
import { errorMessage } from "../services/errors";
import React, { useEffect, useRef, useState } from "react";
import type {
  Clip,
  Session,
  Devices,
  Track,
  TrackPatch,
  Command,
  CommandResult,
  SaveResult,
} from "../models";
import { desktop as api } from "../services/desktop";
const empty: Session = {
  title: "Friday night",
  tracks: [],
  position: 0,
  playing: false,
  recording: false,
  looping: false,
  loopStart: 0,
  loopEnd: 8,
  tempo: 120,
  sampleRate: 48000,
  bufferSize: 256,
  device: "Initializing audio engine…",
  deviceError: "",
  diskOverrun: false,
};
type NoticeTone = "notice" | "warning";

function trackContainingClip(tracks: Track[], clipId: string) {
  return tracks.find((candidate) =>
    candidate.clips.some((clip) => clip.id === clipId),
  );
}

export function useWorkspace() {
  const layout = usePanelLayout();
  const [soundBrowser, setSoundBrowser] = useState<{
    track: string;
    append?: boolean;
    presets?: boolean;
  } | null>(null);
  const [creatingTrack, setCreatingTrack] = useState(false);
  const [welcome, setWelcome] = useState(
    () => localStorage.getItem("basement.hideWelcome") !== "1",
  );
  const [settingsTab, setSettingsTab] = useState<
    "audio" | "midi" | "shortcuts" | "export"
  >("audio");
  const [clipboard, setClipboard] = useState<{
    track: string;
    clip: string;
  } | null>(null);
  const previousTracks = useRef<string[] | null>(null);
  const [trackPing, setTrackPing] = useState("");
  const [projectRevision, setProjectRevision] = useState(0);
  const [starting, setStarting] = useState(true);
  const [propertiesPing, setPropertiesPing] = useState(0);
  const [pendingTempo, setPendingTempo] = useState<number | null>(null);
  const { confirmation, confirmAction, finishConfirmation } = useConfirmation();
  const [seekRevision, setSeekRevision] = useState(0);
  const [s, setS] = useState<Session>(empty),
    [selected, setSelected] = useState(""),
    [clipId, setPrimaryClipId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNoticeState] = useState(""),
    [noticeTone, setNoticeTone] = useState<NoticeTone>("notice"),
    [noticeVersion, setNoticeVersion] = useState(0),
    [panel, setPanel] = useState<
      "input" | "plugins" | "eq" | "notes" | "region"
    >("input"),
    [showHelp, setHelp] = useState(false),
    [devices, setDevices] = useState<Devices | null>(null),
    [deviceLoading, setDeviceLoading] = useState(false),
    [setup, setSetup] = useState(false),
    [zoom, setZoom] = useState(88),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [regionIds, setRegionIds] = useState<string[]>([]);
  const [regionMove, setRegionMove] = useState<number | null>(null);
  function setClipId(id: string) {
    setPrimaryClipId(id);
    setRegionIds(id ? [id] : []);
  }
  function selectRegions(ids: string[]) {
    setRegionIds(ids);
    setPrimaryClipId(ids.at(-1) ?? "");
    const owner = s.tracks.find((t) =>
      t.clips.some((c) => c.id === ids.at(-1)),
    );
    if (owner) setSelected(owner.id);
  }
  function selectRegion(id: string, additive = false) {
    selectRegions(
      additive
        ? regionIds.includes(id)
          ? regionIds.filter((c) => c !== id)
          : [...regionIds, id]
        : [id],
    );
  }
  const selectedRegions = s.tracks.flatMap((t) =>
    t.clips
      .filter((c) => c.active && regionIds.includes(c.id))
      .map((c) => ({ track: t.id, clip: c.id, start: c.start })),
  );
  async function deleteRegions() {
    if (s.recording || busy || !selectedRegions.length) return;
    const result = await run({
      op: "editRegions",
      action: "delete",
      regions: selectedRegions,
    });
    if (result) selectRegions([]);
  }
  async function moveRegions(delta: number) {
    try {
      await run({
        op: "editRegions",
        action: "move",
        regions: selectedRegions,
        delta,
      });
    } finally {
      setRegionMove(null);
    }
  }
  const trackList = useRef<HTMLElement>(null),
    timelineScroll = useRef<HTMLDivElement>(null),
    polling = useRef(false),
    editing = useRef(false),
    activeCommands = useRef(0),
    optimisticRevision = useRef(0);
  const track = s.tracks.find((t) => t.id === selected) || s.tracks[0];
  const secondsPerBar = 240 / s.tempo,
    pxPerSecond = zoom / secondsPerBar;
  const end = Math.max(
      32 * secondsPerBar,
      s.recording ? s.position + 8 * secondsPerBar : 0,
      ...s.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration + 8)),
    ),
    width = Math.ceil(end / secondsPerBar) * zoom;
  const {
    selection,
    setSelection,
    dragPosition,
    setDragPosition,
    rulerDown,
    rulerMove,
    rulerUp,
    rulerCancel,
  } = useRulerGesture({ session: s, zoom, secondsPerBar, run });
  const {
    exporting,
    midiExportTrack,
    setMidiExportTrack,
    exportMidi,
    setExportMidi,
    exportMode,
    setExportMode,
    exportFormat,
    setExportFormat,
    exportAudio,
  } = useExport({ session: s, busy, withBusy, setError, setNotice });
  const wasRecording = useRef(false);
  useEffect(() => {
    const timeline = timelineScroll.current;
    if (s.recording && !wasRecording.current && timeline) {
      const x = s.position * pxPerSecond;
      if (
        x < timeline.scrollLeft + 24 ||
        x > timeline.scrollLeft + timeline.clientWidth - 64
      )
        timeline.scrollTo({
          left: Math.max(0, x - timeline.clientWidth * 0.2),
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
    }
    wasRecording.current = s.recording;
  }, [s.recording, s.position, pxPerSecond]);
  const accept = (v: Session | Devices | SaveResult | null) => {
    if (v && "tracks" in v) {
      setS(v);
      if (v.recoveryError) setError(v.recoveryError);
    }
  };
  function setNotice(message: string, tone: NoticeTone = "notice") {
    setNoticeState(message);
    setNoticeTone(tone);
    setNoticeVersion((v) => v + 1);
  }
  const recoverySeen = useRef(false);
  useEffect(() => {
    if (s.recovered && !recoverySeen.current) {
      recoverySeen.current = true;
      setDirty(true);
      setWelcome(false);
      setNotice("Restored your previous session, including unsaved edits.");
    }
  }, [s.recovered]);
  async function dropAudio(files: File[], target?: string) {
    const at = s.position;
    const result = await task(() => api.dropFiles(files, target));
    if (!result) return;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    timelineScroll.current?.scrollTo({
      left: Math.max(
        0,
        at * pxPerSecond - (timelineScroll.current?.clientWidth ?? 0) * 0.2,
      ),
      behavior: "smooth",
    });
  }
  async function run<C extends Command>(
    c: C,
    change = true,
  ): Promise<CommandResult<C> | undefined> {
    const previous = s,
      optimistic = optimisticSession(s, c),
      revision = optimistic ? ++optimisticRevision.current : 0;
    if (optimistic) setS(optimistic);
    activeCommands.current += 1;
    try {
      setError("");
      const r = await api.command(c);
      // Drag gestures can queue several optimistic track updates. Only the
      // newest optimistic reply should repaint the slider, otherwise the
      // controlled range input visibly walks through every queued value.
      if (!optimistic || revision === optimisticRevision.current) accept(r);
      if (c.op === "seek") setSeekRevision((value) => value + 1);
      if (c.op === "undo" || c.op === "redo") {
        if ("tracks" in r && r.historyNotice) {
          setNotice(r.historyNotice);
          if (change) setDirty(true);
        }
      } else if (change) setDirty(true);
      return r;
    } catch (e) {
      if (optimistic && revision === optimisticRevision.current) setS(previous);
      setError(errorMessage(e));
    } finally {
      activeCommands.current -= 1;
    }
  }
  async function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    editing.current = true;
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      editing.current = false;
    }
  }
  async function removeTrack(track: Track) {
    if (s.playing) return;
    const previous = s;
    const selectedBefore = selected;
    const clipBefore = clipId;
    setS({
      ...s,
      tracks: s.tracks.filter((candidate) => candidate.id !== track.id),
    });
    if (selected === track.id) {
      const next = s.tracks.find((candidate) => candidate.id !== track.id);
      setSelected(next?.id ?? "");
      setClipId("");
    }
    setDirty(true);
    setNotice(`Deleted track “${track.name}”.`, "warning");
    const result = await run({ op: "removeTrack", track: track.id });
    if (!result) {
      setS(previous);
      setDirty(dirty);
      if (selected === track.id) {
        setSelected(selectedBefore);
        setClipId(clipBefore);
      }
    }
    return result;
  }
  async function removeClip(track: Track, clip: Clip) {
    if (s.recording || busy) return;
    const previous = s;
    const selectedClipBefore = clipId;
    setS({
      ...s,
      tracks: s.tracks.map((candidate) =>
        candidate.id === track.id
          ? {
              ...candidate,
              clips: candidate.clips.filter(
                (candidate) =>
                  candidate.id !== clip.id &&
                  (!clip.takeGroup || candidate.takeGroup !== clip.takeGroup),
              ),
            }
          : candidate,
      ),
    });
    if (clipId === clip.id) setClipId("");
    setDirty(true);
    setNotice(
      `Deleted recording “${clip.name}” from ${track.name}.`,
      "warning",
    );
    const result = await run({
      op: "removeClip",
      track: track.id,
      clip: clip.id,
    });
    if (!result) {
      setS(previous);
      setDirty(dirty);
      if (clipId === "") setClipId(selectedClipBefore);
    }
    return result;
  }
  async function task(
    fn: () => Promise<Session | SaveResult | null>,
    saved = false,
  ) {
    const result = await withBusy(fn);
    if (result) {
      accept(result);
      if (saved && "tracks" in result) setProjectRevision((v) => v + 1);
      setDirty(!saved);
      if (saved)
        setNotice(
          "saved" in result
            ? "Session saved with its audio files."
            : "Session opened.",
        );
    }
    return result;
  }
  useEffect(() => {
    let alive = true;
    let failed = false;
    const tick = async () => {
      if (
        failed ||
        polling.current ||
        editing.current ||
        activeCommands.current
      )
        return;
      polling.current = true;
      const revision = optimisticRevision.current;
      try {
        const v = await api.command({ op: "state" });
        if (
          alive &&
          !activeCommands.current &&
          revision === optimisticRevision.current
        ) {
          accept(v);
          setStarting(false);
        }
      } catch (e) {
        const message = errorMessage(e);
        if (/audio engine.*(timed out|stopped|closing)/i.test(message))
          failed = true;
        if (alive) setError(message);
      } finally {
        polling.current = false;
      }
    };
    tick();
    const timer = setInterval(tick, 50);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice, noticeVersion]);
  const copyRegion = (track: string, clip: string) => {
    setClipboard({ track, clip });
    setNotice("Region copied. Paste at the playhead.");
  };
  const editSelected = (
    action: "split" | "copy" | "move",
    source = clipboard,
  ) => {
    const regionTrack = trackContainingClip(s.tracks, clipId);
    const target =
      action === "copy"
        ? source
        : regionTrack
          ? { track: regionTrack.id, clip: clipId }
          : null;
    if (target)
      run({
        op: "editClip",
        ...target,
        action,
        position: s.position,
        target: track?.id,
      });
  };
  async function requestTempo(value: number) {
    if (busy || s.recording || value === s.tempo) return;
    if (s.tracks.some((t) => t.clips.length)) setPendingTempo(value);
    else await run({ op: "tempo", value });
  }
  async function applyTempo(match: "none" | "midi" | "all") {
    if (pendingTempo === null || busy) return;
    await withBusy(async () => {
      if (s.playing && match !== "none") await run({ op: "stop" }, false);
      await run({ op: "tempo", value: pendingTempo, match });
    });
    setPendingTempo(null);
  }
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
      setPanel("input");
    }
  }
  const shortcuts = useShortcuts({
    newProject,
    newTrack: () => {
      if (!busy && !s.recording) setCreatingTrack(true);
    },
    play: () => run({ op: s.playing ? "stop" : "play" }, false),
    record: () => run({ op: s.recording ? "stop" : "record" }),
    loop: () =>
      run({
        op: "loop",
        start: s.loopStart,
        end: s.loopEnd,
        enabled: !s.looping,
      }),
    metronome: () => run({ op: "metronome", value: !s.metronome }),
    start: () => run({ op: "seek", position: 0 }, false),
    save: () => task(() => api.save(), true),
    split: () => editSelected("split"),
    copy: () => {
      const t = trackContainingClip(s.tracks, clipId);
      if (t) copyRegion(t.id, clipId);
    },
    paste: () => editSelected("copy"),
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
        void removeTrack(track);
    },
    delete: () => {
      if (s.recording || busy) return;
      if (selectedRegions.length > 1) {
        void deleteRegions();
        return;
      }
      const t = trackContainingClip(s.tracks, clipId);
      const clip = t?.clips.find((candidate) => candidate.id === clipId);
      if (t && clip) void removeClip(t, clip);
    },
  });
  // Select and reveal a newly added track; other edits leave selection alone.
  const trackIds = s.tracks.map((t) => t.id).join(",");
  useEffect(() => {
    if (starting) return;
    const ids = trackIds ? trackIds.split(",") : [];
    const previous = previousTracks.current;
    const added = previous && ids.filter((id) => !previous.includes(id)).at(-1);
    previousTracks.current = ids;
    if (!added) return;
    setSelected(added);
    setTrackPing(added);
    document
      .querySelector(`[data-track-header="${added}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [trackIds, starting]);
  async function openCreateTrack() {
    setCreatingTrack(true);
    const devices = await run({ op: "devices" }, false);
    if (devices) setDevices(devices);
  }
  const update = (t: Track, c: TrackPatch) =>
    run({ op: "track", track: t.id, ...c });
  async function createTrackLike(source: Track) {
    const added = await run({
      op: "duplicateTrack",
      track: source.id,
      empty: true,
    });
    const created = added?.tracks.at(-1);
    if (!created) return;
    setSelected(created.id);
    return created;
  }
  async function openSetup(tab?: "audio" | "midi" | React.MouseEvent) {
    setSettingsTab(
      typeof tab === "string" ? tab : track?.kind === "midi" ? "midi" : "audio",
    );
    setSetup(true);
    setDevices(null);
    setDeviceLoading(true);
    try {
      const d = await run({ op: "devices" }, false);
      if (d) setDevices(d);
    } finally {
      setDeviceLoading(false);
    }
  }
  function openProperties(id: string) {
    setSelected(id);
    setPanel("input");
    setPropertiesPing((value) => value + 1);
  }
  const loop = selection
    ? {
        start: Math.min(selection.start, selection.end),
        end: Math.max(selection.start, selection.end),
      }
    : { start: s.loopStart, end: s.loopEnd };
  const hasClips = s.tracks.some((t) => t.clips.length),
    armed = s.tracks.filter((t) => t.armed).length;
  const bar = Math.floor(s.position / secondsPerBar) + 1,
    beat = (Math.floor(s.position / (60 / s.tempo)) % 4) + 1;
  return {
    ...shortcuts,
    requestTempo,
    pendingTempo,
    setPendingTempo,
    applyTempo,
    newProject,
    ...layout,
    soundBrowser,
    setSoundBrowser,
    projectRevision,
    confirmation,
    confirmAction,
    finishConfirmation,
    dropAudio,
    creatingTrack,
    setCreatingTrack,
    openCreateTrack,
    createTrackLike,
    welcome,
    setWelcome,
    settingsTab,
    setSettingsTab,
    trackPing,
    clipboard,
    copyRegion,
    editSelected,
    openProperties,
    propertiesPing,
    rulerCancel,
    exporting,
    exportMode,
    setExportMode,
    exportMidi,
    setExportMidi,
    midiExportTrack,
    setMidiExportTrack,
    exportFormat,
    setExportFormat,
    exportAudio,
    dragPosition,
    seekRevision,
    setDragPosition,
    starting,
    s,
    setS,
    setSelected,
    clipId,
    setClipId,
    error,
    setError,
    notice,
    noticeVersion,
    noticeTone,
    setNotice,
    panel,
    setPanel,
    showHelp,
    setHelp,
    devices,
    deviceLoading,
    setDevices,
    setup,
    setSetup,
    zoom,
    setZoom,
    busy,
    dirty,
    setDirty,
    selection,
    setSelection,
    trackList,
    timelineScroll,
    track,
    pxPerSecond,
    width,
    run,
    removeTrack,
    removeClip,
    regionIds,
    selectRegion,
    selectRegions,
    selectedRegions,
    deleteRegions,
    regionMove,
    setRegionMove,
    moveRegions,
    task,
    update,
    openSetup,
    rulerDown,
    rulerMove,
    rulerUp,
    loop,
    hasClips,
    armed,
    bar,
    beat,
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
