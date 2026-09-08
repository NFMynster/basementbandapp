import { AudioLines, Guitar, Drum, Piano, Mic2, Music2 } from "lucide-react";
import type { TrackIconName } from "../models";
export const trackIcons = {
  guitar: Guitar,
  bass: Music2,
  drums: Drum,
  keys: Piano,
  mic: Mic2,
  audio: AudioLines,
};
export function TrackIcon({
  icon,
  size = 27,
}: {
  icon: TrackIconName;
  size?: number;
}) {
  const Icon = trackIcons[icon];
  return <Icon size={size} />;
}
