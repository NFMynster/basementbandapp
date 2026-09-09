const fs = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const CURRENT_SESSION_VERSION = 4;

const sessionClips = (session) =>
  session.tracks.flatMap((track) => track.clips);

async function writeJsonAtomically(target, value, space = 0) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, space));
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function validate(session) {
  const assertValid = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const number = (value, min, max) =>
    assertValid(
      Number.isFinite(value) && value >= min && value <= max,
      "Invalid numeric session field",
    );
  const text = (value, length) =>
    assertValid(
      typeof value === "string" && value.length <= length,
      "Invalid text session field",
    );
  const ids = new Set();
  const id = (value) => {
    const canonical =
      typeof value === "string" ? value.replaceAll("-", "").toLowerCase() : "";
    assertValid(
      typeof value === "string" &&
        /^(?:[\da-f]{32}|[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i.test(
          value,
        ) &&
        !ids.has(canonical),
      "Session IDs must be valid and unique",
    );
    ids.add(canonical);
  };
  assertValid(session && typeof session === "object", "Invalid session");
  assertValid(
    session.version === 3 || session.version === CURRENT_SESSION_VERSION,
    "Unsupported session version",
  );
  for (const key of ["countIn", "metronome"])
    assertValid(typeof session[key] === "boolean", "Invalid transport setting");
  text(session.title, 100);
  number(session.tempo, 40, 240);
  number(session.masterGain, 0, 2);
  number(session.loopStart, 0, Number.MAX_VALUE);
  number(session.loopEnd, session.loopStart, Number.MAX_VALUE);
  assertValid(
    session.loopEnd > session.loopStart && typeof session.looping === "boolean",
    "Invalid loop",
  );
  assertValid(
    Array.isArray(session.tracks) && session.tracks.length <= 32,
    "Invalid session tracks",
  );
  for (const track of session.tracks) {
    id(track.id);
    text(track.name, 80);
    assertValid(typeof track.monitor === "boolean", "Invalid monitor setting");
    assertValid(
      ["guitar", "bass", "drums", "keys", "mic", "audio"].includes(track.icon),
      "Invalid track icon",
    );
    assertValid(["audio", "midi"].includes(track.kind), "Invalid track kind");
    assertValid(/^#[\da-f]{6}$/i.test(track.color), "Invalid track color");
    number(track.input, 0, 127);
    assertValid(Number.isInteger(track.input), "Invalid input channel");
    number(track.gain, 0, 1.5);
    number(track.pan, -1, 1);
    for (const key of ["eqBass", "eqMid", "eqTreble"])
      if (track[key] !== undefined) number(track[key], -12, 12);
    if (track.eqEnabled !== undefined)
      assertValid(typeof track.eqEnabled === "boolean", "Invalid EQ switch");
    for (const key of ["armed", "mute", "solo", "bypass"])
      assertValid(typeof track[key] === "boolean", "Invalid track switch");
    text(track.midiDevice, 4096);
    number(track.midiChannel, 0, 16);
    assertValid(Number.isInteger(track.midiChannel), "Invalid MIDI channel");
    assertValid(Array.isArray(track.clips), "Invalid regions");
    if (track.effects !== undefined) {
      assertValid(
        Array.isArray(track.effects) && track.effects.length <= 16,
        "Invalid effect chain",
      );
      for (const effect of track.effects) {
        id(effect.id);
        text(effect.path, 32768);
        text(effect.name, 1024);
        assertValid(
          typeof effect.bypass === "boolean",
          "Invalid effect bypass",
        );
        if (effect.state !== undefined) text(effect.state, 64 * 1024 * 1024);
      }
    }
    for (const clip of track.clips) {
      id(clip.id);
      text(clip.name, 1024);
      text(clip.path, 32768);
      assertValid(["audio", "midi"].includes(clip.kind), "Invalid region kind");
      assertValid(clip.kind === track.kind, "Region type does not match track");
      number(clip.start, 0, Number.MAX_VALUE);
      number(clip.offset, 0, 1200);
      number(clip.sourceStart, 0, 1200);
      number(clip.sourceEnd, clip.sourceStart, 1200);
      number(clip.length, -1, 1200);
      assertValid(
        clip.length === -1 || clip.length > 0,
        "Invalid region length",
      );
      assertValid(typeof clip.active === "boolean", "Invalid take selection");
      text(clip.takeGroup, 64);
      number(clip.take, 0, 24000);
      assertValid(Number.isInteger(clip.take), "Invalid take number");
    }
  }
}

module.exports = {
  CURRENT_SESSION_VERSION,
  sessionClips,
  validate,
  writeJsonAtomically,
};
