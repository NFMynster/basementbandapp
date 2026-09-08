import type React from "react";
import { useState, useCallback } from "react";
import { TrackMenu } from "./TrackMenu";
import { SessionName } from "./SessionName";
import { ClipRegion } from "./ClipRegion";
import { TrackIcon } from "./TrackIcon";
import { Headphones, Plus, ZoomIn, ZoomOut } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { desktop as api } from "../services/desktop";
export function Arrangement({
  controller,
}: {
  controller: WorkspaceController;
}) {
  const [scrollY, setScrollY] = useState(0);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  const {
    s,
    track,
    setSelected,
    run,
    update,
    zoom,
    setZoom,
    trackList,
    timelineScroll,
    width,
    rulerDown,
    rulerMove,
    rulerUp,
    selection,
    loop,
    pxPerSecond,
    task,
  } = controller;
  return (
    <>
      <div className="workspace-toolbar">
        <div className="workspace-label">
          <SessionName controller={controller} />
        </div>
        <span className="session-summary">
          {s.tracks.length} tracks{controller.dirty ? " · Unsaved" : ""}
        </span>
        <div className="toolbar-right">
          <span className="snap-label">Snap: beat</span>
          <button
            title="Zoom out"
            onClick={() => setZoom(Math.max(40, zoom - 16))}
          >
            <ZoomOut size={15} />
          </button>
          <input
            aria-label="Timeline zoom"
            type="range"
            min="40"
            max="200"
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          />
          <button
            title="Zoom in"
            onClick={() => setZoom(Math.min(200, zoom + 16))}
          >
            <ZoomIn size={15} />
          </button>
        </div>
      </div>
      <main className="arrangement">
        <aside
          className="track-list"
          ref={trackList}
          onScroll={(e) => {
            setScrollY(e.currentTarget.scrollTop);
            if (
              timelineScroll.current &&
              timelineScroll.current.scrollTop !== e.currentTarget.scrollTop
            )
              timelineScroll.current.scrollTop = e.currentTarget.scrollTop;
          }}
        >
          <div className="track-list-title">
            TRACKS
            <button
              title="Add track"
              disabled={s.recording}
              onClick={controller.openCreateTrack}
            >
              <Plus size={17} />
            </button>
          </div>
          {s.tracks.map((t, i) => (
            <div
              key={t.id}
              data-track-header={t.id}
              className={
                "track-header " + (track?.id === t.id ? "selected" : "")
              }
              style={{ "--track-color": t.color } as React.CSSProperties}
              onClick={() => setSelected(t.id)}
              tabIndex={0}
              onDoubleClick={() => {
                controller.openProperties(t.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setSelected(t.id);
                setMenu({ id: t.id, x: e.clientX, y: e.clientY });
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter") {
                  controller.openProperties(t.id);
                }
                if (
                  e.key === "ContextMenu" ||
                  (e.shiftKey && e.key === "F10")
                ) {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenu({ id: t.id, x: r.left + 30, y: r.top + 30 });
                }
              }}
            >
              {controller.trackPing === t.id && (
                <span className="properties-ping" aria-hidden="true" />
              )}
              <span className="track-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="instrument">
                <TrackIcon
                  icon={
                    t.icon ||
                    (t.kind === "midi" ? "keys" : i === 1 ? "bass" : "guitar")
                  }
                />
              </div>
              <div className="track-info">
                <div className="track-name">
                  {t.name}
                  <span>{t.kind === "midi" ? "MIDI" : "MONO"}</span>
                </div>
                <div className="track-buttons">
                  <button
                    aria-label={`Mark ${t.name} for recording`}
                    title="Mark for recording"
                    className={t.armed ? "armed" : ""}
                    disabled={s.recording}
                    onClick={() => update(t, { armed: !t.armed })}
                  >
                    R
                  </button>
                  <button
                    title="Mute"
                    className={t.mute ? "muted" : ""}
                    onClick={() => update(t, { mute: !t.mute })}
                  >
                    M
                  </button>
                  <button
                    title="Solo"
                    className={t.solo ? "solo" : ""}
                    onClick={() => update(t, { solo: !t.solo })}
                  >
                    S
                  </button>
                  <span className="input-label">
                    {t.kind === "midi"
                      ? t.midiChannel
                        ? `Ch ${t.midiChannel}`
                        : "All ch"
                      : `In ${t.input + 1}`}
                  </span>
                </div>
                <div className="track-volume">
                  <input
                    aria-label={`${t.name} volume`}
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.01"
                    value={t.gain}
                    onChange={(e) => update(t, { gain: +e.target.value })}
                  />
                  <div className="tiny-meter">
                    <i style={{ width: `${Math.min(100, t.peak * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button
            className="add-track"
            disabled={s.recording}
            onClick={controller.openCreateTrack}
          >
            <Plus size={17} />
            Add track
          </button>
          <div className="track-list-bottom">
            <Headphones size={16} />
            <span>Made for playing together.</span>
          </div>
        </aside>
        <div
          className="timeline-scroll"
          ref={timelineScroll}
          onScroll={(e) => {
            if (
              trackList.current &&
              trackList.current.scrollTop !== e.currentTarget.scrollTop
            )
              trackList.current.scrollTop = e.currentTarget.scrollTop;
          }}
        >
          <div className="timeline" style={{ width, minHeight: "100%" }}>
            <div
              className="ruler"
              style={{ "--bar-width": zoom + "px" } as React.CSSProperties}
              onPointerDown={rulerDown}
              onPointerMove={rulerMove}
              onPointerUp={rulerUp}
              onPointerCancel={controller.rulerCancel}
              title="Top: select a loop. Bottom: move the playhead."
            >
              <div
                className="ruler-zone ruler-loop"
                data-ruler-zone="loop"
                title="Drag to select a loop"
              />
              <div
                className="ruler-zone ruler-seek"
                data-ruler-zone="seek"
                title="Click or drag to move the playhead"
              />
              {Array.from({ length: Math.ceil(width / zoom) }, (_, i) => (
                <span key={i} style={{ left: i * zoom, width: zoom }}>
                  {i + 1}
                </span>
              ))}
              {(s.looping || selection) && (
                <div
                  className="cycle-region"
                  style={{
                    left: loop.start * pxPerSecond,
                    width: (loop.end - loop.start) * pxPerSecond,
                  }}
                ></div>
              )}
            </div>
            <div
              className="lanes"
              style={{ "--bar-width": zoom + "px" } as React.CSSProperties}
            >
              {s.tracks.map((t) => (
                <div
                  key={t.id}
                  data-lane={t.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    task(() =>
                      api.dropFiles(Array.from(e.dataTransfer.files), t.id),
                    );
                  }}
                  className={"lane " + (t.id === track?.id ? "selected" : "")}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelected(t.id);
                    setMenu({ id: t.id, x: e.clientX, y: e.clientY });
                  }}
                  onDoubleClick={(e) => {
                    if (e.target === e.currentTarget) {
                      controller.openProperties(t.id);
                    }
                  }}
                  onClick={() => setSelected(t.id)}
                >
                  {t.clips
                    .filter((c) => c.active !== false)
                    .map((c) => (
                      <ClipRegion
                        key={c.id}
                        clip={c}
                        track={t}
                        controller={controller}
                      />
                    ))}
                  {s.recording && t.armed && (
                    <div
                      className="recording-region"
                      style={{
                        left: t.recordStart * pxPerSecond,
                        width: Math.max(
                          10,
                          (s.position - t.recordStart) * pxPerSecond,
                        ),
                      }}
                    >
                      Recording…
                    </div>
                  )}
                </div>
              ))}
              <div
                className="empty-grid"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  task(() => api.dropFiles(Array.from(e.dataTransfer.files)));
                }}
              >
                <span>Drop audio or MIDI files here to create tracks</span>
              </div>
            </div>
            <div
              className={"playhead " + (s.recording ? "red" : "")}
              style={{
                top: scrollY + 25,
                left: (controller.dragPosition ?? s.position) * pxPerSecond,
              }}
              role="slider"
              aria-label="Playhead"
              aria-valuemin={0}
              aria-valuemax={width / pxPerSecond}
              aria-valuenow={controller.dragPosition ?? s.position}
              aria-disabled={s.recording}
              tabIndex={0}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                if (s.recording || e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                controller.setDragPosition(s.position);
              }}
              onPointerMove={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                const r =
                  e.currentTarget.parentElement!.getBoundingClientRect();
                controller.setDragPosition(
                  Math.max(0, Math.min(width, e.clientX - r.left)) /
                    pxPerSecond,
                );
              }}
              onPointerUp={(e) => {
                if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                e.currentTarget.releasePointerCapture(e.pointerId);
                const rect =
                  e.currentTarget.parentElement!.getBoundingClientRect();
                const position =
                  Math.max(0, Math.min(width, e.clientX - rect.left)) /
                  pxPerSecond;
                void run({ op: "seek", position }, false).finally(() =>
                  controller.setDragPosition(null),
                );
              }}
              onPointerCancel={() => controller.setDragPosition(null)}
              onKeyDown={(e) => {
                if (
                  s.recording ||
                  !["ArrowLeft", "ArrowRight", "Home"].includes(e.key)
                )
                  return;
                e.preventDefault();
                e.stopPropagation();
                run(
                  {
                    op: "seek",
                    position:
                      e.key === "Home"
                        ? 0
                        : Math.max(
                            0,
                            s.position +
                              ((e.key === "ArrowRight" ? 1 : -1) * 60) /
                                s.tempo,
                          ),
                  },
                  false,
                );
              }}
            >
              <span />
            </div>
          </div>
        </div>
      </main>
      {menu && s.tracks.find((t) => t.id === menu.id) && (
        <TrackMenu
          track={s.tracks.find((t) => t.id === menu.id)!}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          controller={controller}
        />
      )}
    </>
  );
}
