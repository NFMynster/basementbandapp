#include "Engine.h"
#include <cmath>

namespace basement {
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
  preparePlayback(position, looping && !recording);
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
  bool anySolo = false;
  for (auto &t : tracks)
    anySolo |= t->solo;
  for (auto &t : tracks) {
    t->peak = 0;
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
        }
    }
    if (!t->isMidi && t->input < ni && t->input >= 0 && inputs[t->input]) {
      auto range = FloatVectorOperations::findMinAndMax(inputs[t->input], n);
      t->peak = jmax(std::abs(range.getStart()), std::abs(range.getEnd()));
      if (recording && t->writer) {
        const int skip = (int)jmin((int64)n, t->captureSkip);
        t->captureSkip -= skip;
        const float *p[] = {inputs[t->input] + skip};
        if (n > skip && !t->writer->write(p, n - skip))
          diskOverrun = true;
      }
    }
    if ((!playing && !(t->isMidi && t->armed)) || n > t->scratch.getNumSamples())
      continue;
    renderTrack(*t, playing ? position + t->latency / rate : -1, n, looping && !recording);
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
    position += n / rate;
    if (looping && !recording && position >= loopEnd && loopEnd > loopStart)
      position = loopStart + std::fmod(position - loopStart, loopEnd - loopStart);
  }
  for (int ch = 0; ch < no; ++ch)
    if (outputs[ch])
      for (int i = 0; i < n; ++i)
        outputs[ch][i] = jlimit(-1.0f, 1.0f, outputs[ch][i]);
}
} // namespace basement
