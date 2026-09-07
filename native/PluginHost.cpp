#include "Engine.h"
#include <cmath>

namespace basement {
void Engine::loadPlugin(Track &t, const String &path, const String &state) {
  require(!playing, "Stop playback before changing plugins");
  OwnedArray<PluginDescription> descriptions;
  for (int i = 0; i < plugins.getNumFormats(); ++i)
    plugins.getFormat(i)->findAllTypesForFile(descriptions, path);
  require(!descriptions.isEmpty(), "No compatible VST3 plugin was found in this bundle");
  String error;
  auto p = plugins.createPluginInstance(*descriptions[0], rate, block, error);
  if (!p)
    throw std::runtime_error(error.toStdString());
  p->disableNonMainBuses();
  auto layout = p->getBusesLayout();
  require(layout.outputBuses.size() > 0, "Plug-in needs an audio output");
  require(t.isMidi ? p->acceptsMidi() : layout.inputBuses.size() > 0,
          t.isMidi ? "Choose a MIDI instrument for this track"
                   : "Choose an audio effect for this track");
  if (layout.inputBuses.size() > 0)
    layout.inputBuses.set(0, t.isMidi ? AudioChannelSet::disabled() : AudioChannelSet::stereo());
  layout.outputBuses.set(0, AudioChannelSet::stereo());
  require(p->setBusesLayout(layout), "This first version requires a stereo-compatible effect");
  p->setRateAndBufferSizeDetails(rate, block);
  p->prepareToPlay(rate, block);
  if (state.isNotEmpty()) {
    MemoryBlock b;
    require(b.fromBase64Encoding(state), "Invalid plugin state");
    p->setStateInformation(b.getData(), (int)b.getSize());
  }
  require(p->getLatencySamples() <= rate * 10,
          "Plug-in latency exceeds the supported ten-second limit");
  editor.reset();
  const ScopedLock l(guard);
  t.plugin = std::move(p);
  t.pluginName = descriptions[0]->name;
  t.pluginPath = path;
  prepareTrack(t, position, looping && !recording);
}
} // namespace basement
