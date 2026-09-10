import { useEffect, useState } from "react";

function saved(key: string, fallback: number) {
  try {
    const value = Number(localStorage.getItem(key) ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
export function usePanelLayout() {
  const [viewport, setViewport] = useState({
    width: innerWidth,
    height: innerHeight,
  });
  const [sidebar, setSidebarWidth] = useState(() =>
    saved("basement.sidebar-width", 280),
  );
  const [inspector, setInspectorHeight] = useState(() =>
    saved("basement.inspector-height", 380),
  );
  useEffect(() => {
    const resize = () =>
      setViewport({ width: innerWidth, height: innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("basement.sidebar-width", String(sidebar));
      localStorage.setItem("basement.inspector-height", String(inspector));
    } catch {
      /* Layout still works when storage is unavailable. */
    }
  }, [sidebar, inspector]);
  const sidebarMax = Math.max(
    240,
    Math.min(560, Math.floor(viewport.width / 2)),
  );
  const inspectorMax = Math.max(200, viewport.height - 360);
  return {
    sidebarWidth: Math.max(240, Math.min(sidebarMax, sidebar)),
    inspectorHeight: Math.max(200, Math.min(inspectorMax, inspector)),
    sidebarMax,
    inspectorMax,
    setSidebarWidth,
    setInspectorHeight,
  };
}
