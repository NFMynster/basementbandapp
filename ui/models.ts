export type TrackIconName =
  "guitar" | "bass" | "drums" | "keys" | "mic" | "audio";

export type Clip = {
  offset: number;
  sourceStart: number;
  sourceEnd: number;
  takeGroup: string;
  take: number;
  active: boolean;
  kind: "audio" | "midi";
  notes?: { start: number; duration: number; note: number }[];
  id: string;
  name: string;
  start: number;
  duration: number;
  peaks: number[];
};
type RecordingPreviewBase = {
  start: number;
  duration: number;
};
export type RecordingPreview =
  | (RecordingPreviewBase & { kind: "audio"; peaks: number[] })
  | (RecordingPreviewBase & {
      kind: "midi";
      notes: { start: number; duration: number; note: number }[];
    });
export type Track = {
  monitor: boolean;
  icon: TrackIconName;
  kind: "audio" | "midi";
  midiDevice: string;
  midiChannel: number;
  latencySamples?: number;
  id: string;
  name: string;
  color: string;
  input: number;
  armed: boolean;
  recordStart: number;
  mute: boolean;
  solo: boolean;
  gain: number;
  pan: number;
  peak: number;
  clips: Clip[];
  pluginName: string;
  effects?: { id: string; name: string; bypass: boolean }[];
  bypass: boolean;
  recordingPreview?: RecordingPreview;
};
export type Session = {
  canUndo?: boolean;
  canRedo?: boolean;
  recovered?: boolean;
  recoveryError?: string;
  audioInputActive?: boolean;
  outputLatencySamples?: number;
  inputLatencySamples?: number;
  masterGain?: number;
  masterPeak?: number;
  metronome?: boolean;
  countIn?: boolean;
  countdown?: number;
  title: string;
  tracks: Track[];
  position: number;
  playing: boolean;
  recording: boolean;
  looping: boolean;
  loopStart: number;
  loopEnd: number;
  tempo: number;
  sampleRate: number;
  bufferSize: number;
  device: string;
  deviceError: string;
  diskOverrun: boolean;
};
export type Devices = {
  midiInputs?: { id: string; name: string }[];
  types: { name: string; inputs: string[]; outputs: string[] }[];
  type: string;
  input: string;
  output: string;
  channels: string[];
  rates: number[];
  buffers: number[];
  sampleRate: number;
  bufferSize: number;
};

export type TrackPatch = { historyGroup?: string } & Partial<
  Pick<
    Track,
    | "name"
    | "input"
    | "armed"
    | "mute"
    | "solo"
    | "gain"
    | "pan"
    | "midiDevice"
    | "midiChannel"
    | "color"
    | "icon"
    | "monitor"
  >
>;
export type DeviceConfiguration = Pick<
  Devices,
  "type" | "input" | "output" | "sampleRate" | "bufferSize"
>;
export type SessionCommand =
  | {
      op:
        | "state"
        | "play"
        | "stop"
        | "record"
        | "new"
        | "clearWarning"
        | "undo"
        | "redo";
    }
  | { op: "addTrack"; kind?: "audio" | "midi" }
  | { op: "metronome" | "countIn"; value: boolean }
  | { op: "master"; value: number; historyGroup?: string }
  | {
      op: "editClip";
      track: string;
      clip: string;
      action: "move" | "copy" | "split" | "take" | "trim";
      length?: number;
      position?: number;
      target?: string;
    }
  | ({ op: "track"; track: string } & TrackPatch)
  | {
      op: "removeTrack" | "editor" | "removePlugin";
      track: string;
      effect?: string;
    }
  | { op: "removeClip"; track: string; clip: string }
  | { op: "seek"; position: number }
  | { op: "loop"; start: number; end: number; enabled: boolean }
  | { op: "tempo"; value: number }
  | { op: "rename"; title: string }
  | { op: "bypass"; track: string; value: boolean; effect?: string };
export type DeviceCommand =
  { op: "devices" } | ({ op: "configure" } & DeviceConfiguration);
export type Command = SessionCommand | DeviceCommand;
export type CommandResult<C extends Command> = C extends DeviceCommand
  ? Devices
  : Session;
export type SaveResult = { saved: string };
export type ExportOptions = {
  mode: "separate" | "mix";
  format?: "wav" | "flac";
  track?: string;
};
export type ExportResult = { folder: string; files: string[] };
export interface DesktopApi {
  openLicenses(): Promise<string>;
  openLogs(): Promise<string>;
  restart(): Promise<void>;
  dropFiles(files: File[], track?: string, plugin?: boolean): Promise<Session>;
  command<C extends Command>(command: C): Promise<CommandResult<C>>;
  save(): Promise<SaveResult | null>;
  open(): Promise<Session | null>;
  importAudio(track?: string, position?: number): Promise<Session | null>;
  plugin(
    track: string,
    bundle?: boolean,
    append?: boolean,
  ): Promise<Session | null>;
  exportAudio(options: ExportOptions): Promise<ExportResult | null>;
}
declare global {
  interface Window {
    basement?: DesktopApi;
  }
}
