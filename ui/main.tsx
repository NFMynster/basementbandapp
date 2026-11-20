/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import { App } from "./App";
// Stylesheets by component area. Order is the cascade: later files may
// override earlier ones, and comments mark the few rules that rely on it.
import "./styles/base.css";
import "./styles/arrangement.css";
import "./styles/shell.css";
import "./styles/dialogs.css";
import "./styles/overlays.css";
import "./styles/inspector.css";
import "./styles/sound-editors.css";
import "./styles/plugins.css";
// No browser context menu (Back, Reload, Print, Inspect…) in the app; the
// app's own right-click menus still run, since this only cancels the default.
// `npm run dev` keeps it for Inspect.
if (!import.meta.env.DEV)
  document.addEventListener("contextmenu", (event) => event.preventDefault());
createRoot(document.getElementById("root")!).render(<App />);
