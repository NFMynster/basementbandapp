#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::exportAudio(const var &c) {
  require(!playing, "Stop playback before exporting");
  const auto mode = str(c, "mode");
  require(mode == "separate" || mode == "mix", "Unknown export mode");
  const auto target = str(c, "track");
  if (target.isNotEmpty())
    track(c); // Validate before creating output.
  const auto parent = File(str(c, "path"));
  require(parent.isDirectory(), "Choose an existing export folder");
  const ScopedLock lock(guard); // Device callbacks return silence while stopped.
  std::vector<Track *> selected;
  bool anySolo = false;
  for (auto &t : tracks)
    anySolo |= t->solo;
  double duration = 0, tail = 0;
  for (auto &t : tracks) {
    if (target.isNotEmpty() && t->id != target)
      continue;
    if (t->clips.empty())
      continue;
    if (mode == "mix" && (t->mute || (anySolo && !t->solo)))
      continue;
    require(!t->isMidi || (t->plugin && !t->bypass),
            "Load an active instrument on each MIDI track before WAV export");
    selected.push_back(t.get());
    for (auto &clip : t->clips)
      duration = jmax(duration, clip->start + clip->duration());
    if (t->plugin && !t->bypass)
      tail = jmax(tail, jlimit(0.0, 10.0, t->plugin->getTailLengthSeconds()));
  }
  require(!selected.empty() && duration > 0, "No audible regions to export");
  require(std::isfinite(duration) && duration + tail <= 60 * 60 * 4,
          "Export must be shorter than four hours");
  auto destination = parent.getNonexistentChildFile("Basement Band Export", "", true);
  require(destination.createDirectory().wasOk(), "Could not create export folder");
  const auto total = (int64)std::ceil((duration + tail) * rate);
  const int frames = jlimit(1, 8192, block);
  Array<var> files;
  // Reset DSP history, not parameters; exports must not inherit the last playback tail.
  for (auto *t : selected)
    prepareTrack(*t, 0, false);
  const ScopeGuard reset([&] {
    for (auto *t : selected)
      if (t->plugin && !t->bypass)
        t->plugin->reset();
  });
  const int count = mode == "mix" ? 1 : (int)selected.size();
  for (int fileIndex = 0; fileIndex < count; ++fileIndex) {
    String name =
        mode == "mix"
            ? "Mix"
            : String(fileIndex + 1).paddedLeft('0', 2) + " - " +
                  File::createLegalFileName(selected[(size_t)fileIndex]->name).substring(0, 80);
    auto file = destination.getChildFile(name + ".wav");
    auto stream = file.createOutputStream();
    require(stream != nullptr, "Could not create export WAV");
    WavAudioFormat format;
    std::unique_ptr<AudioFormatWriter> writer(
        format.createWriterFor(stream.get(), rate, 2, 24, {}, 0));
    require(writer != nullptr, "Could not initialize export WAV");
    stream.release();
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
      for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < n; ++i)
          mix.setSample(ch, i, jlimit(-1.0f, 1.0f, mix.getSample(ch, i)));
      require(writer->writeFromAudioSampleBuffer(mix, 0, n),
              "Could not write export audio; check free disk space");
    }
    writer.reset();
    files.add(file.getFullPathName());
  }
  return object({{"folder", destination.getFullPathName()}, {"files", files}});
}
} // namespace basement
