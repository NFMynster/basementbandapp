#include "Engine.h"
#include <cmath>
#include <iostream>

namespace basement {
/** The waveform or notes recorded so far in the current pass. With `stream`,
 *  an audio preview holds only the peaks that stream has not sent yet, and
 *  `from` says where they start; the last peak is the unfinished one. */
var recordingPreview(const Track &track, double now, double rate, double loopSpan,
                     PreviewStream *stream = nullptr) {
  if (!track.writer && !track.midiRecording)
    return {};
  const auto elapsed = jmax(0.0, now - track.recordStart - track.captureOffset);
  const double offset = loopSpan > 0 ? std::floor(elapsed / loopSpan) * loopSpan : 0;
  const auto duration = jmax(0.001, elapsed - offset);
  auto preview = object({{"kind", track.midiRecording ? "midi" : "audio"},
                         {"start", track.recordStart},
                         {"duration", duration}});
  if (track.writer) {
    Array<var> peaks;
    const auto count = track.recordingPeakCount.load(std::memory_order_acquire);
    const int first = (int)std::ceil(offset * rate / track.recordingPeakInterval);
    int from = 0;
    if (stream != nullptr) {
      // A new take or loop pass starts the waveform over.
      if (stream->start != track.recordStart || stream->first != first || stream->sent > count - first)
        *stream = {track.recordStart, first, 0};
      from = stream->sent;
      stream->sent = jmax(0, count - first);
      preview.getDynamicObject()->setProperty("from", from);
    }
    for (int i = first + from; i < count; ++i) peaks.add(track.recordingPeaks[(size_t)i]);
    peaks.add(track.recordingPartialPeak.load());
    preview.getDynamicObject()->setProperty("peakInterval", track.recordingPeakInterval / rate);
    preview.getDynamicObject()->setProperty("peaks", peaks);
  } else {
    Array<var> notes;
    const auto count = track.recordingPreviewNoteCount.load(std::memory_order_acquire);
    for (int i = 0; i < jmin((int)track.recordingPreviewNotes.size(), count); ++i) {
      const auto &note = track.recordingPreviewNotes[(size_t)i];
      if (note.start + note.duration > offset)
        notes.add(object({{"start", jmax(0.0, note.start - offset)}, {"duration", jmin(note.duration, note.start + note.duration - offset)}, {"note", note.note}}));
    }
    for (int channel = 0; channel < 16; ++channel)
      for (int note = 0; note < 128; ++note) {
        const auto start =
            track.recordingNoteStarts[(size_t)(channel * 128 + note)].load(std::memory_order_acquire);
        if (start >= 0 && start < elapsed)
          notes.add(object({{"start", jmax(0.0, start - offset)},
                            {"duration", elapsed - jmax(start, offset)},
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

// Opens the device chosen in Settings exactly as remembered, in one step, with
// its input when the recovered session listens (or the driver shares one
// instance for input and output). A device that is gone is never swapped for a
// default: another microphone could feed back, so the user picks again.
String Engine::openRememberedDevice(bool inputAllowed, const var &remembered, bool listening) {
  const auto typeName = str(remembered, "type");
  const auto output = str(remembered, "output");
  const auto input = inputAllowed ? str(remembered, "input") : String();
  AudioIODeviceType *type = nullptr;
  for (auto *candidate : devices.getAvailableDeviceTypes()) // scans every type once
    if (candidate->getTypeName() == typeName) type = candidate;
  if (type == nullptr)
    return "The " + typeName + " audio driver is not available. Choose a device in Input settings.";
  if (!type->getDeviceNames(false).contains(output))
    return "Your audio output \"" + output + "\" is not connected. Choose a device in Input settings.";
  configuredInput = input.isNotEmpty() && type->getDeviceNames(true).contains(input) ? input : String();
  const bool openInput = configuredInput.isNotEmpty() && (listening || !type->hasSeparateInputsAndOutputs());
  // The XML form selects the driver type without opening its default device
  // first (setCurrentAudioDeviceType would), and with selectDefaultDeviceOnFailure
  // off a failure leaves the device closed instead of substituting another.
  XmlElement setup("DEVICESETUP");
  setup.setAttribute("deviceType", typeName);
  setup.setAttribute("audioOutputDeviceName", output);
  setup.setAttribute("audioInputDeviceName", openInput ? configuredInput : String());
  setup.setAttribute("audioDeviceRate", number(remembered, "sampleRate", 48000));
  setup.setAttribute("audioDeviceBufferSize", (int)number(remembered, "bufferSize", 64));
  setup.setAttribute("audioDeviceInChans", openInput ? String::repeatedString("1", 128) : String("0"));
  const auto error = devices.initialise(0, 2, &setup, false);
  if (error.isNotEmpty()) {
    configuredInput.clear(); // arming must not open an input without the chosen device
    return error;
  }
  if (input.isNotEmpty() && configuredInput.isEmpty())
    return "Your audio input \"" + input + "\" is not connected. Choose an input in Input settings.";
  return {};
}

void Engine::initializeAudio(bool inputAllowed, const var &remembered, bool listening) {
  if (testDevice)
    return;
  if (remembered.isObject()) {
    std::cerr << "Opening remembered audio device (input " << (listening ? "for the recovered session" : "on demand")
              << ")" << std::endl;
    deviceError = openRememberedDevice(inputAllowed, remembered, listening);
  } else {
    // First launch: open the output only. The default input is remembered by
    // name and opened by syncAudioInput once a track is armed or monitored or
    // the tuner runs, so launching never turns on the OS microphone indicator.
    std::cerr << "Opening audio device (output only, input " << (inputAllowed ? "on demand" : "not allowed") << ")"
              << std::endl;
    AudioDeviceManager::AudioDeviceSetup preferred;
    preferred.bufferSize = 64;
    preferred.sampleRate = 48000;
    // Pin the OS default output explicitly. Otherwise JUCE may substitute
    // another device while searching for a supported sample rate.
#if JUCE_WINDOWS
    for (auto *type : devices.getAvailableDeviceTypes())
      if (type->getTypeName() == "Windows Audio") {
        type->scanForDevices();
        preferred.outputDeviceName = type->getDeviceNames(false)[type->getDefaultDeviceIndex(false)];
        devices.setCurrentAudioDeviceType(type->getTypeName(), false);
        break;
      }
#endif
    deviceError = devices.initialise(0, 2, nullptr, true, {}, &preferred);
    if (auto *type = devices.getCurrentDeviceTypeObject(); type && inputAllowed) {
      const auto inputs = type->getDeviceNames(true);
      configuredInput = inputs[jmax(0, type->getDefaultDeviceIndex(true))];
    }
  }
  auto *opened = devices.getCurrentAudioDevice();
  audioInputActive = opened != nullptr && !opened->getActiveInputChannels().isZero();
  if (audioInputActive) inputChannelNames = opened->getInputChannelNames();
  devices.addAudioCallback(this);
  devices.addMidiInputDeviceCallback({}, this);
  for (auto *type : devices.getAvailableDeviceTypes())
    type->addListener(this);
  midiDeviceList = MidiDeviceListConnection::make([this] { ++deviceListVersion; });
  std::cerr << "Audio device initialization finished: " << deviceError << std::endl;
  describeDevice("opened");
  startTimer(1000);
}

Engine::~Engine() {
  stopTimer();
  // The test device never opens a driver; listing types would create them.
  if (!testDevice)
    for (auto *type : devices.getAvailableDeviceTypes())
      type->removeListener(this);
  devices.removeMidiInputDeviceCallback({}, this);
  devices.removeAudioCallback(this);
  editor.reset();
  for (auto &t : tracks)
    t->writer.reset();
  disk.stopThread(5000);
}

var Engine::state(bool full, bool pluginState, bool previews) {
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
  double tunerFrequency = 0;
  if (tunerTrack.isNotEmpty()) {
    std::array<float, 2048> samples{};
    int count;
    { const ScopedLock lock(guard); for (int i = 0; i < (int)samples.size(); ++i) samples[i] = tunerSamples[(tunerWrite + i) % tunerSamples.size()]; count = tunerCount; }
    // Analyse a chronological snapshot off the audio thread.
    if (count == (int)samples.size()) {
      const double sampleRate = snapshotRate / jmax(1, (int)(snapshotRate / 12000));
      const int minLag = (int)(sampleRate / 1000), maxLag = (int)(sampleRate / 25);
      std::array<double, 512> correlations{};
      double best = 0;
      int bestLag = 0;
      for (int lag = minLag; lag <= maxLag && lag < 511; ++lag) {
        double cross = 0, energyA = 0, energyB = 0;
        for (int i = 0; i < 1024; ++i) {
          const double a = samples[i], b = samples[i + lag];
          cross += a * b; energyA += a * a; energyB += b * b;
        }
        correlations[lag] = energyA > 0.0001 && energyB > 0.0001 ? cross / std::sqrt(energyA * energyB) : 0;
        best = jmax(best, correlations[lag]);
      }
      for (int lag = minLag + 1; lag < maxLag && lag < 510; ++lag)
        if (correlations[lag] > 0.85 && correlations[lag] >= best * 0.98 &&
            correlations[lag] > correlations[lag - 1] && correlations[lag] >= correlations[lag + 1]) { bestLag = lag; break; }
      if (bestLag) {
        const double a = correlations[bestLag - 1], b = correlations[bestLag], c = correlations[bestLag + 1];
        const double offset = (a - c) / (2 * (a - 2 * b + c));
        tunerFrequency = sampleRate / (bestLag + offset);
      }
    }
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
                     {"eqBassFrequency", t->eqBassFrequency}, {"eqMidFrequency", t->eqMidFrequency}, {"eqTrebleFrequency", t->eqTrebleFrequency}, {"eqMidQ", t->eqMidQ}, {"eqLowCut", t->eqLowCut}, {"eqMid", t->eqMid}, {"eqTreble", t->eqTreble},
                     {"peak", t->peak.load()},
                     {"clips", clips},
                     {"pluginName", t->pluginName}, {"pluginUid", t->pluginUid},
                     {"bypass", t->bypass}});
    t->sound.write(v);
    const auto preview = previews ? recordingPreview(*t, position.load(), snapshotRate,
        recording && cycleRecording ? recordingLoopEnd - recordingLoopStart : 0) : var();
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
  auto result = object(
      {{"title", title}, {"tunerTrack", tunerTrack}, {"tunerFrequency", tunerFrequency},
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
       {"metronomeGain", metronomeGain},
       {"metronomeSound", metronomeSounds[metronomeSound]},
       {"countIn", countIn},
       {"countdown", countdown},
       {"sampleRate", snapshotRate},
       {"bufferSize", snapshotBlock},
       {"inputLatencySamples", snapshotInputLatency},
       {"outputLatencySamples", snapshotOutputLatency},
       {"device", d ? d->getName() : "No audio device"},
       {"deviceError", deviceError},
       {"deviceListVersion", deviceListVersion.load()},
       {"diskOverrun", diskOverrun.load()}});
  // Snapshots are documents (projects, recovery, history); only UI-bound
  // states are ordered.
  if (!full)
    result.getDynamicObject()->setProperty("revision", ++stateRevision);
  return result;
}

void Engine::refreshPluginLatency() {
  for (auto &t : tracks)
    if (t->latency != t->pluginLatency()) {
      const ScopedLock lock(guard);
      prepareTrack(*t, position, looping);
    }
}

var Engine::frame() {
  // Plug-ins may change their latency at any time; compensate before reporting.
  refreshPluginLatency();
  auto session = state(false, true, false);
  auto *top = session.getDynamicObject();
  auto live = object({});
  auto *values = live.getDynamicObject();
  for (const char *key : {"position", "masterPeak", "audioCpu", "tunerFrequency"}) {
    values->setProperty(key, top->getProperty(key));
    top->removeProperty(key);
  }
  const auto revision = top->getProperty("revision");
  top->removeProperty("revision");

  const double loopSpan = recording && cycleRecording ? recordingLoopEnd - recordingLoopStart : 0;
  auto liveTracks = object({});
  auto *trackList = top->getProperty("tracks").getArray();
  for (size_t i = 0; i < tracks.size(); ++i) {
    auto &t = *tracks[i];
    auto *json = trackList->getReference((int)i).getDynamicObject();
    auto entry = object({{"peak", json->getProperty("peak")}});
    json->removeProperty("peak");
    const auto preview = recordingPreview(t, position.load(), (double)top->getProperty("sampleRate"), loopSpan,
                                          &previewStreams[t.id]);
    if (preview.isVoid())
      previewStreams.erase(t.id);
    else
      entry.getDynamicObject()->setProperty("recordingPreview", preview);
    liveTracks.getDynamicObject()->setProperty(t.id, entry);
  }
  values->setProperty("tracks", liveTracks);

  auto result = object({{"event", "state"}, {"revision", revision}, {"live", live}});
  if (!sameJson(session, streamedSession)) {
    streamedSession = session;
    result.getDynamicObject()->setProperty("session", session);
  }
  return result;
}
} // namespace basement
