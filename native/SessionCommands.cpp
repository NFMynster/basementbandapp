#include "Engine.h"
#include <cmath>

namespace basement {
void Engine::resetSession(const var &c) {
  stop();
  editor.reset();
  const ScopedLock l(guard);
  tracks.clear();
  folder = str(c, "folder");
  title = "Friday night";
  diskOverrun = false;
  position = 0;
  looping = false;
  loopStart = 0;
  loopEnd = 8;
  tempo = 120;
  add("Guitar", "#58a9e8", 0);
  add("Bass", "#c093eb", 1);
}

void Engine::restoreSession(const var &c) {
  require(!recording, "Stop recording before opening a session");
  stop();
  auto session = c["session"];
  require(session["tracks"].isArray(), "Invalid session tracks");
  // Decode before replacing the existing session, so missing/corrupt media
  // cannot destroy it.
  std::vector<std::unique_ptr<Track>> loaded;
  for (auto &v : *session["tracks"].getArray()) {
    auto t = std::make_unique<Track>();
    t->id = str(v, "id");
    t->name = str(v, "name");
    t->color = str(v, "color");
    t->input = (int)number(v, "input");
    t->isMidi = str(v, "kind") == "midi";
    t->midiDevice = str(v, "midiDevice");
    t->midiChannel = jlimit(0, 16, (int)number(v, "midiChannel"));
    t->collector.reset(rate);
    t->liveMidi.ensureSize(65536);
    t->gain = (float)number(v, "gain", 0.8);
    t->pan = (float)number(v, "pan");
    t->mute = flag(v, "mute");
    t->solo = flag(v, "solo");
    t->armed = flag(v, "armed");
    t->bypass = flag(v, "bypass");
    t->scratch.setSize(2, jmax(block, 8192));
    require(v["clips"].isArray(), "Invalid session clips");
    for (auto &cv : *v["clips"].getArray()) {
      auto clip = t->isMidi ? readMidiClip(str(cv, "path"), str(cv, "name"), number(cv, "start"))
                            : readClip(str(cv, "path"), str(cv, "name"), number(cv, "start"));
      clip->id = str(cv, "id");
      t->clips.push_back(std::move(clip));
    }
    if (str(v, "pluginPath").isNotEmpty())
      loadPlugin(*t, str(v, "pluginPath"), str(v, "pluginState"));
    loaded.push_back(std::move(t));
  }
  for (auto &t : loaded)
    if (t->isMidi && t->midiDevice.isNotEmpty())
      devices.setMidiInputDeviceEnabled(t->midiDevice, true);
  editor.reset();
  const ScopedLock l(guard);
  tracks = std::move(loaded);
  folder = str(c, "folder");
  title = str(session, "title");
  position = 0;
  tempo = number(session, "tempo", 120);
  loopStart = number(session, "loopStart");
  loopEnd = number(session, "loopEnd", 8);
  looping = flag(session, "looping");
  preparePlayback(position, looping);
}
} // namespace basement
