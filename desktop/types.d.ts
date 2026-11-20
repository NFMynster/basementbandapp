// Types for the desktop smoke workflows (desktop/smoke/*.cjs), checked by
// tsconfig.desktop.json. They run in Node and drive the built app through
// scripts/webview-driver.cjs.
import type { Clip, Session, Track } from "../ui/models";

export type { Session, Track };

// The engine's full snapshot: the renderer Session plus document fields.
export type SnapshotClip = Omit<Clip, "peaks"> & {
  peaks?: number[];
  path: string;
  length: number;
};
export type SnapshotTrack = Omit<Track, "clips"> & {
  clips: SnapshotClip[];
} & Record<string, unknown>;
export type Snapshot = Omit<Session, "tracks"> & {
  version?: number;
  tracks: SnapshotTrack[];
} & Record<string, unknown>;

export type EngineCommand = { op: string; [field: string]: unknown };
// Any engine command through the shell's SessionService (smoke runs may use
// test-device ops). State reads are typed; other replies depend on the op.
export type Request = {
  (command: {
    op: "state" | "snapshot";
    [field: string]: unknown;
  }): Promise<Snapshot>;
  (command: EngineCommand): Promise<any>;
};

export type CapturedImage = {
  toPNG(): Buffer;
  getSize(): { width: number; height: number };
};

/** Electron's sendInputEvent shape, which the scripts were written against. */
export type InputEvent = {
  type: "mouseDown" | "mouseUp" | "mouseMove" | "keyDown" | "keyUp" | "char";
  x?: number;
  y?: number;
  button?: "left" | "middle" | "right";
  clickCount?: number;
  modifiers?: string[];
  keyCode?: string;
};

/** The app window as scripts/webview-driver.cjs presents it. */
export type Window = {
  webContents: {
    executeJavaScript(code: string): Promise<any>;
    sendInputEvent(event: InputEvent): Promise<unknown>;
    capturePage(rect?: {
      x: number;
      y: number;
      width: number;
      height: number;
    }): Promise<CapturedImage>;
    insertCSS(css: string): Promise<string>;
    removeInsertedCSS(key: string): Promise<unknown>;
    reload(): Promise<void>;
    on(
      name: "console-message",
      listener: (event: unknown, level: number, message: string) => void,
    ): void;
  };
  setSize(width: number, height: number): Promise<unknown>;
  showInactive(): void;
  loadFile(
    file: string,
    options?: { query?: Record<string, string> },
  ): Promise<void>;
  dialogs: {
    opened(): Promise<number>;
    answer(answer: string | null): Promise<boolean>;
  };
  destroy(): void;
};
