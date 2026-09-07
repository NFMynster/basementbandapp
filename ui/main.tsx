import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./style.css";
import "./startup.css";
import "./interactions.css";
createRoot(document.getElementById("root")!).render(<App />);
