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
  ExportOptions,
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
export function useWorkspace() {
  const [creatingTrack, setCreatingTrack] = useState(false);
  const [welcome, setWelcome] = useState(
    () => localStorage.getItem("basement.hideWelcome") !== "1",
  );
  const [settingsTab, setSettingsTab] = useState<
    "audio" | "midi" | "shortcuts"
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
  const [exportTarget, setExportTarget] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const [s, setS] = useState<Session>(empty),
    [selected, setSelected] = useState(""),
    [clipId, setClipId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [panel, setPanel] = useState<"input" | "plugins">("input"),
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
    if (v && "tracks" in v) setS(v);
  };
  async function run<C extends Command>(
    c: C,
    change = true,
  ): Promise<CommandResult<C> | undefined> {
    try {
      setError("");
      const r = await api.command(c);
      accept(r);
      if (change) setDirty(true);
      return r;
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function task(
    fn: () => Promise<Session | SaveResult | null>,
    saved = false,
  ) {
    setBusy(true);
    setError("");
    editing.current = true;
    try {
      const r = await fn();
      accept(r);
      if (r) {
        setDirty(!saved);
        if (saved)
          setNotice(
            "saved" in r
              ? "Session saved with its audio files."
              : "Session opened.",
          );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      editing.current = false;
    }
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
  }, [notice]);
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty || s.recording) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty, s.recording]);
  const editSelected = (
    action: "split" | "copy" | "move",
    source = clipboard.current,
  ) => {
    const regionTrack = s.tracks.find((t) =>
      t.clips.some((c) => c.id === clipId),
    );
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
      const t = s.tracks.find((t) => t.clips.some((c) => c.id === clipId));
      if (t) {
        clipboard.current = { track: t.id, clip: clipId };
        setNotice("Region copied. Paste at the playhead.");
      }
    },
    paste: () => editSelected("copy"),
    delete: () => {
      const t = s.tracks.find((t) => t.clips.some((c) => c.id === clipId));
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
  async function exportAudio(options: ExportOptions) {
    editing.current = true;
    setBusy(true);
    try {
      return await api.exportAudio(options);
    } finally {
      editing.current = false;
      setBusy(false);
    }
  }
  function rulerDown(e: React.PointerEvent) {
    if (s.recording || e.button !== 0) return;
    ++rulerRevision.current;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const start = Math.max(
      0,
      (Math.round(((e.clientX - rect.left) / zoom) * 4) / 4) * secondsPerBar,
    );
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
    const end = Math.max(
      0,
      (Math.round(((e.clientX - rect.left) / zoom) * 4) / 4) * secondsPerBar,
    );
    if (gesture.mode === "seek") setDragPosition(end);
    else if (Math.abs(e.clientX - gesture.x) > 4)
      setSelection({ start: gesture.start, end });
  }
  function rulerUp(e: React.PointerEvent) {
    const gesture = rulerGesture.current;
    if (!gesture) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const end = Math.max(
      0,
      (Math.round(((e.clientX - rect.left) / zoom) * 4) / 4) * secondsPerBar,
    );
    rulerGesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    const a = Math.min(gesture.start, end),
      b = Math.max(gesture.start, end);
    if (gesture.mode === "seek")
      void run({ op: "seek", position: end }, false).finally(() =>
        setDragPosition(null),
      );
    else if (Math.abs(e.clientX - gesture.x) <= 4 && gesture.inside) {
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
    creatingTrack,
    setCreatingTrack,
    openCreateTrack,
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
    exportTarget,
    exportAudio,
    setExportTarget,
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
