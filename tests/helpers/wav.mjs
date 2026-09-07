import { writeFileSync } from "node:fs";

export function writeMonoWav(
  path,
  frames,
  sample = () => 0,
  sampleRate = 48000,
) {
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    wav.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, sample(i))) * 32767),
      44 + i * 2,
    );
  writeFileSync(path, wav);
}
