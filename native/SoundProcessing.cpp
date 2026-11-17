#include "SoundProcessing.h"
#include <cmath>

namespace basement {
namespace {
// Gain is the clipper's input gain in dB. Up to the ceiling, makeup keeps the
// small-signal level at unity; above it, more gain adds dirt, not volume.
struct AmpVoice {
  float lowCut, hump, humpGain, gain, bias, ceiling, cabinet, resonance, mud, presence;
};
constexpr AmpVoice ampVoices[] = {
    {40, 1000, 0, 6, 0.05f, 4, 6500, 2, 0, 1.5f},   // clean
    {90, 1000, 3, 18, 0.2f, 4, 5500, 3, -2, 3},     // crunch
    {150, 800, 6, 32, 0.1f, 4, 5000, 3, -3, 3},     // lead
    {250, 1000, 0, 15, 0.15f, 3.5f, 4000, 0, 0, 2}, // bass: lowCut is the clean split
};
constexpr int bassVoice = 3;
} // namespace

void TrackSound::update(const var &v) {
  // Validate the entire patch before changing any settings.
  for (auto key : {"compressorEnabled", "reverbEnabled", "gateEnabled", "ampBypass"})
    if (v.hasProperty(key)) require(v[key].isBool(), "Invalid effect switch");
  int character = ampCharacter;
  if (v.hasProperty("ampCharacter")) {
    require(v["ampCharacter"].isString(), "Invalid amp character");
    const auto name = v["ampCharacter"].toString();
    character = name == "none" ? -1 : -2;
    for (int i = 0; i < (int)std::size(ampCharacters); ++i)
      if (name == ampCharacters[i]) character = i;
    require(character >= -1, "Invalid amp character");
  }
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
  const bool ampWasActive = ampCharacter >= 0 && !ampBypass;
  if (v.hasProperty("ampBypass")) ampBypass = flag(v, "ampBypass");
  ampCharacter = character;
  voiceAmp();
  // Start from silence, not from whatever the filters held when last used.
  if (!ampWasActive && ampCharacter >= 0 && !ampBypass) resetAmp();
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
  o->setProperty("ampCharacter", ampCharacter >= 0 ? ampCharacters[ampCharacter] : "none");
  o->setProperty("ampBypass", ampBypass);
}

void TrackSound::voiceAmp() {
  if (sampleRate <= 0 || ampCharacter < 0) return;
  const auto &voice = ampVoices[ampCharacter];
  const auto hz = [&](double f) { return jmin(f, sampleRate * 0.45); };
  const IIRCoefficients flat(1, 0, 0, 1, 0, 0);
  const bool bass = ampCharacter == bassVoice;
  const auto lowCut = bass ? flat : IIRCoefficients::makeHighPass(sampleRate, hz(voice.lowCut), 0.707);
  const auto hump = IIRCoefficients::makePeakFilter(sampleRate, hz(voice.hump), 0.8, Decibels::decibelsToGain(voice.humpGain));
  const IIRCoefficients post[] = {
      // The clipper's bias adds DC; the cabinet's low cut removes it.
      IIRCoefficients::makeHighPass(sampleRate, hz(bass ? 40 : 75), 0.8),
      IIRCoefficients::makePeakFilter(sampleRate, hz(110), 1.2, Decibels::decibelsToGain(voice.resonance)),
      IIRCoefficients::makePeakFilter(sampleRate, hz(400), 1, Decibels::decibelsToGain(voice.mud)),
      IIRCoefficients::makePeakFilter(sampleRate, hz(2500), 1.4, Decibels::decibelsToGain(voice.presence)),
      IIRCoefficients::makeLowPass(sampleRate, hz(voice.cabinet), 0.707),
      IIRCoefficients::makeLowPass(sampleRate, hz(voice.cabinet), 0.707),
  };
  for (int ch = 0; ch < 2; ++ch) {
    ampPre[ch][0].setCoefficients(lowCut);
    ampPre[ch][1].setCoefficients(hump);
    for (int i = 0; i < (int)std::size(post); ++i) ampPost[ch][i].setCoefficients(post[i]);
    for (int i = 0; i < 4; ++i)
      ampSplit[ch][i].setCoefficients(i < 2 ? IIRCoefficients::makeLowPass(sampleRate, hz(voice.lowCut), 0.707)
                                            : IIRCoefficients::makeHighPass(sampleRate, hz(voice.lowCut), 0.707));
  }
  ampBias = voice.bias;
  ampCeiling = voice.ceiling;
  ampDrive.setTargetValue(Decibels::decibelsToGain(voice.gain));
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
  sampleRate = rate;
  // 4x with IIR half-band filters keeps clipping harmonics from folding back
  // as aliasing while adding only a few samples of delay.
  oversampling = std::make_unique<dsp::Oversampling<float>>(
      2, 2, dsp::Oversampling<float>::filterHalfBandPolyphaseIIR, false);
  oversampling->initProcessing((size_t)block);
  ampLow.setSize(2, block);
  ampDrives.setSize(1, block);
  ampDrive.reset(rate, 0.02);
  update(object({}));
  reset();
}

void TrackSound::reset() {
  reverbMix.setCurrentAndTargetValue(reverbAmount);
  compressor.reset();
  gate.reset();
  reverb.reset();
  resetAmp();
}

void TrackSound::resetAmp() {
  for (auto &channel : ampPre) for (auto &filter : channel) filter.reset();
  for (auto &channel : ampPost) for (auto &filter : channel) filter.reset();
  for (auto &channel : ampSplit) for (auto &filter : channel) filter.reset();
  if (oversampling) oversampling->reset();
  ampDrive.setCurrentAndTargetValue(ampDrive.getTargetValue());
}

void TrackSound::processGate(AudioBuffer<float> &buffer, int samples) {
  if (!gateEnabled) return;
  auto block = dsp::AudioBlock<float>(buffer).getSubBlock(0, (size_t)samples);
  gate.process(dsp::ProcessContextReplacing<float>(block));
}

void TrackSound::processAmp(AudioBuffer<float> &buffer, int samples) {
  if (ampCharacter < 0 || ampBypass || !oversampling || samples > ampDrives.getNumSamples()) return;
  const bool bass = ampCharacter == bassVoice;
  auto *drive = ampDrives.getWritePointer(0);
  for (int i = 0; i < samples; ++i) drive[i] = ampDrive.getNextValue();
  for (int ch = 0; ch < 2; ++ch) {
    auto *data = buffer.getWritePointer(ch);
    auto *low = ampLow.getWritePointer(ch);
    for (int i = 0; i < samples; ++i) {
      float x = data[i];
      if (bass) {
        // Keep the fundamental clean and drive only what sits above it.
        low[i] = ampSplit[ch][1].processSingleSampleRaw(ampSplit[ch][0].processSingleSampleRaw(x));
        x = ampSplit[ch][3].processSingleSampleRaw(ampSplit[ch][2].processSingleSampleRaw(x));
      }
      x = ampPre[ch][1].processSingleSampleRaw(ampPre[ch][0].processSingleSampleRaw(x));
      data[i] = x * drive[i];
    }
  }
  auto block = dsp::AudioBlock<float>(buffer).getSubBlock(0, (size_t)samples);
  auto up = oversampling->processSamplesUp(block);
  const float offset = std::tanh(ampBias);
  for (size_t ch = 0; ch < up.getNumChannels(); ++ch) {
    auto *data = up.getChannelPointer(ch);
    // A small bias makes the clipping asymmetric, adding even harmonics.
    for (size_t i = 0; i < up.getNumSamples(); ++i) data[i] = std::tanh(data[i] + ampBias) - offset;
  }
  oversampling->processSamplesDown(block);
  for (int ch = 0; ch < 2; ++ch) {
    auto *data = buffer.getWritePointer(ch);
    const auto *low = ampLow.getReadPointer(ch);
    for (int i = 0; i < samples; ++i) {
      float x = data[i] / jmin(drive[i], ampCeiling);
      for (auto &filter : ampPost[ch]) x = filter.processSingleSampleRaw(x);
      data[i] = bass ? x + low[i] : x;
    }
  }
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
