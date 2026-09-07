#include "Engine.h"
#include <cmath>

namespace basement {
void Engine::audioDeviceAboutToStart(AudioIODevice *d) {
  const ScopedLock l(guard);
  rate = d->getCurrentSampleRate();
  block = d->getCurrentBufferSizeSamples();
  for (auto &t : tracks) {
    t->scratch.setSize(2, jmax(block, 8192));
    if (t->plugin)
      t->plugin->prepareToPlay(rate, block);
  }
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
    if (t->input < ni && t->input >= 0 && inputs[t->input]) {
      auto range = FloatVectorOperations::findMinAndMax(inputs[t->input], n);
      t->peak = jmax(std::abs(range.getStart()), std::abs(range.getEnd()));
      if (recording && t->writer) {
        const float *p[] = {inputs[t->input]};
        if (!t->writer->write(p, n))
          diskOverrun = true;
      }
    }
    if (!playing || t->mute || (anySolo && !t->solo) || n > t->scratch.getNumSamples())
      continue;
    t->scratch.clear();
    for (int i = 0; i < n; ++i) {
      double time = position + i / rate;
      if (looping && !recording && loopEnd > loopStart && time >= loopEnd)
        time = loopStart + std::fmod(time - loopStart, loopEnd - loopStart);
      for (auto &c : t->clips) {
        double sample = (time - c->start) * c->sampleRate;
        if (sample < 0 || sample >= c->audio.getNumSamples())
          continue;
        int a = (int)sample, b = jmin(a + 1, c->audio.getNumSamples() - 1);
        float f = (float)(sample - a);
        for (int ch = 0; ch < 2; ++ch) {
          int source = jmin(ch, c->audio.getNumChannels() - 1);
          float v = c->audio.getSample(source, a) * (1 - f) + c->audio.getSample(source, b) * f;
          t->scratch.addSample(ch, i, v);
        }
      }
    }
    if (t->plugin && !t->bypass) {
      midi.clear();
      AudioBuffer<float> view(t->scratch.getArrayOfWritePointers(), 2, n);
      t->plugin->processBlock(view, midi);
    }
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
