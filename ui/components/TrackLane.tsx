import type { MouseEvent } from "react";
import type { Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { ClipRegion } from "./ClipRegion";

export function TrackLane({
  track,
  selected,
  controller,
  onMenu,
}: {
  track: Track;
  selected: boolean;
  controller: WorkspaceController;
  onMenu: (event: MouseEvent<HTMLElement>, track: Track) => void;
}) {
  const { s, pxPerSecond, setSelected, setClipId, dropAudio, openProperties } =
    controller;
  return (
    <div
      data-lane={track.id}
      className={"lane " + (selected ? "selected" : "")}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void dropAudio(Array.from(event.dataTransfer.files), track.id);
      }}
      onContextMenu={(event) => onMenu(event, track)}
      onDoubleClick={(event) => {
        if (event.target === event.currentTarget) openProperties(track.id);
      }}
      onClick={() => {
        setSelected(track.id);
        setClipId("");
      }}
    >
      {track.clips
        .filter((clip) => clip.active !== false)
        .map((clip) => (
          <ClipRegion
            key={clip.id}
            clip={clip}
            track={track}
            controller={controller}
          />
        ))}
      {s.recording && track.armed && (
        <div
          className="recording-region"
          style={{
            left: track.recordStart * pxPerSecond,
            width: Math.max(10, (s.position - track.recordStart) * pxPerSecond),
          }}
        >
          Recording…
        </div>
      )}
    </div>
  );
}
