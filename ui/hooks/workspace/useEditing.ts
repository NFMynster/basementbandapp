import { useEffect, useEffectEvent, useState } from "react";
import type { Clip, Track, TrackPatch } from "../../models";
import { desktop as api } from "../../services/desktop";
import { listenForFileDrops } from "../../services/fileDrop";
import type { EngineSession } from "./useEngineSession";
import type { Notices } from "./useNotices";
import { trackContainingClip, type Selection } from "./useSelection";
import { timelineViewport, type Timeline } from "./useTimeline";

/**
 * Track and region edits. Deletions update the view immediately and roll back
 * (session, dirty flag and selection) when the engine rejects them.
 */
export function useEditing({
  session,
  selection,
  timeline,
  setNotice,
}: {
  session: EngineSession;
  selection: Selection;
  timeline: Pick<Timeline, "timelineScroll" | "pxPerSecond">;
  setNotice: Notices["setNotice"];
}) {
  const { s, setS, run, task, busy, dirty, setDirty } = session;
  const {
    selected,
    setSelected,
    track,
    clipId,
    setClipId,
    selectRegions,
    selectedRegions,
    setRegionMove,
  } = selection;
  const { timelineScroll, pxPerSecond } = timeline;
  const [clipboard, setClipboard] = useState<{
    track: string;
    clip: string;
  } | null>(null);

  const update = (t: Track, c: TrackPatch) =>
    run({ op: "track", track: t.id, ...c });

  function copyRegion(track: string, clip: string) {
    setClipboard({ track, clip });
    setNotice("Region copied. Paste at the playhead.");
  }
  function editSelected(action: "split" | "copy" | "move", source = clipboard) {
    const regionTrack = trackContainingClip(s.tracks, clipId);
    const target =
      action === "copy"
        ? source
        : regionTrack
          ? { track: regionTrack.id, clip: clipId }
          : null;
    if (target)
      return run({
        op: "editClip",
        ...target,
        action,
        position: s.position,
        target: track?.id,
      });
  }

  async function deleteRegions() {
    if (s.recording || busy || !selectedRegions.length) return;
    const result = await run({
      op: "editRegions",
      action: "delete",
      regions: selectedRegions,
    });
    if (result) {
      selectRegions([]);
      setNotice(
        selectedRegions.length === 1
          ? "Deleted the region."
          : `Deleted ${selectedRegions.length} regions.`,
        "warning",
      );
    }
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

  async function dropAudio(paths: string[], target?: string) {
    const at = s.position;
    const result = await task(() => api.dropFiles(paths, target));
    if (!result) return;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const view = timelineScroll.current;
    view?.scrollTo({
      left: Math.max(0, at * pxPerSecond - timelineViewport(view).width * 0.2),
      behavior: "smooth",
    });
  }

  // Files dragged in from the desktop: audio and MIDI onto the arrangement
  // or a lane, VST3 plug-ins onto the selected track's Plug-ins panel.
  const onFileDrop = useEffectEvent(
    (paths: string[], target: { kind: string; track?: string }) => {
      if (target.kind === "plugin") {
        if (target.track)
          void task(() => api.dropFiles(paths, target.track, true));
      } else void dropAudio(paths, target.track);
    },
  );
  useEffect(() => listenForFileDrops(onFileDrop), []);

  return {
    update,
    clipboard,
    copyRegion,
    editSelected,
    deleteRegions,
    moveRegions,
    removeTrack,
    removeClip,
    createTrackLike,
    dropAudio,
  };
}
