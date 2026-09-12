#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::handlePluginCommand(const var &c) {
  const auto op = str(c, "op");
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
  if (op == "removePlugin") {
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
  } else throw std::runtime_error("Unknown plugin command");
  syncAudioInput();
  return state();
}
} // namespace basement
