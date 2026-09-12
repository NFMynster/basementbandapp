import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Session } from "../models";
import { desktop as api } from "../services/desktop";
type Options = {
  session: Pick<Session, "playing" | "tracks">;
  busy: boolean;
  withBusy: <T>(action: () => Promise<T>) => Promise<T | undefined>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
};
export function useExport({
  session: s,
  busy,
  withBusy,
  setError,
  setNotice,
}: Options) {
  const [exporting, setExporting] = useState(false);
  const exportReturnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (exporting || !exportReturnFocus.current) return;
    const previous = exportReturnFocus.current;
    exportReturnFocus.current = null;
    const modal = document.querySelector<HTMLElement>('.modal[role="dialog"]');
    if (!modal) return;
    const target =
      previous.isConnected &&
      modal.contains(previous) &&
      !previous.matches(":disabled")
        ? previous
        : modal.querySelector<HTMLElement>("button:not(:disabled)");
    target?.focus({ preventScroll: true });
  }, [exporting]);
  const [midiExportTrack, setMidiExportTrack] = useState<string | null>(null);
  const [exportMidi, setExportMidi] = useState<"audio" | "midi">(() =>
    localStorage.getItem("basement.exportMidi") === "midi" ? "midi" : "audio",
  );
  useEffect(
    () => localStorage.setItem("basement.exportMidi", exportMidi),
    [exportMidi],
  );
  const [exportMode, setExportMode] = useState<"separate" | "mix">(() =>
    localStorage.getItem("basement.exportMode") === "mix" ? "mix" : "separate",
  );
  const [exportFormat, setExportFormat] = useState<"wav" | "flac">(() =>
    localStorage.getItem("basement.exportFormat") === "flac" ? "flac" : "wav",
  );
  useEffect(
    () => localStorage.setItem("basement.exportMode", exportMode),
    [exportMode],
  );
  useEffect(
    () => localStorage.setItem("basement.exportFormat", exportFormat),
    [exportFormat],
  );
  async function exportAudio(target?: string, midi?: "audio" | "midi") {
    if (busy || s.playing) return;
    if (
      target &&
      midi === undefined &&
      s.tracks.find((t) => t.id === target)?.kind === "midi"
    ) {
      setError("");
      setMidiExportTrack(target);
      return;
    }
    exportReturnFocus.current = document.activeElement as HTMLElement | null;
    setExporting(true);
    try {
      const result = await withBusy(() =>
        api.exportAudio({
          mode: target ? "separate" : exportMode,
          format: exportFormat,
          midi: midi ?? exportMidi,
          track: target,
        }),
      );
      if (result)
        setNotice(
          `Exported ${result.files.length} file(s) to ${result.folder}`,
        );
      return result;
    } finally {
      setExporting(false);
    }
  }

  return {
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
  };
}
