export type Clip = {
  id: string;
  name: string;
  start: number;
  duration: number;
  peaks: number[];
};
export type Track = {
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
  bypass: boolean;
};
export type Session = {
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

export type TrackPatch = Partial<
  Pick<Track, "name" | "input" | "armed" | "mute" | "solo" | "gain" | "pan">
>;
export type DeviceConfiguration = Pick<
  Devices,
  "type" | "input" | "output" | "sampleRate" | "bufferSize"
>;
export type SessionCommand =
  | {
      op:
        | "state"
        | "addTrack"
        | "play"
        | "stop"
        | "record"
        | "new"
        | "clearWarning";
    }
  | ({ op: "track"; track: string } & TrackPatch)
  | { op: "removeTrack" | "editor" | "removePlugin"; track: string }
  | { op: "removeClip"; track: string; clip: string }
  | { op: "seek"; position: number }
  | { op: "loop"; start: number; end: number; enabled: boolean }
  | { op: "tempo"; value: number }
  | { op: "rename"; title: string }
  | { op: "bypass"; track: string; value: boolean };
export type DeviceCommand =
  { op: "devices" } | ({ op: "configure" } & DeviceConfiguration);
export type Command = SessionCommand | DeviceCommand;
export type CommandResult<C extends Command> = C extends DeviceCommand
  ? Devices
  : Session;
export type SaveResult = { saved: string };
export type ExportOptions = { mode: "separate" | "mix"; track?: string };
export type ExportResult = { folder: string; files: string[] };
export interface DesktopApi {
  command<C extends Command>(command: C): Promise<CommandResult<C>>;
  save(): Promise<SaveResult | null>;
  open(): Promise<Session | null>;
  importAudio(track: string): Promise<Session | null>;
  plugin(track: string): Promise<Session | null>;
  exportAudio(options: ExportOptions): Promise<ExportResult | null>;
}
declare global {
  interface Window {
    basement?: DesktopApi;
  }
}
