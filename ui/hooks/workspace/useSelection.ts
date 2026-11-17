import { useEffect, useRef, useState } from "react";
import type { Session, Track } from "../../models";

export function trackContainingClip(tracks: Track[], clipId: string) {
  return tracks.find((candidate) =>
    candidate.clips.some((clip) => clip.id === clipId),
  );
}

/**
 * The selected track, the primary region and the multi-region selection.
 * A newly added track becomes selected and scrolls into view.
 */
export function useSelection(s: Session, starting: boolean) {
  const [selected, setSelected] = useState(""),
    [clipId, setPrimaryClipId] = useState(""),
    [regionIds, setRegionIds] = useState<string[]>([]),
    [regionMove, setRegionMove] = useState<number | null>(null),
    [trackPing, setTrackPing] = useState("");
  const track = s.tracks.find((t) => t.id === selected) || s.tracks[0];

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

  // Select and reveal a newly added track; other edits leave selection alone.
  const previousTracks = useRef<string[] | null>(null);
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

  return {
    selected,
    setSelected,
    track,
    clipId,
    setClipId,
    regionIds,
    selectRegion,
    selectRegions,
    selectedRegions,
    regionMove,
    setRegionMove,
    trackPing,
  };
}

export type Selection = ReturnType<typeof useSelection>;
