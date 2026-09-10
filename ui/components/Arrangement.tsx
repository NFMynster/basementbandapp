import { useAnimatedPlayhead } from "../hooks/useAnimatedPlayhead";
import type React from "react";
import { useState, useCallback, useLayoutEffect, useRef } from "react";
import { ContextMenu } from "./ContextMenu";
import { PanelResize } from "./PanelResize";
import { TrackMenu } from "./TrackMenu";
import { SessionName } from "./SessionName";
import { Plus, ZoomIn, ZoomOut } from "lucide-react";
import type { WorkspaceController } from "../hooks/useWorkspace";
import { desktop as api } from "../services/desktop";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
export function Arrangement({
  controller,
  animateReady = true,
}: {
  controller: WorkspaceController;
  animateReady?: boolean;
}) {
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
  const previousRows = useRef(
    new Map<
      string,
      { node: HTMLElement; parent: HTMLElement; index: number }
    >(),
  );
  const lastProjectRevision = useRef(controller.projectRevision);
  useLayoutEffect(() => {
    if (!animateReady) {
      previousRows.current.clear();
      return;
    }
    if (lastProjectRevision.current !== controller.projectRevision)
      previousRows.current.clear();
    lastProjectRevision.current = controller.projectRevision;
    const next = new Map<
      string,
      { node: HTMLElement; parent: HTMLElement; index: number }
    >();
    const animations: Animation[] = [];
    const ghosts: HTMLElement[] = [];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const currentIds = new Set(s.tracks.map((t) => t.id));
    const removing = [...previousRows.current.keys()].some(
      (key) =>
        key.startsWith("data-track-header") &&
        !currentIds.has(key.slice("data-track-header".length)),
    );
    // Pair each header with its lane. Bound the cascade so large projects
    // become usable quickly, while small projects still enter row by row.
    const entranceStep = Math.min(45, 320 / Math.max(1, s.tracks.length - 1));
    for (const [selector, attribute] of [
      ["[data-track-header]", "data-track-header"],
      ["[data-lane]", "data-lane"],
    ]) {
      const rows = document.querySelectorAll<HTMLElement>(selector);
      let entering = 0;
      rows.forEach((node, index) => {
        const key = attribute + node.getAttribute(attribute);
        const old = previousRows.current.get(key);
        next.set(key, { node, parent: node.parentElement!, index });
        if (reduced) return;
        const distance = old ? (old.index - index) * node.offsetHeight : 8;
        if (!old || distance)
          animations.push(
            node.animate(
              [
                {
                  transform: `translateY(${distance}px)`,
                  opacity: old ? 1 : 0,
                },
                { transform: "translateY(0)", opacity: 1 },
              ],
              {
                duration: old ? 240 : 260,
                delay: old ? (removing ? 130 : 0) : entering++ * entranceStep,
                easing: "cubic-bezier(.22,1,.36,1)",
                // Hold the first frame during the delay; otherwise newly
                // mounted rows flash visible before their entrance starts.
                fill: "backwards",
              },
            ),
          );
      });
    }
    if (!reduced)
      for (const [key, old] of previousRows.current) {
        if (next.has(key) || !old.parent.isConnected) continue;
        const ghost = old.node.cloneNode(true) as HTMLElement;
        ghost.removeAttribute("data-track-header");
        ghost.removeAttribute("data-lane");
        ghost.querySelectorAll("[id], [data-clip]").forEach((n) => {
          n.removeAttribute("id");
          n.removeAttribute("data-clip");
        });
        ghost.inert = true;
        ghost.setAttribute("aria-hidden", "true");
        Object.assign(ghost.style, {
          position: "absolute",
          top: `${old.index * 112 + (key.startsWith("data-track-header") ? 43 : 0)}px`,
          left: "0",
          width: "100%",
          pointerEvents: "none",
          zIndex: "3",
        });
        old.parent.appendChild(ghost);
        ghosts.push(ghost);
        const animation = ghost.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 130,
          easing: "ease-out",
          fill: "forwards",
        });
        animation.onfinish = () => ghost.remove();
        animations.push(animation);
      }
    previousRows.current = next;
    return () => {
      animations.forEach((a) => a.cancel());
      ghosts.forEach((g) => g.remove());
    };
  }, [
    s.tracks.map((t) => t.id).join(","),
    animateReady,
    controller.projectRevision,
  ]);
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
  const playhead = useAnimatedPlayhead(s, pxPerSecond, controller.dragPosition);
  useLayoutEffect(() => {
    const timeline = timelineScroll.current,
      sidebar = trackList.current;
    if (!timeline || !sidebar) return;
    const syncPlayhead = (scrollTop: number) => {
      if (playhead.current) playhead.current.style.top = `${scrollTop + 25}px`;
    };
    const fromTimeline = () => {
      if (sidebar.scrollTop !== timeline.scrollTop)
        sidebar.scrollTop = timeline.scrollTop;
      syncPlayhead(timeline.scrollTop);
    };
    const fromSidebar = () => {
      if (timeline.scrollTop !== sidebar.scrollTop)
        timeline.scrollTop = sidebar.scrollTop;
      syncPlayhead(sidebar.scrollTop);
    };
    timeline.addEventListener("scroll", fromTimeline, { passive: true });
    sidebar.addEventListener("scroll", fromSidebar, { passive: true });
    syncPlayhead(timeline.scrollTop);
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
  }, [playhead]);
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
              <TrackHeader
                key={t.id}
                track={t}
                index={i}
                selected={track?.id === t.id}
                controller={controller}
                onMenu={(selectedTrack, anchor) => {
                  setSelected(selectedTrack.id);
                  setMenu({
                    id: selectedTrack.id,
                    x: anchor.x,
                    y: anchor.y,
                    position: s.position,
                  });
                }}
              />
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
        <PanelResize
          axis="horizontal"
          label="Track sidebar width"
          value={controller.sidebarWidth}
          min={240}
          max={controller.sidebarMax}
          reset={280}
          onChange={controller.setSidebarWidth}
        />
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
                <TrackLane
                  key={t.id}
                  track={t}
                  selected={t.id === track?.id}
                  controller={controller}
                  onMenu={(event, selectedTrack) => {
                    event.preventDefault();
                    setSelected(selectedTrack.id);
                    setMenu({
                      id: selectedTrack.id,
                      x: event.clientX,
                      y: event.clientY,
                      position: atPointer(event),
                    });
                  }}
                />
              ))}
              <div
                className="empty-grid"
                data-empty-grid
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
                <span>
                  Drop files here to create tracks, or drag a recording down to
                  copy its track settings
                </span>
              </div>
            </div>
            <div
              className={"playhead " + (s.recording ? "red" : "")}
              style={{
                top: 25,
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
