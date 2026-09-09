const UNDOABLE_CLIP_ACTIONS = new Set([
  "move",
  "trim",
  "repeat",
  "split",
  "copy",
  "note",
  "quantize",
  "notes",
  "sound",
]);
const UNDOABLE_TRACK_SETTINGS = [
  "name",
  "color",
  "icon",
  "input",
  "midiDevice",
  "midiChannel",
  "armed",
  "monitor",
  "mute",
  "solo",
  "gain",
  "pan",
  "eqEnabled",
  "eqBass",
  "eqMid",
  "eqTreble",
  "bypass",
  "pluginName",
];
const GLOBAL_EDITS = {
  master: "masterGain",
  tempo: "tempo",
  rename: "title",
  metronome: "metronome",
  countIn: "countIn",
};
function historyFingerprint(s) {
  const keys = [
    ...UNDOABLE_TRACK_SETTINGS,
    "id",
    "kind",
    "pluginPath",
    "pluginUid",
    "pluginState",
    "effects",
  ];
  return JSON.stringify({
    title: s.title,
    tempo: s.tempo,
    masterGain: s.masterGain,
    metronome: s.metronome,
    countIn: s.countIn,
    tracks: s.tracks.map((t) => ({
      settings: keys.map((k) => t[k]),
      clips: t.clips.map((c) => [
        c.id,
        c.path,
        c.name,
        c.start,
        c.offset,
        c.length,
        c.active,
        c.takeGroup,
        c.take,
        c.sourceStart,
        c.sourceEnd,
        c.gain,
        c.fadeIn,
        c.fadeOut,
      ]),
    })),
  });
}
function editDescription(command) {
  if (command.op === "addTrack") return "create track";
  if (command.op === "createMidi") return "create MIDI region";
  if (command.op === "import") return "import region";
  if (command.op === "reorderEffect") return "reorder effects";
  if (command.op === "preset") return "apply track preset";
  if (command.op === "plugin" || command.op === "removePlugin")
    return "change plug-in";
  if (command.op === "bypass") return "bypass plug-in";
  if (command.op === "track") {
    if (Object.keys(command).some((k) => k.startsWith("eq")))
      return "change EQ";
    if ("gain" in command) return "change track volume";
    if ("pan" in command) return "change pan";
    if ("name" in command) return "rename track";
    return "change track settings";
  }
  if (GLOBAL_EDITS[command.op])
    return `change ${command.op === "master" ? "output volume" : command.op}`;
  if (command.op === "removeTrack") return "delete track";
  if (command.op === "removeClip") return "delete region";
  return (
    {
      move: "move region",
      trim: "trim region",
      repeat: "loop region",
      split: "split region",
      copy: "copy region",
      note: "edit MIDI note",
      notes: "edit MIDI notes",
      sound: "change clip sound",
      quantize: "align MIDI notes",
    }[command.action] || "edit"
  );
}
function isUndoable(command) {
  return (
    [
      "addTrack",
      "createMidi",
      "import",
      "track",
      "master",
      "tempo",
      "rename",
      "metronome",
      "countIn",
      "plugin",
      "removePlugin",
      "bypass",
      "reorderEffect",
      "preset",
    ].includes(command.op) ||
    command.op === "removeTrack" ||
    command.op === "removeClip" ||
    (command.op === "editClip" && UNDOABLE_CLIP_ACTIONS.has(command.action))
  );
}

// Apply an entry to the current session without discarding unrelated edits.
function applyHistoryEntry(current, entry, direction) {
  const source = direction === "undo" ? entry.after : entry.before;
  const destination = direction === "undo" ? entry.before : entry.after;
  const target = structuredClone(current);
  // Apply only this edit's region differences. Later imports, mix changes,
  // transport settings and newly added tracks survive undo/redo.
  const ids = new Set(
    [...source.tracks, ...destination.tracks].map((track) => track.id),
  );
  for (const id of ids) {
    const old = source.tracks.find((track) => track.id === id);
    const next = destination.tracks.find((track) => track.id === id);
    if (!next) {
      target.tracks = target.tracks.filter((track) => track.id !== id);
      continue;
    }
    if (!old) {
      target.tracks.splice(
        destination.tracks.indexOf(next),
        0,
        structuredClone(next),
      );
      continue;
    }
    const live = target.tracks.find((track) => track.id === id);
    if (!live) continue;
    const clipIds = new Set(
      [...old.clips, ...next.clips].map((clip) => clip.id),
    );
    for (const clipId of clipIds) {
      const a = old.clips.find((clip) => clip.id === clipId);
      const b = next.clips.find((clip) => clip.id === clipId);
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      live.clips = live.clips.filter((clip) => clip.id !== clipId);
      if (b) live.clips.splice(next.clips.indexOf(b), 0, structuredClone(b));
    }
  }
  // Only settings belonging to this history entry are restored.
  for (const key of entry.globalKeys || []) target[key] = destination[key];
  for (const id of ids) {
    const next = destination.tracks.find((t) => t.id === id);
    const old = source.tracks.find((t) => t.id === id);
    const live = target.tracks.find((t) => t.id === id);
    if (!next || !live) continue;
    for (const key of entry.trackKeys || []) {
      if (JSON.stringify(old?.[key]) === JSON.stringify(next[key])) continue;
      if (next[key] === undefined) delete live[key];
      else live[key] = structuredClone(next[key]);
    }
  }
  return target;
}

module.exports = {
  UNDOABLE_TRACK_SETTINGS,
  GLOBAL_EDITS,
  historyFingerprint,
  editDescription,
  isUndoable,
  applyHistoryEntry,
};
