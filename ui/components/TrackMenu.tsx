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
        disabled={controller.s.playing || !track.clips.length}
        onClick={() => act(() => controller.setExportTarget(track.id))}
      >
        Export track…
      </button>
      <button
        role="menuitem"
        className="danger"
        disabled={controller.s.playing}
        onClick={() =>
          act(() => {
            if (
              confirm(
                `Delete ${track.name} from this session? Recorded audio files will be kept.`,
              )
            )
              controller.run({ op: "removeTrack", track: track.id });
          })
        }
      >
        Delete track
      </button>
    </ContextMenu>
  );
}
