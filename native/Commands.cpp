#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::command(const var &c) {
  auto op = str(c, "op");
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
  if (op == "state")
    return state();
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
    playing = true;
  } else if (op == "record") {
    beginRecording();
  } else if (op == "seek") {
    require(!recording, "Cannot move the playhead while recording");
    const ScopedLock l(guard);
    position = jmax(0.0, number(c, "position"));
  } else if (op == "loop") {
    const ScopedLock l(guard);
    loopStart = jmax(0.0, number(c, "start"));
    loopEnd = jmax(loopStart + 0.05, number(c, "end", 8));
    looping = flag(c, "enabled");
  } else if (op == "tempo") {
    const ScopedLock l(guard);
    tempo = jlimit(40.0, 240.0, number(c, "value", 120));
  } else if (op == "rename") {
    title = str(c, "title").substring(0, 100);
  } else if (op == "addTrack") {
    require(!recording, "Stop recording before adding tracks");
    require(tracks.size() < 32, "This version supports up to 32 tracks");
    const ScopedLock l(guard);
    add("Audio " + String(tracks.size() + 1), tracks.size() % 2 ? "#c093eb" : "#58a9e8", 0);
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
    auto clip = readClip(dest.getFullPathName(), source.getFileNameWithoutExtension(), position);
    const ScopedLock l(guard);
    t.clips.push_back(std::move(clip));
  } else if (op == "removeClip") {
    require(!recording, "Stop recording before editing regions");
    auto &t = track(c);
    const ScopedLock l(guard);
    std::erase_if(t.clips, [&](auto &clip) { return clip->id == str(c, "clip"); });
  } else if (op == "removePlugin") {
    require(!playing, "Stop playback before removing a plugin");
    auto &t = track(c);
    editor.reset();
    const ScopedLock lock(guard);
    t.plugin.reset();
    t.pluginPath.clear();
    t.pluginName.clear();
    t.bypass = false;
  } else if (op == "plugin") {
    auto &t = track(c);
    loadPlugin(t, str(c, "path"));
    if (!testDevice)
      editor = std::make_unique<PluginWindow>(*t.plugin);
  } else if (op == "bypass") {
    auto &t = track(c);
    const ScopedLock l(guard);
    t.bypass = flag(c, "value");
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
  const ScopedLock l(guard);
  if (c.hasProperty("name"))
    t.name = str(c, "name").substring(0, 80);
  if (c.hasProperty("armed")) {
    require(!recording, "Stop recording before changing marked tracks");
    t.armed = flag(c, "armed");
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
