#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::exportAudio(const var &c) {
  require(!playing, "Stop playback before exporting");
  const auto mode = str(c, "mode");
  require(mode == "separate" || mode == "mix", "Unknown export mode");
  const auto formatName = str(c, "format", "wav");
  require(formatName == "wav" || formatName == "flac", "Unknown export format");
  const auto midiMode = str(c, "midi", "audio");
  require(midiMode == "audio" || midiMode == "midi", "Unknown MIDI export mode");
  const auto target = str(c, "track");
  if (target.isNotEmpty())
    track(c); // Validate before creating output.
  const auto parent = File(str(c, "path"));
  require(parent.isDirectory(), "Choose an existing export folder");
  exporting = true;
  const ScopeGuard finishExport([&] { exporting = false; });
  const ScopedLock lock(guard); // Device callbacks return silence while stopped.
  std::vector<Track *> selected, midiTracks;
  bool anySolo = false;
  for (auto &t : tracks)
    anySolo |= t->solo;
  double duration = 0, tail = 0;
  for (auto &t : tracks) {
    if (target.isNotEmpty() && t->id != target)
      continue;
    if (std::none_of(t->clips.begin(), t->clips.end(), [](const auto &clip) { return clip->active && clip->duration() > 0; }))
      continue;
    if (mode == "mix" && (t->mute || (anySolo && !t->solo)))
      continue;
    const bool notesOnly = t->isMidi && midiMode == "midi";
    require(notesOnly || !t->isMidi || (t->plugin && !t->bypass),
            "Load an active instrument on each MIDI track before export");
    if (notesOnly) midiTracks.push_back(t.get());
    else selected.push_back(t.get());
    for (auto &clip : t->clips)
      if (clip->active)
        duration = jmax(duration, clip->start + clip->duration());
    if (notesOnly) continue;
    const double roomTail = t->sound.reverbEnabled && t->sound.reverbAmount > 0 ? jmax(4.0, 4.0 + (t->sound.reverbSize - 0.55f) * 14.0) : 0;
    tail = jmax(tail, roomTail);
    if (t->plugin && !t->bypass)
      tail = jmax(tail, jlimit(0.0, 10.0, t->plugin->getTailLengthSeconds()));
    double effectTail = 0;
    for (auto &effect : t->effects)
      if (!effect.bypass) effectTail += jlimit(0.0, 10.0, effect.plugin->getTailLengthSeconds());
    tail = jmax(tail, roomTail + effectTail + (t->plugin && !t->bypass ? jlimit(0.0, 10.0, t->plugin->getTailLengthSeconds()) : 0));
  }
  require((!selected.empty() || !midiTracks.empty()) && duration > 0, "No audible regions to export");
  require(std::isfinite(duration) && duration + tail <= 60 * 60 * 4,
          "Export must be shorter than four hours");
  auto destination = parent.getNonexistentChildFile("Basement Band Export", "", true);
  require(destination.createDirectory().wasOk(), "Could not create export folder");
  const auto total = (int64)std::ceil((duration + tail) * rate);
  const int frames = jlimit(1, 8192, block);
  Array<var> files;
  for (size_t i = 0; i < midiTracks.size(); ++i) {
    const auto name = String((int)i + 1).paddedLeft('0', 2) + " - " + File::createLegalFileName(midiTracks[i]->name).substring(0, 80);
    const auto file = destination.getChildFile(name + ".mid");
    exportMidiTrack(*midiTracks[i], file, duration);
    files.add(file.getFullPathName());
  }
  // Reset DSP history, not parameters; exports must not inherit the last playback tail.
  for (auto *t : selected)
    prepareTrack(*t, 0, false);
  const ScopeGuard reset([&] {
    for (auto *t : selected) {
      if (t->plugin && !t->bypass)
        t->plugin->reset();
      for (auto &effect : t->effects) effect.plugin->reset();
      t->sound.reset();
    }
  });
  const int count = selected.empty() ? 0 : mode == "mix" ? 1 : (int)selected.size();
  for (int fileIndex = 0; fileIndex < count; ++fileIndex) {
    String name =
        mode == "mix"
            ? "Mix"
            : String(fileIndex + 1).paddedLeft('0', 2) + " - " +
                  File::createLegalFileName(selected[(size_t)fileIndex]->name).substring(0, 80);
    const auto extension = formatName == "flac" ? ".flac" : ".wav";
    auto file = destination.getChildFile(name + extension);
    auto stream = file.createOutputStream();
    require(stream != nullptr, "Could not create export file");
    std::unique_ptr<AudioFormatWriter> writer;
    if (formatName == "flac") {
      FlacAudioFormat format;
      writer.reset(format.createWriterFor(stream.get(), rate, 2, 24, {}, 5));
    } else {
      WavAudioFormat format;
      writer.reset(format.createWriterFor(stream.get(), rate, 2, 24, {}, 0));
    }
    require(writer != nullptr, "Could not initialize export file");
    stream.release();
    OutputProtection protection;
    protection.prepare(rate);
    AudioBuffer<float> mix(2, frames);
    for (int64 offset = 0; offset < total; offset += frames) {
      const int n = (int)jmin((int64)frames, total - offset);
      mix.clear();
      for (size_t i = 0; i < selected.size(); ++i) {
        if (mode == "separate" && (int)i != fileIndex)
          continue;
        auto &t = *selected[i];
        renderTrack(t, (offset + t.latency) / rate, n, false);
        const float left = t.gain * (t.pan > 0 ? 1 - t.pan : 1);
        const float right = t.gain * (t.pan < 0 ? 1 + t.pan : 1);
        mix.addFrom(0, 0, t.scratch, 0, 0, n, left);
        mix.addFrom(1, 0, t.scratch, 1, 0, n, right);
      }
      if (protection.process(mix.getArrayOfWritePointers(), 2, n, mode == "mix" ? masterGain : 1.0f, limiterEnabled))
        outputClipped = true;
      require(writer->writeFromAudioSampleBuffer(mix, 0, n),
              "Could not write export audio; check free disk space");
    }
    writer.reset();
    files.add(file.getFullPathName());
  }
  return object({{"folder", destination.getFullPathName()}, {"files", files}});
}
} // namespace basement
