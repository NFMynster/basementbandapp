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
  require(layout.inputBuses.size() > 0 && layout.outputBuses.size() > 0,
          "Choose an audio effect, not an instrument");
  layout.inputBuses.set(0, AudioChannelSet::stereo());
  layout.outputBuses.set(0, AudioChannelSet::stereo());
  require(p->setBusesLayout(layout), "This first version requires a stereo-compatible effect");
  p->setRateAndBufferSizeDetails(rate, block);
  p->prepareToPlay(rate, block);
  if (state.isNotEmpty()) {
    MemoryBlock b;
    require(b.fromBase64Encoding(state), "Invalid plugin state");
    p->setStateInformation(b.getData(), (int)b.getSize());
  }
  editor.reset();
  const ScopedLock l(guard);
  t.plugin = std::move(p);
  t.pluginName = descriptions[0]->name;
  t.pluginPath = path;
}
} // namespace basement
