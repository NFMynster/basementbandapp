#include "Engine.h"
#include <cmath>
#include <map>

namespace basement {
void Engine::resetSession(const var &c) {
  stop();
  editor.reset();
  const ScopedLock l(guard);
  tracks.clear();
  mediaCache.clear();
  folder = str(c, "folder");
  title = "Friday night";
  diskOverrun = false;
  position = 0;
  looping = false;
  loopStart = 0;
  loopEnd = 8;
  tempo = 120;
  masterGain = 1.0f;
  add("Guitar", "#58a9e8", 0);
  add("Bass", "#c093eb", 1);
}

void Engine::restoreSession(const var &c) {
  require(!recording, "Stop recording before opening a session");
  stop();
  auto session = c["session"];
  const bool preserve = flag(c, "preservePlugins");
  require(session["tracks"].isArray(), "Invalid session tracks");
  // Decode before replacing the existing session, so missing/corrupt media
  // cannot destroy it.
  std::vector<std::unique_ptr<Track>> loaded;
  std::map<String, std::shared_ptr<Clip>> media;
  for (auto &v : *session["tracks"].getArray()) {
    auto t = std::make_unique<Track>();
    t->id = str(v, "id");
    t->name = str(v, "name");
    t->color = str(v, "color");
    t->icon = str(v, "icon");
    t->input = (int)number(v, "input");
    t->isMidi = str(v, "kind") == "midi";
    t->monitor = flag(v, "monitor");
    t->midiDevice = str(v, "midiDevice");
    t->midiChannel = (int)number(v, "midiChannel");
    t->collector.reset(rate);
    t->liveMidi.ensureSize(65536);
    t->gain = (float)number(v, "gain");
    t->pan = (float)number(v, "pan");
    t->mute = flag(v, "mute");
    t->solo = flag(v, "solo");
    t->armed = flag(v, "armed");
    t->bypass = flag(v, "bypass");
    t->scratch.setSize(2, jmax(block, 8192));
    require(v["clips"].isArray(), "Invalid session clips");
    for (auto &cv : *v["clips"].getArray()) {
      const auto key = str(cv, "path");
      if (!media.contains(key))
        media[key] = t->isMidi ? readMidiClip(key, {}, 0) : readClip(key, {}, 0);
      require(media[key]->isMidi == t->isMidi, "Region does not match track type");
      auto clip = std::make_unique<Clip>(*media[key]);
      clip->name = str(cv, "name");
      clip->start = number(cv, "start");
      clip->id = str(cv, "id");
      clip->offset = number(cv, "offset");
      clip->length = number(cv, "length");
      require(clip->offset >= 0 && clip->offset < clip->sourceDuration() &&
                  (clip->length == -1 || (clip->length > 0 && clip->offset + clip->length <=
                                                                  clip->sourceDuration() + 0.002)),
              "Invalid region trim");
      clip->takeGroup = str(cv, "takeGroup");
      clip->take = (int)number(cv, "take");
      clip->active = flag(cv, "active");
      clip->sourceStart = number(cv, "sourceStart");
      clip->sourceEnd = number(cv, "sourceEnd");
      require(clip->sourceStart >= 0 && clip->sourceStart <= clip->offset &&
                  clip->sourceEnd >= clip->offset + clip->duration() - 1e-8 &&
                  clip->sourceEnd <= clip->sourceDuration() + 0.002,
              "Invalid original source bounds");
      t->clips.push_back(std::move(clip));
    }
    const bool existing = preserve && std::any_of(tracks.begin(), tracks.end(), [&](auto &live) { return live->id == t->id; });
    if (!existing && str(v, "pluginPath").isNotEmpty())
      loadPlugin(*t, str(v, "pluginPath"), str(v, "pluginState"));
    if (!existing && v["effects"].isArray())
      for (auto &slot : *v["effects"].getArray()) {
        loadPlugin(*t, str(slot, "path"), str(slot, "state"), true);
        t->effects.back().id = str(slot, "id");
        t->effects.back().bypass = flag(slot, "bypass");
      }
    loaded.push_back(std::move(t));
  }
  for (auto &t : loaded)
    if (t->isMidi && t->midiDevice.isNotEmpty())
      devices.setMidiInputDeviceEnabled(t->midiDevice, true);
  editor.reset();
  const ScopedLock l(guard);
  if (preserve)
    for (auto &t : loaded) {
      auto found = std::find_if(tracks.begin(), tracks.end(), [&](auto &live) { return live && live->id == t->id; });
      if (found == tracks.end()) continue;
      // Keep processors, editors' parameters, routing and mix settings alive.
      (*found)->clips = std::move(t->clips);
      t = std::move(*found);
    }
  tracks = std::move(loaded);
  folder = str(c, "folder");
  title = str(session, "title");
  position = 0;
  tempo = number(session, "tempo");
  masterGain = (float)number(session, "masterGain");
  loopStart = number(session, "loopStart");
  loopEnd = number(session, "loopEnd");
  looping = flag(session, "looping");
  metronome = flag(session, "metronome");
  countIn = flag(session, "countIn");
  preparePlayback(position, looping);
}
} // namespace basement
