import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/arrangement.css";
import "./styles/inspector.css";
import "./styles/app-chrome.css";
import "./startup.css";
import "./styles/arrangement-states.css";
import "./styles/dialogs.css";
import "./styles/overlay-states.css";
import "./styles/inspector-states.css";
createRoot(document.getElementById("root")!).render(<App />);

import "./styles/sound-editors.css";
