#include "Engine.h"
#include <cmath>

namespace basement {
void Engine::loadPlugin(Track &t, const String &path, const String &state, bool effect, int uid) {
  require(!playing, "Stop playback before changing plugins");
  require(!effect || t.effects.size() < 16, "A track supports up to 16 additional effects");
  OwnedArray<PluginDescription> descriptions;
  for (int i = 0; i < plugins.getNumFormats(); ++i)
    plugins.getFormat(i)->findAllTypesForFile(descriptions, path);
  require(!descriptions.isEmpty(),
          "No compatible VST3 plugin found. Choose a .vst3 file or bundle matching the app "
          "architecture (64-bit on Windows; Apple Silicon on macOS).");
  PluginDescription *description = descriptions[0];
  if (uid != 0) {
    description = nullptr;
    for (auto *candidate : descriptions) if (candidate->uniqueId == uid) description = candidate;
    require(description != nullptr, "Plug-in type no longer exists; rescan the library");
  }
  String error;
  auto p = plugins.createPluginInstance(*description, rate, block, error);
  if (!p)
    throw std::runtime_error(error.toStdString());
  p->disableNonMainBuses();
  auto layout = p->getBusesLayout();
  require(layout.outputBuses.size() > 0, "Plug-in needs an audio output");
  const bool instrument = t.isMidi && !effect;
  require(instrument ? p->acceptsMidi() : layout.inputBuses.size() > 0 && p->getTotalNumInputChannels() > 0,
          instrument ? "Choose a MIDI instrument for this track"
                   : "Choose an audio effect for this track");
  if (layout.inputBuses.size() > 0)
    layout.inputBuses.set(0, instrument ? AudioChannelSet::disabled() : AudioChannelSet::stereo());
  layout.outputBuses.set(0, AudioChannelSet::stereo());
  require(p->setBusesLayout(layout),
          "This version requires a stereo-compatible instrument or effect");
  p->setPlayHead(&t.playHead);
  p->setRateAndBufferSizeDetails(rate, block);
  p->prepareToPlay(rate, block);
  if (state.isNotEmpty()) {
    MemoryBlock b;
    require(b.fromBase64Encoding(state), "Invalid plugin state");
    p->setStateInformation(b.getData(), (int)b.getSize());
  }
  require(p->getLatencySamples() <= rate * 10,
          "Plug-in latency exceeds the supported ten-second limit");
  const int oldPrimary = t.plugin && !t.bypass ? jmax(0, t.plugin->getLatencySamples()) : 0;
  const int nextLatency = effect || !t.bypass ? jmax(0, p->getLatencySamples()) : 0;
  require(t.pluginLatency() - (effect ? 0 : oldPrimary) + nextLatency <= rate * 10,
          "Combined plug-in latency exceeds ten seconds");
  editor.reset();
  const ScopedLock l(guard);
  if (effect) {
    Effect slot;
    slot.plugin = std::move(p);
    slot.name = description->name;
    slot.uid = description->uniqueId;
    slot.path = path;
    t.effects.push_back(std::move(slot));
  } else {
    t.plugin = std::move(p);
    t.pluginName = description->name;
    t.pluginUid = description->uniqueId;
    t.pluginPath = path;
  }
  prepareTrack(t, position, looping && !recording);
}
} // namespace basement
