import type { MouseEvent } from "react";
import type { Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { ClipRegion } from "./ClipRegion";
import { RecordingPreview } from "./RecordingPreview";
import { useLive } from "../services/liveState";

/** The take being recorded on a lane, growing with each live frame. */
function RecordingRegion({
  track,
  pxPerSecond,
}: {
  track: Track;
  pxPerSecond: number;
}) {
  const preview = useLive((live) => live.tracks[track.id]?.recordingPreview);
  // Before the first preview arrives, grow with the transport.
  const elapsed = useLive((live) =>
    preview ? 0 : live.position - track.recordStart,
  );
  return (
    <div
      className="recording-region"
      style={{
        left: track.recordStart * pxPerSecond,
        width: Math.max(10, (preview?.duration ?? elapsed) * pxPerSecond),
      }}
    >
      <span>Recording…</span>
      {preview && <RecordingPreview preview={preview} />}
    </div>
  );
}

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
  const { s, pxPerSecond, setSelected, setClipId, openProperties } = controller;
  return (
    <div
      data-lane={track.id}
      data-file-drop="audio"
      data-file-drop-track={track.id}
      className={"lane " + (selected ? "selected" : "")}
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
      {s.recording && !s.countdown && track.armed && (
        <RecordingRegion track={track} pxPerSecond={pxPerSecond} />
      )}
    </div>
  );
}
