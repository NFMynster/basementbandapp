#include "Engine.h"
#include <cmath>

namespace basement {
bool Engine::needsAudioInput() const {
  return configuredInput.isNotEmpty() && (tunerTrack.isNotEmpty() || std::any_of(tracks.begin(), tracks.end(), [](const auto &t) {
    return !t->isMidi && (t->armed || t->monitor);
  }));
}

void Engine::syncAudioInput() {
  monitoringActive = std::any_of(tracks.begin(), tracks.end(), [](const auto &t) { return t->monitor; });
  // Device reconfiguration must never happen under guard (its callbacks take
  // that lock), on the audio thread, or in the middle of a running transport.
  if (playing) return;
  const bool needed = needsAudioInput();
  if (testDevice) { audioInputActive = needed; return; }
  auto setup = devices.getAudioDeviceSetup();
  const String target = needed ? configuredInput : String();
  if (setup.inputDeviceName == target && audioInputActive == needed) return;
  if (auto *d = devices.getCurrentAudioDevice(); d && audioInputActive)
    inputChannelNames = d->getInputChannelNames();
  setup.inputDeviceName = target;
  setup.useDefaultInputChannels = false;
  setup.inputChannels.clear();
  if (needed) setup.inputChannels.setRange(0, 128, true);
  deviceError = devices.setAudioDeviceSetup(setup, false);
  auto *d = devices.getCurrentAudioDevice();
  audioInputActive = d && !d->getActiveInputChannels().isZero();
  if (audioInputActive) inputChannelNames = d->getInputChannelNames();
  if (deviceError.isNotEmpty()) throw std::runtime_error(deviceError.toStdString());
}

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
    if (audioInputActive) inputChannelNames = d->getInputChannelNames();
    for (auto r : d->getAvailableSampleRates())
      rates.add(r);
    for (auto b : d->getAvailableBufferSizes())
      buffers.add(b);
  }
  // Query channel capabilities even when the selected input is idle/unarmed.
  if (!audioInputActive && configuredInput.isNotEmpty())
    if (auto *type = devices.getCurrentDeviceTypeObject()) {
      std::unique_ptr<AudioIODevice> probe(type->createDevice({}, configuredInput));
      if (probe) inputChannelNames = probe->getInputChannelNames();
    }
  if (configuredInput.isNotEmpty())
    for (auto &s : inputChannelNames) channels.add(s);
  auto setup = devices.getAudioDeviceSetup();
  Array<var> midiInputs;
  for (const auto &device : MidiInput::getAvailableDevices())
    midiInputs.add(object({{"id", device.identifier}, {"name", device.name}}));
  return object({{"types", types},
                 {"midiInputs", midiInputs},
                 {"type", devices.getCurrentAudioDeviceType()},
                 {"input", configuredInput},
                 {"audioInputActive", audioInputActive},
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
  if (configuredInput != str(c, "input")) inputChannelNames.clear();
  configuredInput = str(c, "input");
  setup.inputDeviceName = needsAudioInput() ? configuredInput : String();
  setup.outputDeviceName = str(c, "output");
  setup.sampleRate = number(c, "sampleRate", 48000);
  setup.bufferSize = (int)number(c, "bufferSize", 256);
  setup.useDefaultInputChannels = false;
  setup.inputChannels.clear();
  if (needsAudioInput()) setup.inputChannels.setRange(0, 128, true);
  deviceError = devices.setAudioDeviceSetup(setup, true);
  auto *device = devices.getCurrentAudioDevice();
  audioInputActive = device && !device->getActiveInputChannels().isZero();
  if (deviceError.isNotEmpty())
    throw std::runtime_error(deviceError.toStdString());
  return listDevices();
}
} // namespace basement
