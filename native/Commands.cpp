#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::command(const var &c) {
  auto op = str(c, "op");
  if (op == "limiter") {
    require(c["value"].isBool(), "Invalid output protection switch");
    { const ScopedLock lock(guard); limiterEnabled = flag(c, "value"); outputProtection.reset(); outputClipped = false; }
    return state();
  }
  if (op == "clearDiagnostics") {
    outputClipped = false;
    processingDropouts = 0;
    recordingDropouts = 0;
    deviceXRunBaseline = jmax(0, devices.getXRunCount());
    return state();
  }
  if (op == "master") {
    const ScopedLock lock(guard);
    masterGain = (float)jlimit(0.0, 2.0, number(c, "value", 1));
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
    // A test pump may span many hardware blocks. Respect the maximum block
    // promised to VST3 instances, including MIDI event offsets across blocks.
    std::vector<MidiBuffer> queued;
    for (auto &t : tracks)
      queued.push_back(t->liveMidi);
    for (int offset = 0; offset < n; offset += block) {
      const int count = jmin(block, n - offset);
      for (size_t index = 0; index < tracks.size(); ++index) {
        tracks[index]->liveMidi.clear();
        tracks[index]->liveMidi.addEvents(queued[index], offset, count, -offset);
      }
      const float *input[] = {in.getReadPointer(0, offset), in.getReadPointer(1, offset)};
      float *output[] = {out.getWritePointer(0, offset), out.getWritePointer(1, offset)};
      audioDeviceIOCallbackWithContext(input, 2, output, 2, count, {});
    }
    Array<var> left, right;
    for (int i = 0; i < n; ++i) {
      left.add(out.getSample(0, i));
      right.add(out.getSample(1, i));
    }
    return object({{"left", left}, {"right", right}, {"state", state()}});
  }
  if (op == "state") {
    for (auto &t : tracks)
      if (t->latency != t->pluginLatency()) {
        const ScopedLock lock(guard);
        prepareTrack(*t, position, looping);
      }
    return state();
  }
  if (op == "preset") {
    require(!playing, "Stop playback before applying a preset");
    auto &t = track(c);
    const auto preset = JSON::parse(str(c, "preset"));
    require(preset.isObject() && (str(preset, "kind") == "midi") == t.isMidi, "Choose a preset for this track type");
    Track prepared;
    prepared.isMidi = t.isMidi;
    prepared.scratch.setSize(2, jmax(block, 8192));
    prepared.sound.prepare(rate, jmax(block, 8192));
    prepared.sound.update(preset);
    prepared.liveMidi.ensureSize(65536);
    if (str(preset, "pluginPath").isNotEmpty()) loadPlugin(prepared, str(preset, "pluginPath"), str(preset, "pluginState"), false, (int)number(preset, "pluginUid"));
    if (preset["effects"].isArray()) for (auto &slot : *preset["effects"].getArray()) {
      loadPlugin(prepared, str(slot, "path"), str(slot, "state"), true, (int)number(slot, "uid"));
      prepared.effects.back().bypass = flag(slot, "bypass");
    }
    const ScopedLock lock(guard);
    t.plugin = std::move(prepared.plugin); t.pluginPath = prepared.pluginPath; t.pluginName = prepared.pluginName; t.pluginUid = prepared.pluginUid;
    t.effects = std::move(prepared.effects);
    t.bypass = flag(preset, "bypass");
    t.gain = (float)jlimit(0.0, 1.5, number(preset, "gain", 0.8));
    t.pan = (float)jlimit(-1.0, 1.0, number(preset, "pan"));
    t.eqBass = (float)jlimit(-12.0, 12.0, number(preset, "eqBass"));
    t.eqMid = (float)jlimit(-12.0, 12.0, number(preset, "eqMid"));
    t.eqTreble = (float)jlimit(-12.0, 12.0, number(preset, "eqTreble"));
    auto soundSettings = object({});
    prepared.sound.write(soundSettings);
    t.sound.update(soundSettings);
    t.eqEnabled = !preset.hasProperty("eqEnabled") || flag(preset, "eqEnabled");
    if (t.plugin) t.plugin->setPlayHead(&t.playHead);
    for (auto &effect : t.effects) effect.plugin->setPlayHead(&t.playHead);
    prepareTrack(t, position, looping);
    return state();
  }
  if (op == "createMidi") {
    require(!recording, "Stop recording before creating a region");
    auto &t = track(c);
    require(t.isMidi, "Choose a MIDI track");
    const double at = number(c, "position"), duration = number(c, "length", 960.0 / tempo);
    require(std::isfinite(at) && at >= 0 && std::isfinite(duration) && duration >= 0.001 && duration <= 1200, "Invalid MIDI region");
    auto clip = std::make_unique<Clip>();
    clip->isMidi = true; clip->name = t.name + " notes"; clip->start = at; clip->midiLength = duration;
    persistMidi(*clip, std::make_shared<MidiMessageSequence>());
    const ScopedLock lock(guard);
    t.clips.push_back(std::move(clip));
    prepareTrack(t, position, looping);
    return state();
  }
  if (op == "reorderEffect") {
    require(!playing, "Stop playback before reordering effects");
    auto &t = track(c);
    const double raw = number(c, "index", -1);
    require(raw >= (t.isMidi ? 0 : -1) && raw < (double)t.effects.size() && raw == std::floor(raw), "Invalid effect position");
    require(raw != -1 || t.plugin != nullptr, "Load the first effect before reordering");
    const ScopedLock lock(guard);
    if (str(c, "effect") == "primary") {
      require(!t.isMidi && t.plugin && raw >= 0 && !t.effects.empty(), "Instrument stays first");
      Effect previous; previous.plugin = std::move(t.plugin); previous.path = t.pluginPath; previous.name = t.pluginName; previous.uid = t.pluginUid; previous.bypass = t.bypass;
      auto first = std::move(t.effects.front()); t.effects.erase(t.effects.begin());
      t.plugin = std::move(first.plugin); t.pluginPath = first.path; t.pluginName = first.name; t.pluginUid = first.uid; t.bypass = first.bypass;
      t.effects.insert(t.effects.begin() + (int)raw, std::move(previous));
    } else {
      auto found = std::find_if(t.effects.begin(), t.effects.end(), [&](auto &e) { return e.id == str(c, "effect"); });
      require(found != t.effects.end(), "Effect no longer exists");
      auto effect = std::move(*found); t.effects.erase(found);
      if (raw == -1) {
        Effect previous; previous.plugin = std::move(t.plugin); previous.path = t.pluginPath; previous.name = t.pluginName; previous.uid = t.pluginUid; previous.bypass = t.bypass;
        t.plugin = std::move(effect.plugin); t.pluginPath = effect.path; t.pluginName = effect.name; t.pluginUid = effect.uid; t.bypass = effect.bypass;
        t.effects.insert(t.effects.begin(), std::move(previous));
      } else t.effects.insert(t.effects.begin() + (int)raw, std::move(effect));
    }
    prepareTrack(t, position, looping);
    return state();
  }
  if (op == "scanPlugin") {
    require(testDevice, "Scanning requires the scanner process");
    OwnedArray<PluginDescription> found;
    for (int i = 0; i < plugins.getNumFormats(); ++i) plugins.getFormat(i)->findAllTypesForFile(found, str(c, "path"));
    Array<var> result;
    for (auto *p : found) result.add(object({{"name", p->name}, {"path", p->fileOrIdentifier}, {"manufacturer", p->manufacturerName}, {"instrument", p->isInstrument}, {"uid", p->uniqueId}}));
    return result;
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
    return state(true, !flag(c, "metadataOnly"));
  }
  if (op == "devices") {
    return listDevices();
  }
  if (c.hasProperty("effect") && (op == "editor" || op == "bypass" || op == "removePlugin")) {
    auto &t = track(c);
    auto found = std::find_if(t.effects.begin(), t.effects.end(), [&](auto &e) { return e.id == str(c, "effect"); });
    require(found != t.effects.end(), "Effect no longer exists");
    if (op == "editor") {
      editor.reset();
      if (!testDevice) editor = std::make_unique<PluginWindow>(*found->plugin);
    } else {
      require(!playing, "Stop playback before changing effects");
      editor.reset();
      const ScopedLock lock(guard);
      if (op == "removePlugin") t.effects.erase(found);
      else found->bypass = flag(c, "value");
      prepareTrack(t, position, looping);
    }
    return state();
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
    // Seeking deliberately restarts playback. Do not classify the silence while
    // resetting/priming processors as a lost recording block.
    const bool resume = playing.exchange(false);
    const ScopedLock l(guard);
    position = jmax(0.0, number(c, "position"));
    preparePlayback(position, looping);
    playing = resume;
  } else if (op == "loop") {
    require(!recording, "Stop recording before changing the loop");
    const ScopedLock l(guard);
    loopStart = jmax(0.0, number(c, "start"));
    loopEnd = jmax(loopStart + 0.05, number(c, "end", 8));
    looping = flag(c, "enabled");
    preparePlayback(position, looping);
  } else if (op == "tempo") {
    changeTempo(c);
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
    auto settings = c.clone();
    settings.getDynamicObject()->setProperty("track", tracks.back()->id);
    try { updateTrack(settings); } catch (...) { tracks.pop_back(); throw; }
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
    prepareTrack(t, position, looping);
  } else if (op == "plugin") {
    auto &t = track(c);
    const bool effect = flag(c, "append");
    loadPlugin(t, str(c, "path"), {}, effect, (int)number(c, "uid"));
    if (!testDevice)
      editor = std::make_unique<PluginWindow>(effect ? *t.effects.back().plugin : *t.plugin);
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
