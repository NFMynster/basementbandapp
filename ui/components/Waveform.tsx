export function Waveform({ peaks }: { peaks: number[] }) {
  const points =
    peaks
      .map(
        (p, i) => `${(i / peaks.length) * 1000},${24 - Math.max(0.5, p * 22)}`,
      )
      .join(" ") +
    " " +
    peaks
      .map((_, i) => {
        const k = peaks.length - 1 - i;
        return `${(k / peaks.length) * 1000},${24 + Math.max(0.5, peaks[k] * 22)}`;
      })
      .join(" ");
  return (
    <svg viewBox="0 0 1000 48" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={points} />
    </svg>
  );
}
