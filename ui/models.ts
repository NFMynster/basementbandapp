export type TrackIconName =
  "guitar" | "bass" | "drums" | "keys" | "mic" | "audio";

export type Clip = {
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
  offset: number;
  sourceStart: number;
  sourceEnd: number;
  takeGroup: string;
  take: number;
  active: boolean;
  kind: "audio" | "midi";
  notes?: {
    event?: number;
    velocity?: number;
    channel?: number;
    start: number;
    duration: number;
    note: number;
  }[];
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
  | (RecordingPreviewBase & {
      kind: "audio";
      peaks: number[];
      peakInterval?: number;
      /** In a live frame: where `peaks` continue the waveform already sent. */
      from?: number;
    })
  | (RecordingPreviewBase & {
      kind: "midi";
      notes: { start: number; duration: number; note: number }[];
    });
/**
 * Update state from the desktop shell. `state` is set only where the app
 * updates itself (packaged Windows); elsewhere an update opens the release page.
 */
export type UpdateStatus = {
  available: boolean;
  version?: string;
  state?: "downloading" | "ready" | "failed";
};
export type MetronomeSound = "beep" | "woodblock" | "stick";
export type AmpCharacter = "none" | "clean" | "crunch" | "lead" | "bass";

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
  compressorEnabled?: boolean;
  compressorAmount?: number;
  compressorAttack?: number;
  compressorRelease?: number;
  reverbEnabled?: boolean;
  reverbAmount?: number;
  reverbSize?: number;
  reverbDamping?: number;
  reverbWidth?: number;
  gateEnabled?: boolean;
  gateThreshold?: number;
  ampCharacter?: AmpCharacter;
  ampBypass?: boolean;
  eqEnabled?: boolean;
  eqBass?: number;
  eqMid?: number;
  eqTreble?: number;
  eqBassFrequency?: number;
  eqMidFrequency?: number;
  eqTrebleFrequency?: number;
  eqMidQ?: number;
  eqLowCut?: number;

  clips: Clip[];
  pluginName: string;
  effects?: { id: string; name: string; bypass: boolean }[];
  bypass: boolean;
};
export type Session = {
  tunerTrack?: string;
  historyNotice?: string;
  canUndo?: boolean;
  canRedo?: boolean;
  recovered?: boolean;
  recoveryError?: string;
  audioInputActive?: boolean;
  outputLatencySamples?: number;
  inputLatencySamples?: number;
  masterGain?: number;
  limiterEnabled?: boolean;
  outputClipped?: boolean;
  processingDropouts?: number;
  recordingDropouts?: number;
  deviceDropouts?: number;
  metronome?: boolean;
  metronomeGain?: number;
  metronomeSound?: MetronomeSound;
  countIn?: boolean;
  countdown?: number;
  title: string;
  tracks: Track[];
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
  /** Counts OS audio and MIDI device list changes. */
  deviceListVersion?: number;
};
/** A track's continuously changing values. */
export type LiveTrack = { peak: number; recordingPreview?: RecordingPreview };
/**
 * What the engine changes continuously: transport position, meter peaks,
 * audio load, tuner pitch and recording previews. Live frames bring it up to
 * 30 times a second; it stays out of React state (ui/services/liveState.ts).
 */
export type Live = {
  position: number;
  masterPeak: number;
  audioCpu: number;
  tunerFrequency: number;
  tracks: Record<string, LiveTrack>;
};
/**
 * The engine's whole state, as command replies carry it: the session with
 * its live values. `revision` orders replies and live frames.
 */
export type EngineState = Omit<Session, "tracks"> &
  Omit<Live, "tracks" | "masterPeak" | "audioCpu" | "tunerFrequency"> &
  Partial<Pick<Live, "masterPeak" | "audioCpu" | "tunerFrequency">> & {
    revision?: number;
    tracks: (Track & LiveTrack)[];
  };
/**
 * A message on the engine stream (`watch_engine`): a live frame, with the
 * session when it changed, or the engine stopping.
 */
export type EngineFrame =
  | { event: "state"; revision: number; live: Live; session?: Session }
  | { event: "failed"; error: string };
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
    | "compressorEnabled"
    | "compressorAmount"
    | "compressorAttack"
    | "compressorRelease"
    | "reverbEnabled"
    | "reverbAmount"
    | "reverbSize"
    | "reverbDamping"
    | "reverbWidth"
    | "gateEnabled"
    | "gateThreshold"
    | "ampCharacter"
    | "ampBypass"
    | "eqEnabled"
    | "eqBass"
    | "eqMid"
    | "eqTreble"
    | "eqBassFrequency"
    | "eqMidFrequency"
    | "eqTrebleFrequency"
    | "eqMidQ"
    | "eqLowCut"
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
        | "clearDiagnostics"
        | "undo"
        | "redo";
    }
  | { op: "tuner"; track?: string }
  | { op: "duplicateTrack"; track: string; empty?: boolean }
  | { op: "createMidi"; track: string; position: number; length?: number }
  | { op: "reorderEffect"; track: string; effect: string; index: number }
  | { op: "preset"; track: string; preset: string }
  | ({ op: "addTrack"; kind?: "audio" | "midi" } & TrackPatch)
  | { op: "metronome" | "countIn" | "limiter"; value: boolean }
  | { op: "metronomeVolume"; value: number; historyGroup?: string }
  | { op: "metronomeSound"; value: MetronomeSound }
  | { op: "master"; value: number; historyGroup?: string }
  | {
      op: "editClip";
      track: string;
      clip: string;
      action:
        | "move"
        | "copy"
        | "split"
        | "take"
        | "repeat"
        | "trim"
        | "note"
        | "quantize"
        | "notes"
        | "sound";
      gain?: number;
      fadeIn?: number;
      fadeOut?: number;
      historyGroup?: string;
      edits?: {
        event?: number;
        start?: number;
        duration?: number;
        note?: number;
        velocity?: number;
        channel?: number;
        delete?: boolean;
      }[];
      division?: number;
      event?: number;
      pitch?: number;
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
  | {
      op: "editRegions";
      action: "move" | "delete";
      regions: { track: string; clip: string }[];
      delta?: number;
    }
  | {
      op: "audition";
      track: string;
      note: number;
      velocity: number;
      channel: number;
    }
  | { op: "reorderTrack"; track: string; index: number }
  | { op: "seek"; position: number }
  | { op: "loop"; start: number; end: number; enabled: boolean }
  | { op: "tempo"; value: number; match?: "none" | "midi" | "all" }
  | { op: "rename"; title: string }
  | { op: "bypass"; track: string; value: boolean; effect?: string };
export type DeviceCommand =
  { op: "devices" } | ({ op: "configure" } & DeviceConfiguration);
export type Command = SessionCommand | DeviceCommand;
export type CommandResult<C extends Command> = C extends DeviceCommand
  ? Devices
  : EngineState;
export type SaveResult = { saved: string };
export type ExportOptions = {
  mode: "separate" | "mix";
  format?: "wav" | "flac";
  midi?: "audio" | "midi";
  track?: string;
};
export type ExportResult = { folder: string; files: string[] };
export type LibraryCommand = {
  op:
    | "list"
    | "scan"
    | "scanFolder"
    | "favorite"
    | "load"
    | "savePreset"
    | "applyPreset"
    | "deletePreset";
  id?: string;
  track?: string;
  append?: boolean;
  name?: string;
};
export type SoundLibrary = {
  plugins: {
    id: string;
    name: string;
    manufacturer: string;
    path: string;
    instrument: boolean;
    favorite: boolean;
    recent: number;
  }[];
  presets: { id: string; name: string; kind: "audio" | "midi" }[];
  starters: { id: string; name: string; hint: string }[];
  scanning: boolean;
  progress: string;
  errors: string[];
  session?: EngineState;
};
export interface DesktopApi {
  soundLibrary(command: LibraryCommand): Promise<SoundLibrary>;
  openLicenses(): Promise<string>;
  openLogs(): Promise<string>;
  openWebsite(): Promise<void>;
  checkForUpdate(): Promise<UpdateStatus>;
  installUpdate(): Promise<void>;
  openRelease(): Promise<void>;
  openFeedback(): Promise<void>;
  waitUntilVisible(): Promise<void>;
  restart(): Promise<void>;
  /** Calls `listener` with the library whenever a plug-in scan changes it. */
  onSoundLibrary(
    listener: (library: SoundLibrary) => void,
  ): Promise<() => void>;
  /** Calls `listener` whenever the background update moves on. */
  onUpdateStatus(listener: (status: UpdateStatus) => void): Promise<() => void>;
  /** Streams engine frames to `onFrame` from now on. */
  watchEngine(onFrame: (frame: EngineFrame) => void): Promise<void>;
  /** `paths` come from the native drop event; the shell accepts no others. */
  dropFiles(
    paths: string[],
    track?: string,
    plugin?: boolean,
  ): Promise<EngineState>;
  command<C extends Command>(command: C): Promise<CommandResult<C>>;
  save(): Promise<SaveResult | null>;
  open(): Promise<EngineState | null>;
  importAudio(track?: string, position?: number): Promise<EngineState | null>;
  plugin(
    track: string,
    bundle?: boolean,
    append?: boolean,
  ): Promise<EngineState | null>;
  exportAudio(options: ExportOptions): Promise<ExportResult | null>;
}
