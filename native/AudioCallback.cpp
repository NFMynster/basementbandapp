#include "Engine.h"
#include <cmath>
#include <iostream>

namespace basement {
void appendRecordingPreviewNote(Track &track, double start, double duration, int note) {
  const auto count = track.recordingPreviewNoteCount.load(std::memory_order_relaxed);
  if (count >= (int)track.recordingPreviewNotes.size())
    return;
  track.recordingPreviewNotes[(size_t)count] = {start, duration, note};
  track.recordingPreviewNoteCount.store(count + 1, std::memory_order_release);
}

void Engine::click(float *const *outputs, int channels, int samples, double time) {
  const double beatLength = 60 / tempo;
  for (int i = 0; i < samples; ++i) {
    const double at = time + i / rate;
    const double phase = std::fmod(at, beatLength);
    if (phase >= 0.025)
      continue;
    const bool accent = (int)std::floor(at / beatLength + 1e-8) % 4 == 0;
    constexpr double twoPi = MathConstants<double>::twoPi;
    double value;
    if (metronomeSound == 1) {
      // Wood block: two inharmonic partials with a fast decay.
      const double frequency = accent ? 1250 : 950;
      value = 0.17 * (std::sin(twoPi * frequency * phase) + 0.45 * std::sin(twoPi * frequency * 2.76 * phase)) *
              std::exp(-phase * 320);
    } else if (metronomeSound == 2) {
      // Stick: a short, brightened noise burst.
      clickNoise = clickNoise * 1664525u + 1013904223u;
      const float noise = (float)(clickNoise >> 8) / 8388608.0f - 1.0f;
      value = (accent ? 0.17 : 0.11) * (noise - clickNoiseLast) * std::exp(-phase * 600);
      clickNoiseLast = noise;
    } else {
      const double frequency = accent ? 1500 : 1100;
      value = 0.2 * std::sin(twoPi * frequency * phase) * std::exp(-phase * 170);
    }
    const auto sample = (float)(value * metronomeGain);
    for (int ch = 0; ch < jmin(2, channels); ++ch)
      if (outputs[ch])
        outputs[ch][i] += sample;
  }
}
void Engine::audioDeviceAboutToStart(AudioIODevice *d) {
  const ScopedLock l(guard);
  tunerCount = tunerWrite = tunerPhase = 0;
  rate = d->getCurrentSampleRate();
  block = d->getCurrentBufferSizeSamples();
  inputLatency = jmax(0, d->getInputLatencyInSamples());
  outputLatency = jmax(0, d->getOutputLatencyInSamples());
  outputProtection.prepare(rate);
  deviceXRunBaseline = jmax(0, devices.getXRunCount());
  for (auto &t : tracks) {
    t->sound.prepare(rate, jmax(block, 8192));
    t->scratch.setSize(2, jmax(block, 8192));
    t->collector.reset(rate);
    if (t->plugin)
      t->plugin->prepareToPlay(rate, block);
    for (auto &effect : t->effects) effect.plugin->prepareToPlay(rate, block);
  }
  preparePlayback(position, looping);
}

void Engine::audioDeviceStopped() { std::cerr << "Audio device stopped" << std::endl; }

void Engine::audioDeviceError(const String &message) {
  // May arrive on a driver thread; the timer logs it on the message thread.
  const ScopedLock l(deviceErrorLock);
  pendingDeviceError = message.isNotEmpty() ? message : String("unknown error");
}

void Engine::describeDevice(const char *event) {
  if (testDevice) return;
  auto *d = devices.getCurrentAudioDevice();
  if (!d) {
    std::cerr << "Audio device " << event << ": no device open" << (deviceError.isNotEmpty() ? " - " : "")
              << deviceError << std::endl;
    return;
  }
  const auto setup = devices.getAudioDeviceSetup();
  std::cerr << "Audio device " << event << ": " << d->getTypeName() << " | output \"" << setup.outputDeviceName
            << "\" | input \"" << setup.inputDeviceName << "\" | " << d->getCurrentSampleRate() << " Hz, "
            << d->getCurrentBufferSizeSamples() << " samples | channels in "
            << d->getActiveInputChannels().countNumberOfSetBits() << " out "
            << d->getActiveOutputChannels().countNumberOfSetBits() << " | latency in "
            << d->getInputLatencyInSamples() << " out " << d->getOutputLatencyInSamples()
            << (d->isPlaying() ? "" : " | not running") << std::endl;
}

void Engine::timerCallback() {
  String error;
  { const ScopedLock l(deviceErrorLock); error.swapWith(pendingDeviceError); }
  if (error.isNotEmpty()) std::cerr << "Audio device error: " << error << std::endl;

  // Cap the log: a broken plug-in can produce invalid audio on every block.
  const auto report = [&](const String &line) {
    if (invalidReports < 20) std::cerr << line << std::endl;
    else if (invalidReports == 20) std::cerr << "Further invalid audio reports suppressed" << std::endl;
    ++invalidReports;
  };
  if (outputInvalid.exchange(false)) report("Invalid audio (NaN/inf) reached the output and was silenced");
  for (auto &t : tracks) {
    const int stage = t->invalidStage.exchange(Track::invalidNone);
    if (stage == Track::invalidNone) continue;
    const String source = stage == -1 ? "instrument plug-in \"" + t->pluginName + "\""
                          : stage == Track::invalidBuiltIn ? String("built-in sound")
                          : stage < (int)t->effects.size() ? "plug-in \"" + t->effects[(size_t)stage].name + "\""
                                                           : String("a plug-in");
    report("Track \"" + t->name + "\": " + source + " produced invalid audio (NaN/inf); silenced and reset");
  }

  // Watchdog: an open, running device must keep calling back. WASAPI can stop
  // (for example after a session goes inactive) without reporting an error.
  auto *d = devices.getCurrentAudioDevice();
  const auto count = callbackCount.load(std::memory_order_relaxed);
  if (!d || !d->isPlaying() || count != lastCallbackCount) {
    if (stalledTicks >= 2) std::cerr << "Audio callbacks resumed" << std::endl;
    if (count != lastCallbackCount) stallRecoveryTried = false;
    stalledTicks = 0;
    lastCallbackCount = count;
    return;
  }
  if (++stalledTicks != 2) return;
  describeDevice("stopped calling back for 2 s");
  if (stallRecoveryTried) return;
  stallRecoveryTried = true;
  std::cerr << "Reopening the audio device" << std::endl;
  devices.closeAudioDevice();
  devices.restartLastAudioDevice();
  if (auto *reopened = devices.getCurrentAudioDevice())
    audioInputActive = !reopened->getActiveInputChannels().isZero();
  describeDevice("reopened");
  stalledTicks = 0;
  lastCallbackCount = callbackCount.load(std::memory_order_relaxed);
}

void Engine::audioDeviceIOCallbackWithContext(const float *const *inputs, int ni,
                                              float *const *outputs, int no, int n,
                                              const AudioIODeviceCallbackContext &) {
  callbackCount.fetch_add(1, std::memory_order_relaxed);
  for (int ch = 0; ch < no; ++ch)
    if (outputs[ch])
      FloatVectorOperations::clear(outputs[ch], n);
  const ScopedTryLock l(guard);
  if (!l.isLocked()) {
    if ((playing.load() || monitoringActive.load()) && !exporting.load()) ++processingDropouts;
    if (playing.load())
      diskOverrun = true;
    return;
  }
  if (tunerTrack.isNotEmpty()) {
    const int stride = jmax(1, (int)(rate / 12000));
    const float *input = nullptr;
    for (const auto &t : tracks) if (t->id == tunerTrack && t->input >= 0 && t->input < ni) input = inputs[t->input];
    for (int i = 0; i < n; ++i) if (++tunerPhase >= stride) {
        tunerPhase = 0;
        tunerSamples[tunerWrite] = input ? input[i] : 0;
        tunerWrite = (tunerWrite + 1) % (int)tunerSamples.size();
        tunerCount = jmin(tunerCount + 1, (int)tunerSamples.size());
      }
    masterPeak = 0;
    return; // Dry input analysis only; mute monitoring without changing effects.
  }
  if (countRemaining > 0) {
    const int prefix = (int)jmin((int64)n, countRemaining);
    for (auto &t : tracks)
      if (t->isMidi) {
        if (!testDevice)
          t->collector.removeNextBlockOfMessages(t->liveMidi, n);
        // Discard only count-in events. Preserve notes after the boundary in
        // this block, shifted to the beginning of the capture sub-block.
        midi.clear();
        if (prefix < n) midi.addEvents(t->liveMidi, prefix, n - prefix, -prefix);
        t->liveMidi.swapWith(midi);
        midi.clear();
      }
    click(outputs, no, prefix, (countTotal - countRemaining) / rate);
    if (outputProtection.process(outputs, no, prefix, masterGain, limiterEnabled)) outputClipped = true;
    if (outputProtection.takeInvalid()) outputInvalid = true;
    countRemaining -= prefix;
    // Split the crossing block exactly on the native sample clock.
    if (prefix < n) {
      const float *remainingInputs[128]{};
      float *remainingOutputs[128]{};
      for (int ch = 0; ch < jmin(ni, 128); ++ch)
        remainingInputs[ch] = inputs[ch] ? inputs[ch] + prefix : nullptr;
      for (int ch = 0; ch < jmin(no, 128); ++ch)
        remainingOutputs[ch] = outputs[ch] ? outputs[ch] + prefix : nullptr;
      const ScopedValueSetter<bool> prepared(countInMidiPrepared, true);
      audioDeviceIOCallbackWithContext(remainingInputs, jmin(ni, 128), remainingOutputs,
                                       jmin(no, 128), n - prefix, {});
    }
    return;
  }
  bool anySolo = false;
  for (auto &t : tracks)
    anySolo |= t->solo;
  for (auto &t : tracks) {
    t->peak = t->peak.load() * (float)std::exp(-n / (rate * 0.12));
    if (t->isMidi) {
      if (!testDevice && !countInMidiPrepared) {
        t->liveMidi.clear();
        t->collector.removeNextBlockOfMessages(t->liveMidi, n);
      }
      if (recording && t->midiRecording)
        for (const auto event : t->liveMidi) {
          const double time =
              position + event.samplePosition / rate - t->recordStart - t->captureOffset;
          if (time < 0 || event.numBytes > 3)
            continue;
          if (t->midiTake.size() == t->midiTake.capacity()) {
            diskOverrun = true;
            ++recordingDropouts;
            continue;
          }
          Track::RecordedEvent captured{};
          captured.time = time;
          captured.size = event.numBytes;
          std::memcpy(captured.data, event.data, (size_t)event.numBytes);
          t->midiTake.push_back(captured);
          MidiMessage message(event.data, event.numBytes);
          if (message.isNoteOn() || message.isNoteOff()) {
            const auto noteIndex = (message.getChannel() - 1) * 128 + message.getNoteNumber();
            const auto previous =
                t->recordingNoteStarts[(size_t)noteIndex].load(std::memory_order_relaxed);
            if (message.isNoteOn()) {
              if (previous >= 0)
                appendRecordingPreviewNote(*t, previous, jmax(0.001, time - previous),
                                            message.getNoteNumber());
              t->recordingNoteStarts[(size_t)noteIndex].store(time, std::memory_order_relaxed);
            } else if (previous >= 0) {
              appendRecordingPreviewNote(*t, previous, jmax(0.001, time - previous),
                                          message.getNoteNumber());
              t->recordingNoteStarts[(size_t)noteIndex].store(-1.0, std::memory_order_relaxed);
            }
          }
        }
    }
    if (!t->isMidi && t->input < ni && t->input >= 0 && inputs[t->input]) {
      auto range = FloatVectorOperations::findMinAndMax(inputs[t->input], n);
      t->peak = jmax(t->peak.load(), jmax(std::abs(range.getStart()), std::abs(range.getEnd())));
      if (recording && t->writer) {
        const int skip = (int)jmin((int64)n, t->captureSkip);
        t->captureSkip -= skip;
        const float *p[] = {inputs[t->input] + skip};
        for (int at = skip; at < n;) {
          const int count = jmin(n - at, t->recordingPeakInterval - t->recordingPeakFrames);
          const auto range = FloatVectorOperations::findMinAndMax(inputs[t->input] + at, count);
          t->recordingPeakValue = jmax(t->recordingPeakValue, jmax(std::abs(range.getStart()), std::abs(range.getEnd())));
          t->recordingPeakFrames += count;
          at += count;
          if (t->recordingPeakFrames == t->recordingPeakInterval) {
            const auto index = t->recordingPeakCount.load(std::memory_order_relaxed);
            if (index < (int)t->recordingPeaks.size()) {
              t->recordingPeaks[(size_t)index] = t->recordingPeakValue;
              t->recordingPeakCount.store(index + 1, std::memory_order_release);
            }
            t->recordingPeakFrames = 0;
            t->recordingPeakValue = 0;
          }
          t->recordingPartialPeak = t->recordingPeakValue;
        }
        if (n > skip && !t->writer->write(p, n - skip)) {
          diskOverrun = true;
          ++recordingDropouts;
        }
      }
    }
    if ((!playing && !t->monitor && t->auditionSamples == 0 && t->auditionTail == 0 && t->auditionMidi.isEmpty()) || n > t->scratch.getNumSamples())
      continue;
    const float *liveInput =
        !t->isMidi && t->monitor && t->input >= 0 && t->input < ni ? inputs[t->input] : nullptr;
    // An armed track auditions its live input, not the take being replaced.
    renderTrack(*t, playing && !(recording && t->armed) ? position + t->latency / rate : -1, n, looping, liveInput);
    t->liveMidi.clear();
    if (t->mute || (anySolo && !t->solo))
      continue;
    t->peak = jmax(t->peak.load(), t->scratch.getMagnitude(0, n) * t->gain);
    const float left = t->gain * (t->pan > 0 ? 1 - t->pan : 1),
                right = t->gain * (t->pan < 0 ? 1 + t->pan : 1);
    for (int ch = 0; ch < jmin(no, 2); ++ch)
      if (outputs[ch])
        FloatVectorOperations::addWithMultiply(outputs[ch], t->scratch.getReadPointer(ch),
                                               ch == 0 ? left : right, n);
  }
  if (playing) {
    if (metronome)
      click(outputs, no, n, position);
    position += n / rate;
    if (looping && !recording && position >= loopEnd && loopEnd > loopStart)
      position = loopStart + std::fmod(position - loopStart, loopEnd - loopStart);
    if (!looping && !recording) {
      double end = 32 * 240.0 / tempo;
      for (const auto &t : tracks) for (const auto &clip : t->clips)
        end = jmax(end, clip->start + clip->duration() + 8);
      end = std::ceil(end / (240.0 / tempo)) * (240.0 / tempo);
      if (position >= end) { position = end; playing = false; for (auto &t : tracks) t->panic = true; }
    }
  }
  if (outputProtection.process(outputs, no, n, masterGain, limiterEnabled)) outputClipped = true;
  if (outputProtection.takeInvalid()) outputInvalid = true;
  float outputPeak = masterPeak.load() * (float)std::exp(-n / (rate * 0.12));
  for (int ch = 0; ch < no; ++ch)
    if (outputs[ch])
      for (int i = 0; i < n; ++i) {
        outputPeak = jmax(outputPeak, std::abs(outputs[ch][i]));
      }
  masterPeak = outputPeak;
}
} // namespace basement
