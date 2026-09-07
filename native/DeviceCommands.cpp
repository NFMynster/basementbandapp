#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::listDevices() {
  Array<var> types;
  for (auto *type : devices.getAvailableDeviceTypes()) {
    type->scanForDevices();
    Array<var> ins, outs;
    for (auto &s : type->getDeviceNames(true))
      ins.add(s);
    for (auto &s : type->getDeviceNames(false))
      outs.add(s);
    types.add(object({{"name", type->getTypeName()}, {"inputs", ins}, {"outputs", outs}}));
  }
  Array<var> channels, rates, buffers;
  auto *d = devices.getCurrentAudioDevice();
  if (d) {
    for (auto &s : d->getInputChannelNames())
      channels.add(s);
    for (auto r : d->getAvailableSampleRates())
      rates.add(r);
    for (auto b : d->getAvailableBufferSizes())
      buffers.add(b);
  }
  auto setup = devices.getAudioDeviceSetup();
  return object({{"types", types},
                 {"type", devices.getCurrentAudioDeviceType()},
                 {"input", setup.inputDeviceName},
                 {"output", setup.outputDeviceName},
                 {"channels", channels},
                 {"rates", rates},
                 {"buffers", buffers},
                 {"sampleRate", rate},
                 {"bufferSize", block}});
}

var Engine::configureDevice(const var &c) {
  require(!playing, "Stop transport before changing audio devices");
  devices.setCurrentAudioDeviceType(str(c, "type"), true);
  auto setup = devices.getAudioDeviceSetup();
  setup.inputDeviceName = str(c, "input");
  setup.outputDeviceName = str(c, "output");
  setup.sampleRate = number(c, "sampleRate", 48000);
  setup.bufferSize = (int)number(c, "bufferSize", 512);
  setup.useDefaultInputChannels = false;
  setup.inputChannels.clear();
  setup.inputChannels.setRange(0, 128, true);
  deviceError = devices.setAudioDeviceSetup(setup, true);
  if (deviceError.isNotEmpty())
    throw std::runtime_error(deviceError.toStdString());
  return listDevices();
}
} // namespace basement
