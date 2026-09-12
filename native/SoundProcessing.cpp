#include "SoundProcessing.h"
#include <cmath>

namespace basement {
void TrackSound::update(const var &v) {
  // Validate the entire patch before changing any settings.
  for (auto key : {"compressorEnabled", "reverbEnabled", "gateEnabled"})
    if (v.hasProperty(key)) require(v[key].isBool(), "Invalid effect switch");
  for (auto key : {"compressorAmount", "reverbAmount", "gateThreshold"})
    if (v.hasProperty(key)) {
      const auto value = number(v, key);
      const bool threshold = String(key) == "gateThreshold";
      require((v[key].isDouble() || v[key].isInt() || v[key].isInt64()) && std::isfinite(value) &&
                  value >= (threshold ? -80 : 0) && value <= (threshold ? -10 : 1),
              "Invalid effect amount");
    }
  const auto validateParameter = [&](const char* key, double low, double high) {
    if (!v.hasProperty(key)) return;
    const auto value = number(v, key);
    require((v[key].isDouble() || v[key].isInt() || v[key].isInt64()) &&
                std::isfinite(value) && value >= low && value <= high, "Invalid effect parameter");
  };
  validateParameter("compressorAttack", 1, 100);
  validateParameter("compressorRelease", 20, 1000);
  for (auto key : {"reverbSize", "reverbDamping", "reverbWidth"}) validateParameter(key, 0, 1);
  if (v.hasProperty("compressorEnabled") && compressorEnabled != flag(v, "compressorEnabled")) compressor.reset();
  if (v.hasProperty("reverbEnabled") && reverbEnabled != flag(v, "reverbEnabled")) reverb.reset();
  if (v.hasProperty("gateEnabled") && gateEnabled != flag(v, "gateEnabled")) gate.reset();
  if (v.hasProperty("compressorEnabled")) compressorEnabled = flag(v, "compressorEnabled");
  if (v.hasProperty("reverbEnabled")) reverbEnabled = flag(v, "reverbEnabled");
  if (v.hasProperty("gateEnabled")) gateEnabled = flag(v, "gateEnabled");
  if (v.hasProperty("compressorAmount")) compressorAmount = (float)number(v, "compressorAmount");
  if (v.hasProperty("reverbAmount")) reverbAmount = (float)number(v, "reverbAmount");
  if (v.hasProperty("gateThreshold")) gateThreshold = (float)number(v, "gateThreshold");
  if (v.hasProperty("compressorAttack")) compressorAttack = (float)number(v, "compressorAttack");
  if (v.hasProperty("compressorRelease")) compressorRelease = (float)number(v, "compressorRelease");
  if (v.hasProperty("reverbSize")) reverbSize = (float)number(v, "reverbSize");
  if (v.hasProperty("reverbDamping")) reverbDamping = (float)number(v, "reverbDamping");
  if (v.hasProperty("reverbWidth")) reverbWidth = (float)number(v, "reverbWidth");
  compressor.setAttack(compressorAttack);
  compressor.setRelease(compressorRelease);
  Reverb::Parameters p;
  p.roomSize = reverbSize; p.damping = reverbDamping; p.width = reverbWidth;
  p.wetLevel = 1; p.dryLevel = 0;
  reverb.setParameters(p);
  compressor.setThreshold(-6 - 24 * compressorAmount);
  compressor.setRatio(1 + 4 * compressorAmount);
  gate.setThreshold(gateThreshold);
  reverbMix.setTargetValue(reverbAmount);
}

void TrackSound::write(var &v) const {
  auto *o = v.getDynamicObject();
  o->setProperty("compressorEnabled", compressorEnabled);
  o->setProperty("compressorAmount", compressorAmount);
  o->setProperty("reverbEnabled", reverbEnabled);
  o->setProperty("reverbAmount", reverbAmount);
  o->setProperty("gateEnabled", gateEnabled);
  o->setProperty("gateThreshold", gateThreshold);
  o->setProperty("compressorAttack", compressorAttack);
  o->setProperty("compressorRelease", compressorRelease);
  o->setProperty("reverbSize", reverbSize);
  o->setProperty("reverbDamping", reverbDamping);
  o->setProperty("reverbWidth", reverbWidth);
}

void TrackSound::prepare(double rate, int block) {
  const dsp::ProcessSpec spec{rate, (uint32)block, 2};
  compressor.prepare(spec);
  compressor.setAttack(compressorAttack);
  compressor.setRelease(compressorRelease);
  gate.prepare(spec);
  gate.setRatio(4);
  gate.setAttack(1);
  gate.setRelease(120);
  wet.setSize(2, block);
  Reverb::Parameters p;
  p.roomSize = reverbSize;
  p.damping = reverbDamping;
  p.width = reverbWidth;
  p.wetLevel = 1;
  p.dryLevel = 0;
  reverb.setParameters(p);
  // Set the rate after parameters to settle JUCE's internal gain smoothers.
  // Otherwise the first wet render briefly includes its default dry signal.
  reverb.setSampleRate(rate);
  reverbMix.reset(rate, 0.02);
  reverbMix.setCurrentAndTargetValue(reverbAmount);
  update(object({}));
  reset();
}

void TrackSound::reset() {
  reverbMix.setCurrentAndTargetValue(reverbAmount);
  compressor.reset();
  gate.reset();
  reverb.reset();
}

void TrackSound::processGate(AudioBuffer<float> &buffer, int samples) {
  if (!gateEnabled) return;
  auto block = dsp::AudioBlock<float>(buffer).getSubBlock(0, (size_t)samples);
  gate.process(dsp::ProcessContextReplacing<float>(block));
}

void TrackSound::processSound(AudioBuffer<float> &buffer, int samples) {
  auto block = dsp::AudioBlock<float>(buffer).getSubBlock(0, (size_t)samples);
  if (compressorEnabled) compressor.process(dsp::ProcessContextReplacing<float>(block));
  if (reverbEnabled) {
    // Keep the dry path at unity; the amount controls the added room sound.
    auto *left = buffer.getWritePointer(0), *right = buffer.getWritePointer(1);
    wet.copyFrom(0, 0, left, samples);
    wet.copyFrom(1, 0, right, samples);
    reverb.processStereo(wet.getWritePointer(0), wet.getWritePointer(1), samples);
    for (int i = 0; i < samples; ++i) {
      const auto amount = reverbMix.getNextValue() * 0.4f;
      left[i] += wet.getSample(0, i) * amount;
      right[i] += wet.getSample(1, i) * amount;
    }
  }
}

void OutputProtection::prepare(double rate) {
  release = (float)std::exp(-1.0 / (rate * 0.08));
  reset();
}

bool OutputProtection::process(float *const *channels, int count, int samples, float level, bool enabled) {
  bool overloaded = false;
  for (int i = 0; i < samples; ++i) {
    float peak = 0;
    for (int ch = 0; ch < count; ++ch)
      if (channels[ch]) peak = jmax(peak, std::abs(channels[ch][i] * level));
    overloaded |= peak > 1;
    const float target = peak > 0.98f ? 0.98f / peak : 1;
    gain = enabled ? jmin(target, 1 - (1 - gain) * release) : 1;
    for (int ch = 0; ch < count; ++ch)
      if (channels[ch]) channels[ch][i] = jlimit(-1.0f, 1.0f, channels[ch][i] * level * gain);
  }
  return overloaded;
}
} // namespace basement
