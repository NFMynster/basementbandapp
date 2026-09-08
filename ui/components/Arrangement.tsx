import { LevelSlider } from "./LevelSlider";
import { useAnimatedPlayhead } from "../hooks/useAnimatedPlayhead";
import type React from "react";
import { useState, useCallback, useLayoutEffect, useRef } from "react";
import { ContextMenu } from "./ContextMenu";
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
  const [menu, setMenu] = useState<{
    id?: string;
    x: number;
    y: number;
    position?: number;
  } | null>(null);
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
  const zoomScroll = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (zoomScroll.current !== null && timelineScroll.current) {
      timelineScroll.current.scrollLeft = zoomScroll.current;
      zoomScroll.current = null;
    }
    const view = timelineScroll.current;
    if (!view) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const x = e.clientX - view.getBoundingClientRect().left;
      const next = Math.max(
        40,
        Math.min(
          200,
          zoom * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.004)),
        ),
      );
      zoomScroll.current = Math.max(
        0,
        ((view.scrollLeft + x) / zoom) * next - x,
      );
      setZoom(next);
    };
    view.addEventListener("wheel", wheel, { passive: false });
    return () => view.removeEventListener("wheel", wheel);
  }, [zoom]);
  useLayoutEffect(() => {
    const timeline = timelineScroll.current,
      sidebar = trackList.current;
    if (!timeline || !sidebar) return;
    const fromTimeline = () => {
      if (sidebar.scrollTop !== timeline.scrollTop)
        sidebar.scrollTop = timeline.scrollTop;
      setScrollY(timeline.scrollTop);
    };
    const fromSidebar = () => {
      if (timeline.scrollTop !== sidebar.scrollTop)
        timeline.scrollTop = sidebar.scrollTop;
      setScrollY(sidebar.scrollTop);
    };
    timeline.addEventListener("scroll", fromTimeline, { passive: true });
    sidebar.addEventListener("scroll", fromSidebar, { passive: true });
    const resize = new ResizeObserver(() => {
      sidebar.style.setProperty(
        "--track-tail-height",
        Math.max(0, 180 + sidebar.clientHeight - timeline.clientHeight) + "px",
      );
    });
    resize.observe(timeline);
    resize.observe(sidebar);
    return () => {
      resize.disconnect();
      timeline.removeEventListener("scroll", fromTimeline);
      sidebar.removeEventListener("scroll", fromSidebar);
    };
  }, []);
  const playhead = useAnimatedPlayhead(s, pxPerSecond, controller.dragPosition);
  const selectedClip = track?.clips.find((c) => c.id === controller.clipId);
  const selectedTakes = selectedClip?.takeGroup
    ? track!.clips.filter((c) => c.takeGroup === selectedClip.takeGroup)
    : [];
  const atPointer = (e: React.MouseEvent<HTMLElement>) =>
    Math.max(
      0,
      Math.round(
        (e.clientX - e.currentTarget.getBoundingClientRect().left) /
          pxPerSecond /
          (60 / s.tempo),
      ) *
        (60 / s.tempo),
    );
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
          {selectedTakes.length > 1 && (
            <select
              className="selected-take"
              aria-label="Selected region take"
              value={selectedClip!.id}
              disabled={s.recording}
              onChange={(e) => {
                controller.setClipId(e.target.value);
                run({
                  op: "editClip",
                  track: track!.id,
                  clip: e.target.value,
                  action: "take",
                });
              }}
            >
              {selectedTakes.map((take) => (
                <option key={take.id} value={take.id}>
                  Take {take.take} of {selectedTakes.length}
                </option>
              ))}
            </select>
          )}
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
        <div
          className="track-sidebar"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void controller.dropAudio(Array.from(e.dataTransfer.files));
          }}
        >
          <aside className="track-list" ref={trackList}>
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
                  setMenu({
                    id: t.id,
                    x: e.clientX,
                    y: e.clientY,
                    position: s.position,
                  });
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (
                    e.key === "ContextMenu" ||
                    (e.shiftKey && e.key === "F10")
                  ) {
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    setMenu({
                      id: t.id,
                      x: r.left + 30,
                      y: r.top + 30,
                      position: s.position,
                    });
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
                    <button
                      title="Monitor live input · use headphones to avoid feedback"
                      aria-label={`Monitor ${t.name}`}
                      aria-pressed={!!t.monitor}
                      className={t.monitor ? "solo" : ""}
                      onClick={() => update(t, { monitor: !t.monitor })}
                    >
                      <Headphones size={12} />
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
                    <LevelSlider
                      label={`${t.name} volume`}
                      value={t.gain}
                      max={1.5}
                      peak={t.peak}
                      onChange={(gain, historyGroup) =>
                        update(t, { gain, historyGroup })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="track-list-tail">
              <button
                className="add-track"
                disabled={s.recording}
                onClick={controller.openCreateTrack}
              >
                <Plus size={17} />
                Add track
              </button>
            </div>
          </aside>
        </div>
        <div className="timeline-scroll" ref={timelineScroll}>
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
              {loop.end > loop.start && (
                <div
                  className={
                    "cycle-region " +
                    (!s.looping && !selection ? "inactive" : "")
                  }
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
                    void controller.dropAudio(
                      Array.from(e.dataTransfer.files),
                      t.id,
                    );
                  }}
                  className={"lane " + (t.id === track?.id ? "selected" : "")}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelected(t.id);
                    setMenu({
                      id: t.id,
                      x: e.clientX,
                      y: e.clientY,
                      position: atPointer(e),
                    });
                  }}
                  onDoubleClick={(e) => {
                    if (e.target === e.currentTarget) {
                      controller.openProperties(t.id);
                    }
                  }}
                  onClick={() => {
                    setSelected(t.id);
                    controller.setClipId("");
                  }}
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
                onClick={() => controller.setClipId("")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({
                    x: e.clientX,
                    y: e.clientY,
                    position: atPointer(e),
                  });
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  void controller.dropAudio(Array.from(e.dataTransfer.files));
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
              ref={playhead}
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
      {menu && !menu.id && (
        <ContextMenu
          label="Timeline actions"
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
        >
          <button
            role="menuitem"
            disabled={s.recording || controller.busy}
            onClick={() => {
              closeMenu();
              void task(() => api.importAudio(undefined, menu.position));
            }}
          >
            Add audio file…
          </button>
        </ContextMenu>
      )}
      {menu && s.tracks.find((t) => t.id === menu.id) && (
        <TrackMenu
          track={s.tracks.find((t) => t.id === menu.id)!}
          x={menu.x}
          y={menu.y}
          position={menu.position}
          onClose={closeMenu}
          controller={controller}
        />
      )}
    </>
  );
}
