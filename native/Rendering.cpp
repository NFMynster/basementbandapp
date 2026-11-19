#include "Engine.h"
#include <cmath>

namespace basement {
static void panicMidi(MidiBuffer &buffer, int sample) {
  for (int ch = 1; ch <= 16; ++ch) {
    buffer.addEvent(MidiMessage::controllerEvent(ch, 64, 0), sample);
    buffer.addEvent(MidiMessage::allNotesOff(ch), sample);
    buffer.addEvent(MidiMessage::allSoundOff(ch), sample);
  }
}
// One plug-in emitting NaN/inf would otherwise poison the EQ filter state and
// the whole mix (metronome included). Silence the block, reset the stage that
// produced it plus everything downstream, and leave a flag for the log.
bool Engine::silenceInvalidAudio(Track &t, int n, int stage) {
  for (int ch = 0; ch < 2; ++ch) {
    const float *data = t.scratch.getReadPointer(ch);
    for (int i = 0; i < n; ++i)
      if (!std::isfinite(data[i])) {
        t.scratch.clear(0, n);
        // Hosted VST3 reset() deactivates and reactivates the plug-in, which is
        // not real-time safe. Do it at most once per timer report (1 s): the
        // flag stays set until timerCallback logs and clears it.
        if (t.invalidStage.load(std::memory_order_relaxed) == Track::invalidNone) {
          if (stage == -1 && t.plugin) t.plugin->reset();
          if (stage >= 0 && stage < (int)t.effects.size()) t.effects[(size_t)stage].plugin->reset();
        }
        for (auto &channel : t.eqFilters) for (auto &filter : channel) filter.reset();
        t.sound.reset();
        t.invalidStage.store(stage, std::memory_order_relaxed);
        return true;
      }
  }
  return false;
}

// Shared sample interpolation and plug-in processing for playback and export.
void Engine::renderTrack(Track &t, double start, int n, bool cycle, const float *liveInput) {
  // JUCE snaps filter and reverb state to zero only on Intel; on ARM it relies
  // on flush-to-zero, so decaying tails stay as slow denormals otherwise.
  const ScopedNoDenormals noDenormals;
  double transportTime = start < 0 ? position.load() : start;
  if (cycle && loopEnd > loopStart && transportTime >= loopEnd)
    transportTime = loopStart + std::fmod(transportTime - loopStart, loopEnd - loopStart);
  auto &info = t.playHead.info;
  info.setTimeInSeconds(transportTime);
  info.setTimeInSamples((int64)std::llround(transportTime * rate));
  info.setBpm(tempo);
  info.setTimeSignature(AudioPlayHead::TimeSignature{4, 4});
  info.setPpqPosition(transportTime * tempo / 60);
  info.setPpqPositionOfLastBarStart(std::floor(transportTime * tempo / 240) * 4);
  info.setIsPlaying(playing || exporting);
  info.setIsRecording(recording);
  info.setIsLooping(cycle);
  info.setLoopPoints(AudioPlayHead::LoopPoints{loopStart * tempo / 60, loopEnd * tempo / 60});
  t.scratch.clear();
  midi.clear();
  if (t.panic) {
    panicMidi(midi, 0);
    t.panic = false;
  }
  for (int i = 0; i < n; ++i) {
    double time = start + i / rate;
    if (start < 0)
      break; // Live instrument monitoring without arrangement playback.
    if (cycle && loopEnd > loopStart && time >= loopEnd)
      time = loopStart + std::fmod(time - loopStart, loopEnd - loopStart);
    if (t.isMidi && t.previousMidiTime >= 0 && time < t.previousMidiTime)
      panicMidi(midi, i);
    bool chase = t.isMidi && (t.previousMidiTime < 0 || time < t.previousMidiTime);
    t.previousMidiTime = time;
    Clip *top = nullptr;
    for (auto &candidate : t.clips)
      if (candidate->active && time >= candidate->start &&
          time < candidate->start + candidate->duration())
        top = candidate.get();
    if (t.isMidi && top != t.previousClip) {
      panicMidi(midi, i);
      chase = true;
    }
    t.previousClip = top;
    for (auto &c : t.clips) {
      if (c.get() != top)
        continue;
      if (c->isMidi) {
        const double relative = time - c->start + c->offset;
        if (relative < c->offset || relative > c->offset + c->duration() + 1 / rate)
          continue;
        if (chase)
          for (auto *event : *c->events) {
            if (event->message.isNoteOn() && event->message.getTimeStamp() < relative &&
                event->noteOffObject && event->noteOffObject->message.getTimeStamp() > relative)
              midi.addEvent(event->message, i);
          }
        if (chase || c->eventPosition < 0 || relative < c->eventPosition ||
            relative - c->eventPosition > 1.5 / rate) {
          int low = 0, high = c->events->getNumEvents();
          while (low < high) {
            const int mid = (low + high) / 2;
            if (c->events->getEventPointer(mid)->message.getTimeStamp() < relative - 1e-9)
              low = mid + 1;
            else
              high = mid;
          }
          c->eventCursor = low;
        }
        c->eventPosition = relative;
        while (c->eventCursor < c->events->getNumEvents()) {
          const auto &event = c->events->getEventPointer(c->eventCursor)->message;
          if (event.getTimeStamp() >= relative + 1 / rate - 1e-9)
            break;
          midi.addEvent(event, i);
          ++c->eventCursor;
        }
        continue;
      }
      double sample = (time - c->start + c->offset) * c->sampleRate;
      if (sample < 0 || sample >= c->audio->getNumSamples())
        continue;
      int a = (int)sample, b = jmin(a + 1, c->audio->getNumSamples() - 1);
      float f = (float)(sample - a);
      for (int ch = 0; ch < 2; ++ch) {
        int source = jmin(ch, c->audio->getNumChannels() - 1);
        float v = c->audio->getSample(source, a) * (1 - f) + c->audio->getSample(source, b) * f;
        const double relative = time - c->start;
        const double fadeIn = c->fadeIn > 0 ? jlimit(0.0, 1.0, relative / c->fadeIn) : 1;
        const double fadeOut = c->fadeOut > 0 ? jlimit(0.0, 1.0, (c->duration() - relative) / c->fadeOut) : 1;
        t.scratch.addSample(ch, i, v * c->gain * (float)jmin(fadeIn, fadeOut));
      }
    }
  }
  if (liveInput)
    for (int ch = 0; ch < 2; ++ch)
      t.scratch.addFrom(ch, 0, liveInput, n);
  if (!t.isMidi) {
    t.sound.processGate(t.scratch, n);
    t.sound.processAmp(t.scratch, n);
    // Check before the plug-ins so a bad input is not blamed on them.
    silenceInvalidAudio(t, n, Track::invalidBuiltIn);
  }
  if (t.plugin && !t.bypass) {
    midi.addEvents(t.auditionMidi, 0, n, 0);
    t.auditionMidi.clear();
    if (t.auditionSamples > 0) {
      if (t.auditionSamples <= n) {
        midi.addEvent(MidiMessage::noteOff(t.auditionChannel, t.auditionNote), t.auditionSamples - 1);
        t.auditionTail = (int)(rate * 0.3);
      }
      t.auditionSamples = jmax(0, t.auditionSamples - n);
    } else t.auditionTail = jmax(0, t.auditionTail - n);
    // MIDI tracks have no monitor switch; live input always plays (Midi.cpp).
    if (t.isMidi)
      midi.addEvents(t.liveMidi, 0, n, 0);
    AudioBuffer<float> view(t.scratch.getArrayOfWritePointers(), 2, n);
    t.plugin->processBlock(view, midi);
    silenceInvalidAudio(t, n, -1);
  }
  for (size_t e = 0; e < t.effects.size(); ++e) {
    auto &effect = t.effects[e];
    if (effect.bypass) continue;
    AudioBuffer<float> view(t.scratch.getArrayOfWritePointers(), 2, n);
    midi.clear();
    effect.plugin->processBlock(view, midi);
    silenceInvalidAudio(t, n, (int)e);
  }
  const std::array<float, 8> gains{t.eqBass, t.eqMid, t.eqTreble, t.eqBassFrequency, t.eqMidFrequency, t.eqTrebleFrequency, t.eqMidQ, t.eqLowCut};
  if (t.eqRate != rate || t.eqApplied != gains) {
    const auto bass = IIRCoefficients::makeLowShelf(rate, jmin((double)t.eqBassFrequency, rate * 0.49), 0.707, Decibels::decibelsToGain(t.eqBass));
    const auto mid = IIRCoefficients::makePeakFilter(rate, jmin((double)t.eqMidFrequency, rate * 0.49), t.eqMidQ, Decibels::decibelsToGain(t.eqMid));
    const auto treble = IIRCoefficients::makeHighShelf(rate, jmin((double)t.eqTrebleFrequency, rate * 0.49), 0.707, Decibels::decibelsToGain(t.eqTreble));
    for (auto &channel : t.eqFilters) {
      channel[0].setCoefficients(bass);
      channel[1].setCoefficients(mid);
      channel[2].setCoefficients(treble);
      channel[3].setCoefficients(t.eqLowCut <= 20 ? IIRCoefficients(1, 0, 0, 1, 0, 0) : IIRCoefficients::makeHighPass(rate, jmin((double)t.eqLowCut, rate * 0.49), 0.707));
    }
    t.eqRate = rate;
    t.eqApplied = gains;
  }
  for (int ch = 0; ch < 2; ++ch)
    for (auto &filter : t.eqFilters[ch])
      if (t.eqEnabled) filter.processSamples(t.scratch.getWritePointer(ch), n);
      else filter.reset();
  t.sound.processSound(t.scratch, n);
  silenceInvalidAudio(t, n, Track::invalidBuiltIn);
}
} // namespace basement
