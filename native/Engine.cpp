#include "Engine.h"
#include <cmath>
#include <iostream>

namespace basement {
var recordingPreview(const Track &track, double now) {
  if (!track.writer && !track.midiRecording)
    return {};
  const auto duration = jmax(0.001, now - track.recordStart - track.captureOffset);
  auto preview = object({{"kind", track.midiRecording ? "midi" : "audio"},
                         {"start", track.recordStart},
                         {"duration", duration}});
  if (track.writer) {
    Array<var> peaks;
    const auto count = track.recordingPeakCount.load(std::memory_order_acquire);
    const auto points = jmin(400, count);
    for (int i = 0; i < points; ++i) {
      const auto first = i * count / points;
      const auto last = jmax(first + 1, (i + 1) * count / points);
      float peak = 0;
      for (int j = first; j < last; ++j)
        peak = jmax(peak, track.recordingPeaks[(size_t)j]);
      peaks.add(peak);
    }
    preview.getDynamicObject()->setProperty("peaks", peaks);
  } else {
    Array<var> notes;
    const auto count = track.recordingPreviewNoteCount.load(std::memory_order_acquire);
    for (int i = 0; i < jmin((int)track.recordingPreviewNotes.size(), count); ++i) {
      const auto &note = track.recordingPreviewNotes[(size_t)i];
      notes.add(object({{"start", note.start}, {"duration", note.duration}, {"note", note.note}}));
    }
    for (int channel = 0; channel < 16; ++channel)
      for (int note = 0; note < 128; ++note) {
        const auto start =
            track.recordingNoteStarts[(size_t)(channel * 128 + note)].load(std::memory_order_acquire);
        if (start >= 0 && start < duration)
          notes.add(object({{"start", start},
                            {"duration", duration - start},
                            {"note", note}}));
      }
    preview.getDynamicObject()->setProperty("notes", notes);
  }
  return preview;
}

Track &Engine::track(const var &c) {
  for (auto &t : tracks)
    if (t->id == str(c, "track"))
      return *t;
  throw std::runtime_error("Track no longer exists");
}

void Engine::add(String name, String color, int input) {
  auto t = std::make_unique<Track>();
  t->name = name;
  if (name == "Bass")
    t->icon = "bass";
  t->color = color;
  t->input = input;
  t->collector.reset(rate);
  t->liveMidi.ensureSize(65536);
  t->scratch.setSize(2, jmax(block, 8192));
  t->sound.prepare(rate, jmax(block, 8192));
  tracks.push_back(std::move(t));
}

Engine::Engine(bool testing) : testDevice(testing) {
  if (testDevice) configuredInput = "Test input";
  formats.registerBasicFormats();
  addDefaultFormatsToManager(plugins);
  disk.startThread();
  midi.ensureSize(65536);
  outputProtection.prepare(rate);
}

void Engine::initializeAudio(bool inputAllowed) {
  if (testDevice)
    return;
  std::cerr << "Opening audio device (inputs " << (inputAllowed ? 2 : 0) << ")" << std::endl;
  AudioDeviceManager::AudioDeviceSetup preferred;
  preferred.bufferSize = 256;
  preferred.sampleRate = 48000;
  // Pin the OS defaults explicitly. Otherwise JUCE may substitute another
  // input/output pair while searching for a shared sample rate.
#if JUCE_WINDOWS
  for (auto *type : devices.getAvailableDeviceTypes())
    if (type->getTypeName() == "Windows Audio") {
      type->scanForDevices();
      preferred.outputDeviceName = type->getDeviceNames(false)[type->getDefaultDeviceIndex(false)];
      if (inputAllowed)
        preferred.inputDeviceName = type->getDeviceNames(true)[type->getDefaultDeviceIndex(true)];
      devices.setCurrentAudioDeviceType(type->getTypeName(), false);
      break;
    }
#endif
  deviceError = devices.initialise(inputAllowed ? 2 : 0, 2, nullptr, true, {}, &preferred);
  configuredInput = devices.getAudioDeviceSetup().inputDeviceName;
  if (auto *device = devices.getCurrentAudioDevice()) {
    inputChannelNames = device->getInputChannelNames();
    audioInputActive = !device->getActiveInputChannels().isZero();
  }
  devices.addAudioCallback(this);
  devices.addMidiInputDeviceCallback({}, this);
  std::cerr << "Audio device initialization finished: " << deviceError << std::endl;
}

Engine::~Engine() {
  devices.removeMidiInputDeviceCallback({}, this);
  devices.removeAudioCallback(this);
  editor.reset();
  for (auto &t : tracks)
    t->writer.reset();
  disk.stopThread(5000);
}

var Engine::state(bool full, bool pluginState) {
  // Session metadata and region JSON belong to the message thread. Do not
  // block the audio callback while allocating/serializing the UI snapshot.
  double snapshotRate;
  int snapshotBlock, snapshotInputLatency, snapshotOutputLatency, countdown;
  {
    const ScopedLock lock(guard);
    snapshotRate = rate;
    snapshotBlock = block;
    snapshotInputLatency = inputLatency;
    snapshotOutputLatency = outputLatency;
    countdown = countRemaining > 0 ? (int)std::ceil(countRemaining / (rate * 60 / tempo)) : 0;
  }
  Array<var> list;
  for (auto &t : tracks) {
    Array<var> clips;
    for (auto &c : t->clips)
      clips.add(c->json(full));
    auto v = object({{"id", t->id},
                     {"name", t->name},
                     {"color", t->color},
                     {"icon", t->icon},
                     {"input", t->input},
                     {"kind", t->isMidi ? "midi" : "audio"},
                     {"midiDevice", t->midiDevice},
                     {"midiChannel", t->midiChannel},
                     {"latencySamples", t->latency},
                     {"armed", t->armed},
                     {"monitor", t->monitor},
                     {"recordStart", t->recordStart},
                     {"mute", t->mute},
                     {"solo", t->solo},
                     {"gain", t->gain},
                     {"pan", t->pan},
                     {"eqEnabled", t->eqEnabled}, {"eqBass", t->eqBass},
                     {"eqMid", t->eqMid}, {"eqTreble", t->eqTreble},
                     {"peak", t->peak.load()},
                     {"clips", clips},
                     {"pluginName", t->pluginName}, {"pluginUid", t->pluginUid},
                     {"bypass", t->bypass}});
    t->sound.write(v);
    const auto preview = recordingPreview(*t, position.load());
    Array<var> effects;
    for (auto &effect : t->effects) {
      auto slot = object({{"id", effect.id}, {"name", effect.name}, {"uid", effect.uid}, {"bypass", effect.bypass}});
      if (full) {
        slot.getDynamicObject()->setProperty("path", effect.path);
        if (pluginState) {
          const ScopedLock lock(guard);
          MemoryBlock b;
          effect.plugin->getStateInformation(b);
          slot.getDynamicObject()->setProperty("state", b.toBase64Encoding());
        }
      }
      effects.add(slot);
    }
    v.getDynamicObject()->setProperty("effects", effects);
    if (!preview.isVoid())
      v.getDynamicObject()->setProperty("recordingPreview", preview);
    if (full) {
      v.getDynamicObject()->setProperty("pluginPath", t->pluginPath);
      if (t->plugin && pluginState) {
        const ScopedLock lock(guard);
        MemoryBlock b;
        t->plugin->getStateInformation(b);
        v.getDynamicObject()->setProperty("pluginState", b.toBase64Encoding());
      }
    }
    list.add(v);
  }
  auto *d = devices.getCurrentAudioDevice();
  return object(
      {{"title", title},
       {"tracks", list},
       {"position",
        recording && cycleRecording
            ? recordingLoopStart + std::fmod(jmax(0.0, position.load() - recordingLoopStart),
                                             recordingLoopEnd - recordingLoopStart)
            : position.load()},
       {"playing", playing.load()},
       {"recording", recording.load()},
       {"looping", looping},
       {"loopStart", loopStart},
       {"loopEnd", loopEnd},
       {"tempo", tempo},
       {"masterGain", masterGain},
       {"limiterEnabled", limiterEnabled},
       {"outputClipped", outputClipped.load()},
       {"processingDropouts", processingDropouts.load()},
       {"recordingDropouts", recordingDropouts.load()},
       {"deviceDropouts", devices.getXRunCount() < 0 ? -1 : jmax(0, devices.getXRunCount() - deviceXRunBaseline.load())},
       {"audioInputActive", audioInputActive},
       {"masterPeak", masterPeak.load()},
       {"audioCpu", devices.getCpuUsage() * 100.0},
       {"metronome", metronome},
       {"countIn", countIn},
       {"countdown", countdown},
       {"sampleRate", snapshotRate},
       {"bufferSize", snapshotBlock},
       {"inputLatencySamples", snapshotInputLatency},
       {"outputLatencySamples", snapshotOutputLatency},
       {"device", d ? d->getName() : "No audio device"},
       {"deviceError", deviceError},
       {"diskOverrun", diskOverrun.load()}});
}
} // namespace basement
