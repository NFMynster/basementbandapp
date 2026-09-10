export function Waveform({
  peaks,
  peakInterval,
  duration,
}: {
  peaks: number[];
  peakInterval?: number;
  duration?: number;
}) {
  const x = (i: number) =>
    peakInterval && duration
      ? ((i * peakInterval) / duration) * 1000
      : (i / (peaks.length - 1 || 1)) * 1000;
  if (!peaks.length) return null;
  const points =
    peaks.map((p, i) => `${x(i)},${24 - Math.max(0.5, p * 22)}`).join(" ") +
    " " +
    peaks
      .map((_, i) => {
        const k = peaks.length - 1 - i;
        return `${x(k)},${24 + Math.max(0.5, peaks[k] * 22)}`;
      })
      .join(" ");
  return (
    <svg viewBox="0 0 1000 48" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={points} />
    </svg>
  );
}
