#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::handleTrackCommand(const var &c) {
  const auto op = str(c, "op");
  if (op == "duplicateTrack") {
    require(!playing, "Stop playback before duplicating a track");
    require(tracks.size() < 32, "This version supports up to 32 tracks");
    auto &source = track(c);
    var settings;
    auto snapshot = state(true);
    for (auto &v : *snapshot["tracks"].getArray())
      if (str(v, "id") == source.id) settings = v.clone();
    auto *props = settings.getDynamicObject();
    props->setProperty("op", "addTrack");
    props->setProperty("name", source.name + " copy");
    props->setProperty("armed", false);
    props->setProperty("monitor", false);
    command(settings);
    auto &copy = *tracks.back();
    try {
      command(object({{"op", "preset"}, {"track", copy.id}, {"preset", JSON::toString(settings)}}));
      if (!flag(c, "empty")) {
        const ScopedLock lock(guard);
        std::map<String, String> groups;
        for (auto &clip : source.clips) {
          auto cloned = std::make_unique<Clip>(*clip);
          cloned->id = Uuid().toString();
          if (cloned->takeGroup.isNotEmpty()) {
            if (!groups.contains(cloned->takeGroup)) groups[cloned->takeGroup] = Uuid().toString();
            cloned->takeGroup = groups[cloned->takeGroup];
          }
          cloned->cachedKey.clear();
          copy.clips.push_back(std::move(cloned));
        }
      }
    } catch (...) { const ScopedLock lock(guard); tracks.pop_back(); throw; }
    return state();
  }
  if (op == "addTrack") {
    require(!recording, "Stop recording before adding tracks");
    require(tracks.size() < 32, "This version supports up to 32 tracks");
    const ScopedLock l(guard);
    add("Audio " + String(tracks.size() + 1), tracks.size() % 2 ? "#c093eb" : "#58a9e8", 0);
    if (str(c, "kind") == "midi") {
      tracks.back()->isMidi = true;
      tracks.back()->monitor = true;
      tracks.back()->name = "MIDI " + String(tracks.size());
      tracks.back()->color = "#b0c4a7";
      tracks.back()->icon = "keys";
    }
    auto settings = c.clone();
    settings.getDynamicObject()->setProperty("track", tracks.back()->id);
    try { updateTrack(settings); } catch (...) { const ScopedLock lock(guard); tracks.pop_back(); throw; }
  } else if (op == "track") {
    updateTrack(c);
  } else if (op == "reorderTrack") {
    require(!playing, "Stop transport before reordering tracks");
    const ScopedLock lock(guard);
    auto &selected = track(c);
    const int index = (int)number(c, "index", -1);
    require(index >= 0 && index < (int)tracks.size(), "Invalid track position");
    auto it = std::find_if(tracks.begin(), tracks.end(), [&](const auto &t) { return t.get() == &selected; });
    auto moved = std::move(*it);
    tracks.erase(it);
    tracks.insert(tracks.begin() + index, std::move(moved));
  } else if (op == "removeTrack") {
    require(!playing, "Stop transport before removing a track");
    editor.reset();
    const ScopedLock l(guard);
    std::erase_if(tracks, [&](auto &t) { return t->id == str(c, "track"); });
  } else throw std::runtime_error("Unknown track command");
  syncAudioInput();
  return state();
}

void Engine::updateTrack(const var &c) {
  auto &t = track(c);
  if (!t.isMidi && !audioInputActive && (flag(c, "armed") || flag(c, "monitor")))
    require(!playing, "Stop playback before enabling an audio input. MIDI monitoring does not need it.");
  if (c.hasProperty("midiDevice")) {
    require(!recording, "Stop recording before changing MIDI inputs");
    const auto id = str(c, "midiDevice");
    if (id.isNotEmpty() && !testDevice) {
      bool found = false;
      for (const auto &device : MidiInput::getAvailableDevices())
        found |= device.identifier == id;
      require(found, "MIDI input is no longer available");
      devices.setMidiInputDeviceEnabled(id, true);
      require(devices.isMidiInputDeviceEnabled(id), "Could not open MIDI input");
    }
  }
  const ScopedLock l(guard);
  t.sound.update(c);
  if (c.hasProperty("monitor")) {
    t.monitor = flag(c, "monitor");
    if (t.isMidi)
      sendPanic(t);
  }
  if (c.hasProperty("midiDevice")) {
    t.midiDevice = str(c, "midiDevice");
    t.collector.reset(rate);
    sendPanic(t);
  }
  if (c.hasProperty("midiChannel")) {
    require(!recording, "Stop recording before changing MIDI channels");
    t.midiChannel = jlimit(0, 16, (int)number(c, "midiChannel"));
    sendPanic(t);
  }
  if (c.hasProperty("name"))
    t.name = str(c, "name").substring(0, 80);
  if (c.hasProperty("color")) {
    auto color = str(c, "color");
    require(color.length() == 7 && color.startsWithChar('#') &&
                color.substring(1).containsOnly("0123456789abcdefABCDEF"),
            "Invalid track color");
    t.color = color;
  }
  if (c.hasProperty("icon")) {
    auto icon = str(c, "icon");
    require(StringArray{"guitar", "bass", "drums", "keys", "mic", "audio"}.contains(icon),
            "Invalid track icon");
    t.icon = icon;
  }
  if (c.hasProperty("armed")) {
    require(!recording, "Stop recording before changing marked tracks");
    t.armed = flag(c, "armed");
    if (t.isMidi) {
      t.collector.reset(rate);
      sendPanic(t);
    }
  }
  if (c.hasProperty("input")) {
    require(!recording, "Stop recording before changing inputs");
    t.input = jlimit(0, 127, (int)number(c, "input"));
  }
  for (auto key : {"eqBass", "eqMid", "eqTreble"})
    if (c.hasProperty(key)) require(std::isfinite(number(c, key)), "Invalid EQ gain");
  if (c.hasProperty("eqEnabled")) t.eqEnabled = flag(c, "eqEnabled");
  if (c.hasProperty("eqBass")) t.eqBass = (float)jlimit(-12.0, 12.0, number(c, "eqBass"));
  if (c.hasProperty("eqMid")) t.eqMid = (float)jlimit(-12.0, 12.0, number(c, "eqMid"));
  if (c.hasProperty("eqTreble")) t.eqTreble = (float)jlimit(-12.0, 12.0, number(c, "eqTreble"));
  if (c.hasProperty("eqBassFrequency")) { require(std::isfinite(number(c, "eqBassFrequency")), "Invalid EQ value"); t.eqBassFrequency = (float)jlimit(20.0, 20000.0, number(c, "eqBassFrequency")); }
  if (c.hasProperty("eqMidFrequency")) { require(std::isfinite(number(c, "eqMidFrequency")), "Invalid EQ value"); t.eqMidFrequency = (float)jlimit(20.0, 20000.0, number(c, "eqMidFrequency")); }
  if (c.hasProperty("eqTrebleFrequency")) { require(std::isfinite(number(c, "eqTrebleFrequency")), "Invalid EQ value"); t.eqTrebleFrequency = (float)jlimit(20.0, 20000.0, number(c, "eqTrebleFrequency")); }
  if (c.hasProperty("eqMidQ")) { require(std::isfinite(number(c, "eqMidQ")), "Invalid EQ value"); t.eqMidQ = (float)jlimit(0.2, 10.0, number(c, "eqMidQ")); }
  if (c.hasProperty("eqLowCut")) { require(std::isfinite(number(c, "eqLowCut")), "Invalid EQ value"); t.eqLowCut = (float)jlimit(20.0, 1000.0, number(c, "eqLowCut")); }
  if (c.hasProperty("gain"))
    t.gain = (float)jlimit(0.0, 1.5, number(c, "gain"));
  if (c.hasProperty("pan"))
    t.pan = (float)jlimit(-1.0, 1.0, number(c, "pan"));
  if (c.hasProperty("mute"))
    t.mute = flag(c, "mute");
  if (c.hasProperty("solo"))
    t.solo = flag(c, "solo");
}
} // namespace basement
