#pragma once
#include "Json.h"
#include <atomic>
#include <vector>

namespace basement {
struct Clip {
  String id = Uuid().toString(), name, path;
  double start = 0, sampleRate = 48000;
  AudioBuffer<float> audio;
  Array<var> peaks;
  double duration() const { return audio.getNumSamples() / sampleRate; }
  var json(bool full) const {
    auto v = object(
        {{"id", id}, {"name", name}, {"start", start}, {"duration", duration()}, {"peaks", peaks}});
    if (full)
      v.getDynamicObject()->setProperty("path", path);
    return v;
  }
};
struct Track {
  String id = Uuid().toString(), name, color;
  int input = 0;
  bool armed = false, mute = false, solo = false, bypass = false;
  float gain = 0.8f, pan = 0;
  std::atomic<float> peak{0};
  std::vector<std::unique_ptr<Clip>> clips;
  std::unique_ptr<AudioFormatWriter::ThreadedWriter> writer;
  String recordingPath;
  double recordStart = 0;
  std::unique_ptr<AudioPluginInstance> plugin;
  String pluginPath, pluginName;
  AudioBuffer<float> scratch;
};

} // namespace basement
