#include "Engine.h"
#include <cmath>

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
  t->color = color;
  t->input = input;
  t->scratch.setSize(2, jmax(block, 8192));
  tracks.push_back(std::move(t));
}

Engine::Engine(bool testing) : testDevice(testing) {
  formats.registerBasicFormats();
  addDefaultFormatsToManager(plugins);
  disk.startThread();
  if (!testing) {
    deviceError = devices.initialise(2, 2, nullptr, true);
    devices.addAudioCallback(this);
  }
}

Engine::~Engine() {
  devices.removeAudioCallback(this);
  editor.reset();
  for (auto &t : tracks)
    t->writer.reset();
  disk.stopThread(5000);
}

var Engine::state(bool full) {
  Array<var> list;
  for (auto &t : tracks) {
    Array<var> clips;
    for (auto &c : t->clips)
      clips.add(c->json(full));
    auto v = object({{"id", t->id},
                     {"name", t->name},
                     {"color", t->color},
                     {"input", t->input},
                     {"armed", t->armed},
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
  return object({{"title", title},
                 {"tracks", list},
                 {"position", position.load()},
                 {"playing", playing.load()},
                 {"recording", recording.load()},
                 {"looping", looping},
                 {"loopStart", loopStart},
                 {"loopEnd", loopEnd},
                 {"tempo", tempo},
                 {"sampleRate", rate},
                 {"bufferSize", block},
                 {"device", d ? d->getName() : "No audio device"},
                 {"deviceError", deviceError},
                 {"diskOverrun", diskOverrun.load()}});
}
} // namespace basement
