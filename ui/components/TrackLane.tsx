import type { MouseEvent } from "react";
import type { Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { ClipRegion } from "./ClipRegion";
import { RecordingPreview } from "./RecordingPreview";

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
      onDoubleClick={async (event) => {
        if (event.target !== event.currentTarget) return;
        if (track.kind !== "midi") {
          openProperties(track.id);
          return;
        }
        if (s.recording || controller.busy) return;
        const at = Math.max(
          0,
          Math.round(
            (event.clientX - event.currentTarget.getBoundingClientRect().left) /
              pxPerSecond /
              (60 / s.tempo),
          ) *
            (60 / s.tempo),
        );
        const result = await controller.run({
          op: "createMidi",
          track: track.id,
          position: at,
          length: 960 / s.tempo,
        });
        const created = result?.tracks
          .find((t) => t.id === track.id)
          ?.clips.at(-1);
        if (created) {
          setSelected(track.id);
          setClipId(created.id);
          controller.setPanel("notes");
        }
      }}
      onClick={() => {
        setSelected(track.id);
        setClipId("");
      }}
    >
      {track.clips
        .filter((clip) => clip.active)
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
            width: Math.max(
              10,
              (track.recordingPreview?.duration ??
                s.position - track.recordStart) * pxPerSecond,
            ),
          }}
        >
          <span>Recording…</span>
          {track.recordingPreview && (
            <RecordingPreview preview={track.recordingPreview} />
          )}
        </div>
      )}
    </div>
  );
}
