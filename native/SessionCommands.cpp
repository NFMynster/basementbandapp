#include "Engine.h"
#include <cmath>
#include <map>

namespace basement {
void Engine::resetSession(const var &c) {
  stop();
  { const ScopedLock lock(guard); tunerTrack.clear(); }
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
  limiterEnabled = true;
  outputProtection.reset();
  outputClipped = false;
  add("Guitar", "#58a9e8", 0);
  add("Bass", "#c093eb", 1);
}

void Engine::restoreSession(const var &c) {
  require(!recording, "Stop recording before opening a session");
  stop();
  { const ScopedLock lock(guard); tunerTrack.clear(); }
  auto session = c["session"];
  const auto clickGain = number(session, "metronomeGain");
  require(std::isfinite(clickGain) && clickGain >= 0 && clickGain <= 4, "Invalid metronome volume");
  const bool preserve = flag(c, "preservePlugins");
  auto replacePlugins = [&](const String &id) {
    if (c["replacePlugins"].isArray()) for (auto &v : *c["replacePlugins"].getArray()) if (v.toString() == id) return true;
    return false;
  };
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
    t->sound.prepare(rate, jmax(block, 8192));
    t->sound.update(v);
    t->eqEnabled = flag(v, "eqEnabled");
    t->eqBass = (float)jlimit(-12.0, 12.0, number(v, "eqBass"));
    t->eqMid = (float)jlimit(-12.0, 12.0, number(v, "eqMid"));
    t->eqTreble = (float)jlimit(-12.0, 12.0, number(v, "eqTreble"));
    t->eqBassFrequency = (float)jlimit(20.0, 20000.0, number(v, "eqBassFrequency", 180));
    t->eqMidFrequency = (float)jlimit(20.0, 20000.0, number(v, "eqMidFrequency", 1000));
    t->eqTrebleFrequency = (float)jlimit(20.0, 20000.0, number(v, "eqTrebleFrequency", 6000));
    t->eqMidQ = (float)jlimit(0.2, 10.0, number(v, "eqMidQ", 0.7));
    t->eqLowCut = (float)jlimit(20.0, 1000.0, number(v, "eqLowCut", 20));
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
      clip->gain = (float)number(cv, "gain");
      clip->fadeIn = number(cv, "fadeIn");
      clip->fadeOut = number(cv, "fadeOut");
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
    const bool existing = preserve && !replacePlugins(t->id) && std::any_of(tracks.begin(), tracks.end(), [&](auto &live) { return live->id == t->id; });
    if (!existing && str(v, "pluginPath").isNotEmpty())
      loadPlugin(*t, str(v, "pluginPath"), str(v, "pluginState"), false, (int)number(v, "pluginUid"));
    if (!existing && v["effects"].isArray())
      for (auto &slot : *v["effects"].getArray()) {
        loadPlugin(*t, str(slot, "path"), str(slot, "state"), true, (int)number(slot, "uid"));
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
      if (found == tracks.end() || replacePlugins(t->id)) continue;
      // Keep live processor instances while restoring the requested metadata.
      t->plugin = std::move((*found)->plugin);
      t->pluginPath = (*found)->pluginPath;
      t->pluginName = (*found)->pluginName;
      t->pluginUid = (*found)->pluginUid;
      for (auto &v : *session["tracks"].getArray()) {
        if (str(v, "id") != t->id || !v["effects"].isArray()) continue;
        for (auto &slot : *v["effects"].getArray()) {
          auto effect = std::find_if((*found)->effects.begin(), (*found)->effects.end(), [&](auto &e) { return e.id == str(slot, "id"); });
          require(effect != (*found)->effects.end(), "Effect history no longer matches");
          effect->bypass = flag(slot, "bypass");
          t->effects.push_back(std::move(*effect));
        }
      }
      if (t->plugin) t->plugin->setPlayHead(&t->playHead);
      for (auto &effect : t->effects) effect.plugin->setPlayHead(&t->playHead);
    }
  tracks = std::move(loaded);
  folder = str(c, "folder");
  title = str(session, "title");
  position = 0;
  tempo = number(session, "tempo");
  masterGain = (float)number(session, "masterGain");
  limiterEnabled = flag(session, "limiterEnabled");
  outputClipped = false;
  loopStart = number(session, "loopStart");
  loopEnd = number(session, "loopEnd");
  looping = flag(session, "looping");
  metronome = flag(session, "metronome");
  metronomeGain = (float)clickGain;
  countIn = flag(session, "countIn");
  preparePlayback(position, looping);
}
var Engine::handleSessionCommand(const var &c) {
  const auto op = str(c, "op");
  if (op == "state") {
    for (auto &t : tracks)
      if (t->latency != t->pluginLatency()) {
        const ScopedLock lock(guard);
        prepareTrack(*t, position, looping);
      }
    return state();
  }
  if (op == "snapshot") {
    require(!recording, "Stop recording before saving");
    return state(true, !flag(c, "metadataOnly"));
  }
  if (op == "init" || op == "new") {
    resetSession(c);
  } else if (op == "restore") {
    restoreSession(c);
  } else if (op == "rename") {
    title = str(c, "title").substring(0, 100);
  } else throw std::runtime_error("Unknown session command");
  syncAudioInput();
  return state();
}
} // namespace basement
