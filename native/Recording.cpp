#include "Engine.h"
#include <cmath>

namespace basement {
std::unique_ptr<Clip> Engine::readClip(String path, String name, double start) {
  std::unique_ptr<AudioFormatReader> r(formats.createReaderFor(File(path)));
  require(r != nullptr, "This audio file could not be opened");
  require(r->lengthInSamples > 0 && r->lengthInSamples <= r->sampleRate * 60 * 20,
          "Audio files must be shorter than 20 minutes");
  auto c = std::make_unique<Clip>();
  c->name = name;
  c->path = path;
  c->start = start;
  c->sampleRate = r->sampleRate;
  c->audio.setSize(jmin(2, (int)r->numChannels), (int)r->lengthInSamples);
  require(r->read(&c->audio, 0, c->audio.getNumSamples(), 0, true, true), "Could not decode audio");
  for (int i = 0; i < 400; ++i) {
    // Long takes exceed 32-bit range when multiplied by the bucket index.
    const auto samples = static_cast<int64>(c->audio.getNumSamples());
    const int a = static_cast<int>(i * samples / 400);
    const int b = static_cast<int>((i + 1) * samples / 400);
    c->peaks.add(c->audio.getMagnitude(a, jmax(1, b - a)));
  }
  return c;
}

void Engine::stop() {
  {
    const ScopedLock l(guard);
    playing = false;
    recording = false;
  }
  std::vector<Track *> finalized;
  // Finalize all WAV headers before decoding any take. One bad/oversized take
  // must not leave other tracks' disk writers open.
  for (auto &t : tracks)
    if (t->writer) {
      t->writer.reset();
      finalized.push_back(t.get());
    }
  StringArray errors;
  for (auto *t : finalized) {
    try {
      std::unique_ptr<AudioFormatReader> reader(formats.createReaderFor(File(t->recordingPath)));
      if (reader && reader->lengthInSamples == 0)
        continue;
      reader.reset();
      auto clip = readClip(t->recordingPath, t->name + " take", t->recordStart);
      const ScopedLock lock(guard);
      t->clips.push_back(std::move(clip));
    } catch (const std::exception &error) {
      errors.add(t->name + ": " + String(error.what()) + ". WAV retained at " + t->recordingPath);
    }
  }
  if (!errors.isEmpty())
    throw std::runtime_error(errors.joinIntoString("\n").toStdString());
}

void Engine::beginRecording() {
  require(!playing, "Stop playback before starting a take");
  auto *d = devices.getCurrentAudioDevice();
  require(testDevice || d != nullptr, "Choose an audio device first");
  int count = 0;
  for (auto &t : tracks)
    if (t->armed) {
      require(t->input >= 0 &&
                  t->input < (testDevice ? 2 : d->getActiveInputChannels().countNumberOfSetBits()),
              "A marked track uses an unavailable input. Check Audio setup.");
      ++count;
    }
  require(count > 0, "Mark at least one track with its record button");
  diskOverrun = false;
  try {
    for (auto &t : tracks)
      if (t->armed) {
        t->recordingPath = File(folder).getChildFile(Uuid().toString() + ".wav").getFullPathName();
        auto output = File(t->recordingPath).createOutputStream();
        require(output != nullptr, "Cannot create recording file");
        WavAudioFormat wav;
        auto *writer = wav.createWriterFor(output.get(), rate, 1, 24, {}, 0);
        require(writer != nullptr, "Cannot create WAV writer");
        output.release();
        t->writer = std::make_unique<AudioFormatWriter::ThreadedWriter>(writer, disk, 262144);
        t->recordStart = position;
      }
  } catch (...) {
    for (auto &t : tracks)
      t->writer.reset();
    throw;
  }
  const ScopedLock l(guard);
  recording = true;
  playing = true;
}
} // namespace basement
