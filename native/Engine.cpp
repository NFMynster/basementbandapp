#include "Engine.h"
#include <cmath>
#include <iostream>

namespace basement {
Track &Engine::track(const var &c) {
  for (auto &t : tracks)
    if (t->id == str(c, "track"))
      return *t;
  throw std::runtime_error("Track no longer exists");
}

void Engine::add(String name, String color, int input) {
  auto t = std::make_unique<Track>();
  t->name = name;
  if (name == "Bass")
    t->icon = "bass";
  t->color = color;
  t->input = input;
  t->collector.reset(rate);
  t->liveMidi.ensureSize(65536);
  t->scratch.setSize(2, jmax(block, 8192));
  tracks.push_back(std::move(t));
}

Engine::Engine(bool testing) : testDevice(testing) {
  formats.registerBasicFormats();
  addDefaultFormatsToManager(plugins);
  disk.startThread();
  midi.ensureSize(65536);
}

void Engine::initializeAudio(bool inputAllowed) {
  if (testDevice)
    return;
  std::cerr << "Opening audio device (inputs " << (inputAllowed ? 2 : 0) << ")" << std::endl;
  AudioDeviceManager::AudioDeviceSetup preferred;
  preferred.bufferSize = 1024;
  deviceError = devices.initialise(inputAllowed ? 2 : 0, 2, nullptr, true, {}, &preferred);
  devices.addAudioCallback(this);
  devices.addMidiInputDeviceCallback({}, this);
  std::cerr << "Audio device initialization finished: " << deviceError << std::endl;
}

Engine::~Engine() {
  devices.removeMidiInputDeviceCallback({}, this);
  devices.removeAudioCallback(this);
  editor.reset();
  for (auto &t : tracks)
    t->writer.reset();
  disk.stopThread(5000);
}

var Engine::state(bool full) {
  const ScopedLock lock(guard);
  Array<var> list;
  for (auto &t : tracks) {
    Array<var> clips;
    for (auto &c : t->clips)
      clips.add(c->json(full));
    auto v = object({{"id", t->id},
                     {"name", t->name},
                     {"color", t->color},
                     {"icon", t->icon},
                     {"input", t->input},
                     {"kind", t->isMidi ? "midi" : "audio"},
                     {"midiDevice", t->midiDevice},
                     {"midiChannel", t->midiChannel},
                     {"latencySamples", t->latency},
                     {"armed", t->armed},
                     {"monitor", t->monitor},
                     {"recordStart", t->recordStart},
                     {"mute", t->mute},
                     {"solo", t->solo},
                     {"gain", t->gain},
                     {"pan", t->pan},
                     {"peak", t->peak.load()},
                     {"clips", clips},
                     {"pluginName", t->pluginName},
                     {"bypass", t->bypass}});
    if (full) {
      v.getDynamicObject()->setProperty("pluginPath", t->pluginPath);
      if (t->plugin) {
        MemoryBlock b;
        t->plugin->getStateInformation(b);
        v.getDynamicObject()->setProperty("pluginState", b.toBase64Encoding());
      }
    }
    list.add(v);
  }
  auto *d = devices.getCurrentAudioDevice();
  return object(
      {{"title", title},
       {"tracks", list},
       {"position",
        recording && cycleRecording
            ? recordingLoopStart + std::fmod(jmax(0.0, position.load() - recordingLoopStart),
                                             recordingLoopEnd - recordingLoopStart)
            : position.load()},
       {"playing", playing.load()},
       {"recording", recording.load()},
       {"looping", looping},
       {"loopStart", loopStart},
       {"loopEnd", loopEnd},
       {"tempo", tempo},
       {"masterGain", masterGain},
       {"metronome", metronome},
       {"countIn", countIn},
       {"countdown", countRemaining > 0 ? (int)std::ceil(countRemaining / (rate * 60 / tempo)) : 0},
       {"sampleRate", rate},
       {"bufferSize", block},
       {"inputLatencySamples", inputLatency},
       {"outputLatencySamples", outputLatency},
       {"device", d ? d->getName() : "No audio device"},
       {"deviceError", deviceError},
       {"diskOverrun", diskOverrun.load()}});
}
} // namespace basement
