import { useEffect, useRef, useState } from "react";
import type {
  Command,
  CommandResult,
  Devices,
  EngineFrame,
  EngineState,
  SaveResult,
  Session,
} from "../../models";
import { desktop as api } from "../../services/desktop";
import { errorMessage } from "../../services/errors";
import {
  acceptEngineState,
  acceptLive,
  previewPosition,
} from "../../services/liveState";
import { optimisticSession } from "../../services/session-updates";
import type { Notices } from "./useNotices";

const empty: Session = {
  title: "Friday night",
  tracks: [],
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

/**
 * The renderer's copy of the engine session and the one pipeline that changes
 * it: optimistic commands (`run`), busy file tasks (`task`) and the engine
 * stream. After one first read the engine pushes frames: live values go to
 * the live store, and the session comes along only when it changed. Engine
 * replies stay authoritative over optimistic previews, and `revision` keeps
 * an older state from replacing a newer one.
 */
export function useEngineSession({
  setNotice,
}: {
  setNotice: Notices["setNotice"];
}) {
  const [s, setS] = useState<Session>(empty),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [starting, setStarting] = useState(true),
    [seekRevision, setSeekRevision] = useState(0),
    [projectRevision, setProjectRevision] = useState(0);
  const activeCommands = useRef(0),
    optimisticRevision = useRef(0),
    // The newest engine state shown, and a streamed session waiting for the
    // commands in flight to finish.
    shownRevision = useRef(0),
    waiting = useRef<{ session: Session; revision: number } | null>(null);

  /** Shows an engine state unless a newer one is already on screen. */
  const accept = (v: EngineState | Devices | SaveResult | null) => {
    if (!v || !("tracks" in v)) return;
    if (v.revision !== undefined) {
      if (v.revision <= shownRevision.current) return;
      shownRevision.current = v.revision;
    }
    setS(acceptEngineState(v));
    if (v.recoveryError) setError(v.recoveryError);
  };

  /**
   * A streamed session waits while commands are in flight, so it never
   * replaces their optimistic previews with what the engine had before.
   */
  const showWaiting = () => {
    const next = waiting.current;
    if (!next || activeCommands.current) return;
    waiting.current = null;
    if (next.revision <= shownRevision.current) return;
    shownRevision.current = next.revision;
    // Frames come from the engine alone; keep the shell's history and
    // recovery flags from the last reply.
    setS((shown) => ({ ...shown, ...next.session }));
  };

  async function run<C extends Command>(
    c: C,
    change = true,
  ): Promise<CommandResult<C> | undefined> {
    const previous = s,
      optimistic = optimisticSession(s, c),
      revision = optimistic ? ++optimisticRevision.current : 0;
    if (optimistic) setS(optimistic);
    if (c.op === "seek") previewPosition(Math.max(0, c.position));
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
      showWaiting();
    }
  }

  async function withBusy<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function task(
    fn: () => Promise<EngineState | SaveResult | null>,
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

  // Read the session once it is ready (the shell restores recovery first),
  // then follow the engine stream.
  useEffect(() => {
    let alive = true;
    const receive = (frame: EngineFrame) => {
      if (!alive) return;
      if (frame.event === "failed") {
        setError(frame.error);
        return;
      }
      acceptLive(frame.live, frame.revision);
      if (frame.session) {
        waiting.current = { session: frame.session, revision: frame.revision };
        showWaiting();
      }
    };
    void (async () => {
      try {
        const first = await api.command({ op: "state" });
        if (!alive) return;
        accept(first);
        setStarting(false);
        await api.watchEngine(receive);
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return {
    s,
    setS,
    accept,
    error,
    setError,
    busy,
    dirty,
    setDirty,
    starting,
    seekRevision,
    projectRevision,
    run,
    withBusy,
    task,
  };
}

export type EngineSession = ReturnType<typeof useEngineSession>;
