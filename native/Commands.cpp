#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::command(const var &c) {
  auto op = str(c, "op");
  if (op == "master") {
    const ScopedLock lock(guard);
    masterGain = (float)jlimit(0.0, 1.0, number(c, "value", 1));
    return state();
  }
  if (op == "testLatency" && testDevice) {
    inputLatency = jlimit(0, 48000, (int)number(c, "input"));
    outputLatency = jlimit(0, 48000, (int)number(c, "output"));
    return state();
  }
  if (op == "testMidi" && testDevice) {
    auto &t = track(c);
    const int channel = jlimit(1, 16, (int)number(c, "channel", 1));
    if ((t.armed || t.monitor) && (t.midiChannel == 0 || t.midiChannel == channel))
      t.liveMidi.addEvent(
          flag(c, "off") ? MidiMessage::noteOff(channel, (int)number(c, "note", 60))
                         : MidiMessage::noteOn(channel, (int)number(c, "note", 60), (uint8)100),
          (int)number(c, "sample"));
    return state();
  }
  if (op == "pump" && testDevice) {
    int n = jlimit(1, 8192, (int)number(c, "frames", 512));
    AudioBuffer<float> in(2, n), out(2, n);
    for (int ch = 0; ch < 2; ++ch)
      for (int i = 0; i < n; ++i)
        in.setSample(ch, i, (float)number(c, ch == 0 ? "left" : "right"));
    audioDeviceIOCallbackWithContext(in.getArrayOfReadPointers(), 2, out.getArrayOfWritePointers(),
                                     2, n, {});
    Array<var> left, right;
    for (int i = 0; i < n; ++i) {
      left.add(out.getSample(0, i));
      right.add(out.getSample(1, i));
    }
    return object({{"left", left}, {"right", right}, {"state", state()}});
  }
  if (op == "state") {
    const ScopedLock lock(guard);
    for (auto &t : tracks)
      if (t->latency != (t->plugin && !t->bypass ? jmax(0, t->plugin->getLatencySamples()) : 0))
        prepareTrack(*t, position, looping);
    return state();
  }
  if (op == "editClip") {
    editClip(c);
    return state();
  }
  if (op == "metronome" || op == "countIn") {
    const ScopedLock lock(guard);
    if (op == "metronome")
      metronome = flag(c, "value");
    else
      countIn = flag(c, "value");
    return state();
  }
  if (op == "export")
    return exportAudio(c);
  if (op == "clearWarning") {
    diskOverrun = false;
    return state();
  }
  if (op == "snapshot") {
    require(!recording, "Stop recording before saving");
    return state(true);
  }
  if (op == "devices") {
    return listDevices();
  }
  if (op == "configure") {
    return configureDevice(c);
  }
  if (op == "init" || op == "new") {
    resetSession(c);
  } else if (op == "restore") {
    restoreSession(c);
  } else if (op == "stop")
    stop();
  else if (op == "play") {
    require(testDevice || devices.getCurrentAudioDevice() != nullptr,
            "Choose an audio device first");
    const ScopedLock l(guard);
    preparePlayback(position, looping);
    playing = true;
  } else if (op == "record") {
    beginRecording();
  } else if (op == "seek") {
    require(!recording, "Cannot move the playhead while recording");
    const ScopedLock l(guard);
    position = jmax(0.0, number(c, "position"));
    preparePlayback(position, looping);
  } else if (op == "loop") {
    require(!recording, "Stop recording before changing the loop");
    const ScopedLock l(guard);
    loopStart = jmax(0.0, number(c, "start"));
    loopEnd = jmax(loopStart + 0.05, number(c, "end", 8));
    looping = flag(c, "enabled");
    preparePlayback(position, looping);
  } else if (op == "tempo") {
    require(!recording, "Stop recording before changing tempo");
    const ScopedLock l(guard);
    tempo = jlimit(40.0, 240.0, number(c, "value", 120));
  } else if (op == "rename") {
    title = str(c, "title").substring(0, 100);
  } else if (op == "addTrack") {
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
  } else if (op == "track") {
    updateTrack(c);
  } else if (op == "removeTrack") {
    require(!playing, "Stop transport before removing a track");
    editor.reset();
    const ScopedLock l(guard);
    std::erase_if(tracks, [&](auto &t) { return t->id == str(c, "track"); });
  } else if (op == "import") {
    require(!recording, "Stop recording before importing audio");
    auto &t = track(c);
    auto source = File(str(c, "path"));
    auto dest = File(folder).getChildFile(Uuid().toString() + source.getFileExtension());
    require(source.copyFileTo(dest), "Could not copy imported audio into this session");
    const auto at = number(c, "position", position);
    require(std::isfinite(at) && at >= 0, "Invalid import position");
    auto clip = t.isMidi
                    ? readMidiClip(dest.getFullPathName(), source.getFileNameWithoutExtension(), at)
                    : readClip(dest.getFullPathName(), source.getFileNameWithoutExtension(), at);
    const ScopedLock l(guard);
    t.clips.push_back(std::move(clip));
  } else if (op == "removeClip") {
    require(!recording, "Stop recording before editing regions");
    auto &t = track(c);
    const ScopedLock l(guard);
    std::erase_if(t.clips, [&](auto &clip) { return clip->id == str(c, "clip"); });
    for (auto &clip : t.clips)
      if (!clip->active && clip->takeGroup.isNotEmpty()) {
        const bool selected = std::any_of(t.clips.begin(), t.clips.end(), [&](auto &other) {
          return other->active && other->takeGroup == clip->takeGroup;
        });
        if (!selected)
          clip->active = true;
      }
    preparePlayback(position, looping);
  } else if (op == "removePlugin") {
    require(!playing, "Stop playback before removing a plugin");
    auto &t = track(c);
    editor.reset();
    const ScopedLock lock(guard);
    t.plugin.reset();
    t.pluginPath.clear();
    t.pluginName.clear();
    t.bypass = false;
    t.latency = 0;
  } else if (op == "plugin") {
    auto &t = track(c);
    loadPlugin(t, str(c, "path"));
    if (!testDevice)
      editor = std::make_unique<PluginWindow>(*t.plugin);
  } else if (op == "bypass") {
    auto &t = track(c);
    const ScopedLock l(guard);
    t.bypass = flag(c, "value");
    prepareTrack(t, position, looping);
  } else if (op == "editor") {
    auto &t = track(c);
    require(t.plugin != nullptr, "Choose a plugin first");
    editor.reset();
    editor = std::make_unique<PluginWindow>(*t.plugin);
  } else
    throw std::runtime_error("Unknown audio command");
  return state();
}

void Engine::updateTrack(const var &c) {
  auto &t = track(c);
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
