// Shared JSDoc types for the desktop layer (checked by tsconfig.desktop.json).
// Renderer-facing shapes come from ui/models.ts so both sides share one contract.
import type { BrowserWindow } from "electron";
import type { Clip, Session, Track } from "../ui/models";

export type { Session, Track };

// The engine's full snapshot: the renderer Session plus document fields
// (version, persisted media paths) that only the desktop layer reads or strips.
// Full snapshots also carry each clip's media path and source length.
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

// Any engine command; engine replies are JSON whose shape depends on the op.
export type EngineCommand = { op: string; [field: string]: unknown };
// Sends one command through SessionService (or the native client in tests).
// State reads are typed; other replies depend on the op.
export type Request = {
  (command: {
    op: "state" | "snapshot";
    [field: string]: unknown;
  }): Promise<Snapshot>;
  (command: EngineCommand): Promise<any>;
};

export type Window = BrowserWindow;

// One undoable edit: snapshots on either side plus the keys it owns, so undo
// restores only this edit and leaves later unrelated changes alone.
export type HistoryEntry = {
  description: string;
  before: Snapshot;
  after: Snapshot;
  trackId?: unknown;
  trackOrder?: boolean;
  // Plug-in edits restore processor state instead of keeping live processors.
  reloadPlugins?: boolean;
  globalKeys?: string[];
  trackKeys?: string[];
  historyGroup?: unknown;
};

export type PluginEntry = {
  id: string;
  name: string;
  path: string;
  uid?: string;
  stamp?: number;
  favorite?: boolean;
  recent?: number;
  [field: string]: unknown;
};

export type TrackPreset = {
  id: string;
  name: string;
  kind: string;
  settings: Record<string, unknown>;
  hint?: string;
  builtIn?: boolean;
};
