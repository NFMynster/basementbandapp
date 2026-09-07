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
  bufferSize: 512,
  device: "Connecting to audio engine…",
  deviceError: "",
  diskOverrun: false,
};
export function useWorkspace() {
  const [starting, setStarting] = useState(true);
  const [propertiesPing, setPropertiesPing] = useState(0);
  const rulerGesture = useRef<{ mode: "seek" | "loop"; start: number } | null>(
    null,
  );
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
    stateRef = useRef(s),
    polling = useRef(false),
    editing = useRef(false);
  stateRef.current = s;
  const track = s.tracks.find((t) => t.id === selected) || s.tracks[0];
  const secondsPerBar = 240 / s.tempo,
    pxPerSecond = zoom / secondsPerBar;
  const end = Math.max(
      32 * secondsPerBar,
      ...s.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration + 8)),
    ),
    width = Math.ceil(end / secondsPerBar) * zoom;
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
    const tick = async () => {
      if (polling.current || editing.current) return;
      polling.current = true;
      try {
        const v = await api.command({ op: "state" });
        if (alive) {
          accept(v);
          setStarting(false);
        }
      } catch (e) {
        if (alive) setError(errorMessage(e));
      } finally {
        polling.current = false;
      }
    };
    tick();
    const timer = setInterval(tick, 120);
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
    const listener = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        document.querySelector('[role="dialog"], [role="menu"], [data-startup]')
      )
        return;
      if (
        (e.target as HTMLElement).closest(
          "input,select,textarea,[contenteditable]",
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        run({ op: stateRef.current.playing ? "stop" : "play" }, false);
      }
      if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey)
        run({ op: stateRef.current.recording ? "stop" : "record" });
      if (e.key.toLowerCase() === "l") {
        const a = stateRef.current;
        run({
          op: "loop",
          start: a.loopStart,
          end: a.loopEnd,
          enabled: !a.looping,
        });
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        task(() => api.save(), true);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
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
  const update = (t: Track, c: TrackPatch) =>
    run({ op: "track", track: t.id, ...c });
  async function openSetup() {
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
    rulerGesture.current = { mode, start };
    if (mode === "seek") setDragPosition(start);
    else setSelection({ start, end: start });
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
    else setSelection({ start: gesture.start, end });
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
    else if (b - a >= 0.05)
      run({ op: "loop", start: a, end: b, enabled: true });
    setSelection(null);
  }
  function rulerCancel() {
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
