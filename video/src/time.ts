import {
  Easing,
  interpolate,
  spring,
  type SpringConfig,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// Scenes are timed in seconds so the frame rate can change without retiming.
export const useTime = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return {
    t: frame / fps,
    // A spring that starts `delay` seconds into the scene.
    springAt: (
      delay: number,
      config: Partial<SpringConfig> = { damping: 200 },
      duration?: number,
    ) =>
      spring({
        frame: frame - Math.round(delay * fps),
        fps,
        config,
        durationInFrames:
          duration === undefined ? undefined : Math.round(duration * fps),
      }),
  };
};

export const ramp = (
  t: number,
  input: number[],
  output: number[],
  easing = Easing.inOut(Easing.cubic),
) =>
  interpolate(t, input, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

// 0 → 1 → 0: fades in at `from`, out at `to`.
export const window01 = (t: number, from: number, to: number, fade = 0.25) =>
  interpolate(t, [from, from + fade, to - fade, to], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
