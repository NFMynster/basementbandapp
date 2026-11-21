import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  Command,
  CommandResult,
  Devices,
  SaveResult,
  Session,
} from "../../models";
import { desktop as api } from "../../services/desktop";
import { errorMessage } from "../../services/errors";
import { setMeterLevels } from "../../services/meterAnimator";
import {
  optimisticSession,
  sessionChanged,
} from "../../services/session-updates";
import type { Notices } from "./useNotices";

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

/**
 * The renderer's copy of the engine session and the one pipeline that changes
 * it: optimistic commands (`run`), busy file tasks (`task`) and state polling.
 * Engine replies stay authoritative over optimistic previews.
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
  const polling = useRef(false),
    editing = useRef(false),
    activeCommands = useRef(0),
    optimisticRevision = useRef(0),
    // The session on screen and when a poll last replaced it.
    shown = useRef(s),
    lastPollRender = useRef(0);
  useLayoutEffect(() => {
    shown.current = s;
  }, [s]);

  const accept = (v: Session | Devices | SaveResult | null) => {
    if (v && "tracks" in v) {
      setMeterLevels(v);
      setS(v);
      if (v.recoveryError) setError(v.recoveryError);
    }
  };

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

  // Poll engine state while no command or file task is in flight.
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
          // Most polls change only live values on screen: meters take their
          // levels directly, the render is skipped, and it still refreshes
          // once a second for the averaged audio load.
          const now = performance.now();
          if (
            sessionChanged(shown.current, v) ||
            now - lastPollRender.current >= 1000
          ) {
            lastPollRender.current = now;
            accept(v);
          } else setMeterLevels(v);
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

  return {
    s,
    setS,
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
