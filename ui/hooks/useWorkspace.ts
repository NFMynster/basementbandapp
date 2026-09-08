import { useShortcuts } from "./useShortcuts";
import { errorMessage } from "../services/errors";
import React, { useEffect, useRef, useState } from "react";
import type {
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
  device: "Connecting to audio engine…",
  deviceError: "",
  diskOverrun: false,
};
const RULER_SNAP_DIVISIONS = 4;
const RULER_DRAG_THRESHOLD = 4;

function trackContainingClip(tracks: Track[], clipId: string) {
  return tracks.find((candidate) =>
    candidate.clips.some((clip) => clip.id === clipId),
  );
}

function trackClonePatch(source: Track): TrackPatch {
  return {
    name: `${source.name} copy`,
    input: source.input,
    mute: source.mute,
    solo: source.solo,
    gain: source.gain,
    pan: source.pan,
    color: source.color,
    icon: source.icon,
    monitor: source.monitor,
    // A duplicated track should not unexpectedly record alongside its source.
    armed: false,
  };
}

function rulerPosition(
  clientX: number,
  rect: DOMRect,
  zoom: number,
  secondsPerBar: number,
) {
  const bars = (clientX - rect.left) / zoom;
  return Math.max(
    0,
    (Math.round(bars * RULER_SNAP_DIVISIONS) / RULER_SNAP_DIVISIONS) *
      secondsPerBar,
  );
}

export function useWorkspace() {
  const [creatingTrack, setCreatingTrack] = useState(false);
  const [welcome, setWelcome] = useState(
    () => localStorage.getItem("basement.hideWelcome") !== "1",
  );
  const [settingsTab, setSettingsTab] = useState<
    "audio" | "midi" | "shortcuts" | "export"
  >("audio");
  const clipboard = useRef<{ track: string; clip: string } | null>(null);
  const previousTracks = useRef<string[] | null>(null);
  const [trackPing, setTrackPing] = useState("");
  const [starting, setStarting] = useState(true);
  const [propertiesPing, setPropertiesPing] = useState(0);
  const rulerRevision = useRef(0);
  const rulerGesture = useRef<{
    mode: "seek" | "loop";
    start: number;
    x: number;
    inside: boolean;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMode, setExportMode] = useState<"separate" | "mix">(() =>
    localStorage.getItem("basement.exportMode") === "mix" ? "mix" : "separate",
  );
  useEffect(
    () => localStorage.setItem("basement.exportMode", exportMode),
    [exportMode],
  );
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [s, setS] = useState<Session>(empty),
    [selected, setSelected] = useState(""),
    [clipId, setClipId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [noticeVersion, setNoticeVersion] = useState(0),
    [panel, setPanel] = useState<"input" | "plugins" | "export">("input"),
    [showHelp, setHelp] = useState(false),
    [devices, setDevices] = useState<Devices | null>(null),
    [deviceLoading, setDeviceLoading] = useState(false),
    [setup, setSetup] = useState(false),
    [zoom, setZoom] = useState(88),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const trackList = useRef<HTMLElement>(null),
    timelineScroll = useRef<HTMLDivElement>(null),
    polling = useRef(false),
    editing = useRef(false);
  const track = s.tracks.find((t) => t.id === selected) || s.tracks[0];
  const secondsPerBar = 240 / s.tempo,
    pxPerSecond = zoom / secondsPerBar;
  const end = Math.max(
      32 * secondsPerBar,
      ...s.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration + 8)),
    ),
    width = Math.ceil(end / secondsPerBar) * zoom;
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
    try {
      setError("");
      const r = await api.command(c);
      accept(r);
      if (c.op === "undo" || c.op === "redo") {
        setNotice(c.op === "undo" ? "Undo" : "Redo");
        setNoticeVersion((v) => v + 1);
      }
      if (change) setDirty(true);
      return r;
    } catch (e) {
      setError(errorMessage(e));
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
  async function task(
    fn: () => Promise<Session | SaveResult | null>,
    saved = false,
  ) {
    const result = await withBusy(fn);
    if (result) {
      accept(result);
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
      if (failed || polling.current || editing.current) return;
      polling.current = true;
      try {
        const v = await api.command({ op: "state" });
        if (alive) {
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
  const editSelected = (
    action: "split" | "copy" | "move",
    source = clipboard.current,
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
  const shortcuts = useShortcuts({
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
      if (t) {
        clipboard.current = { track: t.id, clip: clipId };
        setNotice("Region copied. Paste at the playhead.");
      }
    },
    paste: () => editSelected("copy"),
    undo: () => {
      if (!s.playing) run({ op: "undo" });
    },
    redo: () => {
      if (!s.playing) run({ op: "redo" });
    },
    deleteTrack: () => {
      if (
        track &&
        !s.playing &&
        confirm(`Delete ${track.name} and all its regions? You can undo this.`)
      )
        run({ op: "removeTrack", track: track.id });
    },
    delete: () => {
      if (s.recording || busy) return;
      const t = trackContainingClip(s.tracks, clipId);
      if (t) run({ op: "removeClip", track: t.id, clip: clipId });
    },
  });
  useEffect(() => {
    if (starting) return;
    const previous = previousTracks.current;
    const added =
      previous && s.tracks.filter((t) => !previous.includes(t.id)).at(-1);
    previousTracks.current = s.tracks.map((t) => t.id);
    if (!added) return;
    setSelected(added.id);
    setTrackPing(added.id);
    document
      .querySelector(`[data-track-header="${added.id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [s.tracks.map((t) => t.id).join(","), starting]);
  async function openCreateTrack() {
    setCreatingTrack(true);
    const devices = await run({ op: "devices" }, false);
    if (devices) setDevices(devices);
  }
  const update = (t: Track, c: TrackPatch) =>
    run({ op: "track", track: t.id, ...c });
  async function createTrackLike(source: Track) {
    const added = await run({ op: "addTrack", kind: source.kind });
    const created = added?.tracks.at(-1);
    if (!created) return;

    const configured = await update(created, trackClonePatch(source));
    if (!configured) {
      // Avoid leaving an unconfigured track behind if the second command fails.
      await run({ op: "removeTrack", track: created.id }, false);
      return;
    }
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
  async function exportAudio(target?: string) {
    setExporting(true);
    try {
      const result = await withBusy(() =>
        api.exportAudio({
          mode: target ? "separate" : exportMode,
          track: target,
        }),
      );
      if (result)
        setNotice(
          `Exported ${result.files.length} file(s) to ${result.folder}`,
        );
    } finally {
      setExporting(false);
    }
  }
  function rulerDown(e: React.PointerEvent) {
    if (s.recording || e.button !== 0) return;
    ++rulerRevision.current;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const start = rulerPosition(e.clientX, rect, zoom, secondsPerBar);
    const mode =
      (e.target as HTMLElement).closest<HTMLElement>("[data-ruler-zone]")
        ?.dataset.rulerZone === "seek"
        ? "seek"
        : "loop";
    const raw = (e.clientX - rect.left) / pxPerSecond;
    rulerGesture.current = {
      mode,
      start,
      x: e.clientX,
      inside: raw >= s.loopStart && raw <= s.loopEnd,
    };
    if (mode === "seek") {
      setSelection(null);
      setDragPosition(start);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function rulerMove(e: React.PointerEvent) {
    const gesture = rulerGesture.current;
    if (!gesture || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const end = rulerPosition(e.clientX, rect, zoom, secondsPerBar);
    if (gesture.mode === "seek") setDragPosition(end);
    else if (Math.abs(e.clientX - gesture.x) > RULER_DRAG_THRESHOLD)
      setSelection({ start: gesture.start, end });
  }
  function rulerUp(e: React.PointerEvent) {
    const gesture = rulerGesture.current;
    if (!gesture) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const end = rulerPosition(e.clientX, rect, zoom, secondsPerBar);
    rulerGesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const a = Math.min(gesture.start, end),
      b = Math.max(gesture.start, end);
    if (gesture.mode === "seek")
      void run({ op: "seek", position: end }, false).finally(() =>
        setDragPosition(null),
      );
    else if (
      Math.abs(e.clientX - gesture.x) <= RULER_DRAG_THRESHOLD &&
      gesture.inside
    ) {
      void run({
        op: "loop",
        start: s.loopStart,
        end: s.loopEnd,
        enabled: !s.looping,
      });
      setSelection(null);
    } else if (b - a >= 0.05) {
      const revision = rulerRevision.current;
      setSelection({ start: a, end: b });
      // Keep the final preview until the native reply replaces the old range.
      void run({ op: "loop", start: a, end: b, enabled: true }).finally(() => {
        if (revision === rulerRevision.current) setSelection(null);
      });
    } else setSelection(null);
  }
  function rulerCancel() {
    ++rulerRevision.current;
    rulerGesture.current = null;
    setSelection(null);
    setDragPosition(null);
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
    editSelected,
    openProperties,
    propertiesPing,
    rulerCancel,
    exporting,
    exportMode,
    setExportMode,
    exportAudio,
    dragPosition,
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
