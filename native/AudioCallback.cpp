#include "Engine.h"
#include <cmath>

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
    if (phase < 0.025) {
      const double frequency = ((int)std::floor(at / beatLength + 1e-8) % 4 == 0) ? 1500 : 1100;
      const float value = (float)(0.2 * std::sin(MathConstants<double>::twoPi * frequency * phase) *
                                  std::exp(-phase * 170));
      for (int ch = 0; ch < jmin(2, channels); ++ch)
        if (outputs[ch])
          outputs[ch][i] += value;
    }
  }
}
void Engine::audioDeviceAboutToStart(AudioIODevice *d) {
  const ScopedLock l(guard);
  rate = d->getCurrentSampleRate();
  block = d->getCurrentBufferSizeSamples();
  inputLatency = jmax(0, d->getInputLatencyInSamples());
  outputLatency = jmax(0, d->getOutputLatencyInSamples());
  for (auto &t : tracks) {
    t->scratch.setSize(2, jmax(block, 8192));
    t->collector.reset(rate);
    if (t->plugin)
      t->plugin->prepareToPlay(rate, block);
  }
  preparePlayback(position, looping);
}

void Engine::audioDeviceStopped() {}

void Engine::audioDeviceIOCallbackWithContext(const float *const *inputs, int ni,
                                              float *const *outputs, int no, int n,
                                              const AudioIODeviceCallbackContext &) {
  for (int ch = 0; ch < no; ++ch)
    if (outputs[ch])
      FloatVectorOperations::clear(outputs[ch], n);
  const ScopedTryLock l(guard);
  if (!l.isLocked()) {
    if (playing.load())
      diskOverrun = true;
    return;
  }
  if (countRemaining > 0) {
    for (auto &t : tracks)
      if (t->isMidi) {
        if (!testDevice)
          t->collector.removeNextBlockOfMessages(t->liveMidi, n);
        t->liveMidi.clear();
      }
    const int prefix = (int)jmin((int64)n, countRemaining);
    click(outputs, no, prefix, (countTotal - countRemaining) / rate);
    for (int ch = 0; ch < no; ++ch)
      if (outputs[ch])
        FloatVectorOperations::multiply(outputs[ch], masterGain, prefix);
    countRemaining -= prefix;
    // Split the crossing block exactly on the native sample clock.
    if (prefix < n) {
      const float *remainingInputs[128]{};
      float *remainingOutputs[128]{};
      for (int ch = 0; ch < jmin(ni, 128); ++ch)
        remainingInputs[ch] = inputs[ch] ? inputs[ch] + prefix : nullptr;
      for (int ch = 0; ch < jmin(no, 128); ++ch)
        remainingOutputs[ch] = outputs[ch] ? outputs[ch] + prefix : nullptr;
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
      if (!testDevice) {
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
        if (n > skip) {
          const auto count = t->recordingPeakCount.load(std::memory_order_relaxed);
          if (count < (int)t->recordingPeaks.size()) {
            const auto captured =
                FloatVectorOperations::findMinAndMax(inputs[t->input] + skip, n - skip);
            t->recordingPeaks[(size_t)count] =
                jmax(std::abs(captured.getStart()), std::abs(captured.getEnd()));
            t->recordingPeakCount.store(count + 1, std::memory_order_release);
          }
        }
        if (n > skip && !t->writer->write(p, n - skip))
          diskOverrun = true;
      }
    }
    if ((!playing && !t->monitor) || n > t->scratch.getNumSamples())
      continue;
    const float *liveInput =
        !t->isMidi && t->monitor && t->input >= 0 && t->input < ni ? inputs[t->input] : nullptr;
    renderTrack(*t, playing ? position + t->latency / rate : -1, n, looping, liveInput);
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
  }
  float outputPeak = masterPeak.load() * (float)std::exp(-n / (rate * 0.12));
  for (int ch = 0; ch < no; ++ch)
    if (outputs[ch])
      for (int i = 0; i < n; ++i) {
        outputs[ch][i] = jlimit(-1.0f, 1.0f, outputs[ch][i] * masterGain);
        outputPeak = jmax(outputPeak, std::abs(outputs[ch][i]));
      }
  masterPeak = outputPeak;
}
} // namespace basement
