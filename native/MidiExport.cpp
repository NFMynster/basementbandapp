#include "Engine.h"
#include <algorithm>

namespace basement {
void Engine::exportMidiTrack(const Track &t, const File &file, double duration) {
  MidiMessageSequence sequence;
  const double ticksPerSecond = 960.0 * tempo / 60;
  auto add = [&](MidiMessage message, double seconds) {
    message.setTimeStamp(seconds * ticksPerSecond);
    sequence.addEvent(message);
  };
  add(MidiMessage::textMetaEvent(3, t.name), 0);
  add(MidiMessage::tempoMetaEvent((int)std::llround(60000000.0 / tempo)), 0);
  add(MidiMessage::timeSignatureMetaEvent(4, 4), 0);

  // Resolve overlapping regions with the same last-active-region rule as
  // playback. Merge adjacent windows of the same region to avoid retriggers.
  std::vector<double> boundaries;
  for (const auto &clip : t.clips) if (clip->active) {
    boundaries.push_back(clip->start);
    boundaries.push_back(clip->start + clip->duration());
  }
  std::sort(boundaries.begin(), boundaries.end());
  boundaries.erase(std::unique(boundaries.begin(), boundaries.end()), boundaries.end());
  struct Window { const Clip *clip; double start, end; };
  std::vector<Window> windows;
  for (size_t i = 1; i < boundaries.size(); ++i) {
    const double begin = boundaries[i - 1], end = boundaries[i];
    const Clip *top = nullptr;
    for (const auto &clip : t.clips)
      if (clip->active && begin >= clip->start && begin < clip->start + clip->duration()) top = clip.get();
    if (!top) continue;
    if (!windows.empty() && windows.back().clip == top && windows.back().end == begin)
      windows.back().end = end;
    else windows.push_back({top, begin, end});
  }
  for (const auto &window : windows) {
    const auto &clip = *window.clip;
    const double sourceStart = window.start - clip.start + clip.offset;
    const double sourceEnd = window.end - clip.start + clip.offset;
    for (const auto *event : *clip.events) {
      const auto &message = event->message;
      const auto at = message.getTimeStamp();
      if (message.isNoteOn()) {
        const double end = event->noteOffObject ? event->noteOffObject->message.getTimeStamp() : sourceEnd;
        if (at >= sourceEnd || end <= sourceStart) continue;
        add(message, window.start + jmax(at, sourceStart) - sourceStart);
        add(MidiMessage::noteOff(message.getChannel(), message.getNoteNumber()),
            window.start + jmin(end, sourceEnd) - sourceStart);
      } else if (!message.isNoteOff() && message.getChannel() > 0 && at >= sourceStart && at < sourceEnd) {
        add(message, window.start + at - sourceStart);
      }
    }
    // Sustain and held notes cannot leak into the next region or beyond a trim.
    for (int channel = 1; channel <= 16; ++channel) {
      add(MidiMessage::controllerEvent(channel, 64, 0), window.end);
      add(MidiMessage::allNotesOff(channel), window.end);
      add(MidiMessage::allSoundOff(channel), window.end);
    }
  }
  add(MidiMessage::endOfTrack(), duration);
  sequence.sort();
  MidiFile midiFile;
  midiFile.setTicksPerQuarterNote(960);
  midiFile.addTrack(sequence);
  auto stream = file.createOutputStream();
  require(stream != nullptr && midiFile.writeTo(*stream), "Could not write MIDI export");
  stream->flush();
  require(stream->getStatus().wasOk(), "Could not finish MIDI export");
}
} // namespace basement
