import type { Track } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { desktop as api } from "../services/desktop";
import { ContextMenu } from "./ContextMenu";
export function TrackMenu({
  track,
  x,
  y,
  position,
  onClose,
  controller,
}: {
  track: Track;
  x: number;
  y: number;
  position?: number;
  onClose: () => void;
  controller: WorkspaceController;
}) {
  const act = (action: () => void) => {
    onClose();
    action();
  };
  return (
    <ContextMenu label={`${track.name} actions`} x={x} y={y} onClose={onClose}>
      <button
        role="menuitem"
        disabled={
          controller.s.playing ||
          controller.busy ||
          controller.s.tracks.length >= 32
        }
        onClick={() =>
          act(() => {
            void controller.run({ op: "duplicateTrack", track: track.id });
          })
        }
      >
        Duplicate track
      </button>
      <button
        role="menuitem"
        disabled={controller.s.recording || controller.busy}
        onClick={() =>
          act(() => {
            void controller.task(() => api.importAudio(track.id, position));
          })
        }
      >
        {track.kind === "midi" ? "Add MIDI file…" : "Add audio file…"}
      </button>
      <button
        role="menuitem"
        onClick={() =>
          act(() => {
            controller.openProperties(track.id);
          })
        }
      >
        Properties
      </button>
      <button
        role="menuitem"
        disabled={
          controller.busy || controller.s.playing || !track.clips.length
        }
        onClick={() =>
          act(() => {
            void controller.exportAudio(track.id);
          })
        }
      >
        Export track…
      </button>
      <button
        role="menuitem"
        className="danger"
        disabled={controller.s.playing || controller.busy}
        onClick={(event) =>
          act(async () => {
            if (
              event.shiftKey ||
              (await controller.confirmAction(
                `Delete ${track.name} from this session? Recorded audio files will be kept. Hold Shift while clicking Delete track to skip this confirmation.`,
                "Delete track",
              ))
            )
              void controller.removeTrack(track);
          })
        }
      >
        Delete track
      </button>
    </ContextMenu>
  );
}
