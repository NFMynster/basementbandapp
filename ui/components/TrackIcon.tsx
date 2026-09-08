import { AudioLines, Guitar, Drum, Piano, Mic2, Music2 } from "lucide-react";
export const trackIcons = {
  guitar: Guitar,
  bass: Music2,
  drums: Drum,
  keys: Piano,
  mic: Mic2,
  audio: AudioLines,
};
export function TrackIcon({
  icon = "guitar",
  size = 27,
}: {
  icon?: string;
  size?: number;
}) {
  const Icon = trackIcons[icon as keyof typeof trackIcons] || AudioLines;
  return <Icon size={size} />;
}
