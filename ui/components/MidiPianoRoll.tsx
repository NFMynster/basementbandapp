import type { MidiEditorController } from "../hooks/useMidiEditor";
const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const name = (n: number) => `${names[n % 12]}${Math.floor(n / 12) - 1}`;
export function MidiPianoRoll({ editor }: { editor: MidiEditorController }) {
  const {
    scroll,
    high,
    low,
    viewportWidth,
    tempo,
    position,
    seekKeyDown,
    px,
    row,
    playhead,
    beginSeek,
    moveSeek,
    endSeek,
    cancelSeek,
    unavailable,
    clip,
    notes,
    selection,
    preview,
    draw,
    marquee,
    gridDoubleClick,
    gridPointerDown,
    gridPointerMove,
    gridPointerUp,
    gridPointerCancel,
    noteKeyDown,
    notePointerDown,
    notePointerMove,
    notePointerUp,
    notePointerCancel,
  } = editor;
  if (!clip) return null;
  return (
    <div className="piano-scroll" ref={scroll}>
      <div
        className={`piano-grid ${draw ? "drawing" : ""}`}
        tabIndex={0}
        aria-label="MIDI note grid"
        style={{
          width: Math.max(viewportWidth, Math.round(clip.duration * px + 60)),
          height: (high - low + 1) * row + 24,
        }}
        onDoubleClick={gridDoubleClick}
        onPointerDown={gridPointerDown}
        onPointerMove={gridPointerMove}
        onPointerUp={gridPointerUp}
        onPointerCancel={gridPointerCancel}
      >
        <div
          className="note-ruler"
          role="slider"
          tabIndex={0}
          aria-label="MIDI playhead"
          aria-valuemin={0}
          aria-valuemax={clip.duration}
          aria-valuenow={Math.max(
            0,
            Math.min(clip.duration, position - clip.start),
          )}
          aria-disabled={unavailable}
          title="Click or drag to move the playhead"
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={beginSeek}
          onPointerMove={moveSeek}
          onPointerUp={endSeek}
          onPointerCancel={cancelSeek}
          onLostPointerCapture={cancelSeek}
          onKeyDown={seekKeyDown}
        >
          {Array.from(
            { length: Math.ceil(clip.duration / (60 / tempo)) },
            (_, i) =>
              i % Math.max(1, Math.ceil(36 / (px * (60 / tempo)))) === 0 && (
                <span key={i} style={{ left: 60 + i * px * (60 / tempo) }}>
                  {Math.floor(i / 4) + 1}.{(i % 4) + 1}
                </span>
              ),
          )}
        </div>
        {Array.from({ length: high - low + 1 }, (_, i) => (
          <div
            key={i}
            className={`piano-row ${[1, 3, 6, 8, 10].includes((high - i) % 12) ? "black-key" : ""}`}
            style={{
              top: i * row + 24,
              backgroundSize: `${px * (60 / tempo)}px 100%`,
            }}
          >
            <span>{name(high - i)}</span>
          </div>
        ))}
        <div
          ref={playhead}
          className="midi-playhead"
          onDoubleClick={(e) => e.stopPropagation()}
          aria-hidden="true"
          onPointerDown={beginSeek}
          onPointerMove={moveSeek}
          onPointerUp={endSeek}
          onPointerCancel={cancelSeek}
          onLostPointerCapture={cancelSeek}
        />
        {notes.map((n) => {
          const current = preview?.find((p) => p.event === n.event) ?? n;
          return (
            <button
              key={n.event}
              className={`piano-note ${n.event !== undefined && selection.includes(n.event) ? "selected" : ""}`}
              disabled={unavailable || n.event === undefined}
              aria-label={`${name(current.note)}, ${current.start.toFixed(2)} seconds, velocity ${current.velocity ?? 100}`}
              style={{
                left: 60 + current.start * px,
                top: 25 + (high - current.note) * row,
                width: Math.max(8, current.duration * px),
                height: row - 2,
                opacity: 0.55 + ((current.velocity ?? 100) / 127) * 0.45,
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => noteKeyDown(n, e)}
              onPointerDown={(e) => notePointerDown(n, e)}
              onPointerMove={(e) => notePointerMove(e)}
              onPointerUp={(e) => notePointerUp(e)}
              onPointerCancel={() => notePointerCancel()}
            >
              {name(current.note)}
              <i aria-hidden="true" />
            </button>
          );
        })}
        {marquee && (
          <div
            className="note-marquee"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
            }}
          />
        )}
      </div>
    </div>
  );
}
