#include "Engine.h"

namespace basement {
void Engine::handleIncomingMidiMessage(MidiInput *source, const MidiMessage &message) {
  if (message.getRawDataSize() > 3 || message.getChannel() == 0)
    return;
  const ScopedLock lock(guard);
  for (auto &t : tracks)
    if (t->isMidi && (t->armed || t->monitor) && source &&
        t->midiDevice == source->getIdentifier() &&
        (t->midiChannel == 0 || t->midiChannel == message.getChannel()))
      t->collector.addMessageToQueue(message);
}

std::unique_ptr<Clip> Engine::readMidiClip(String path, String name, double start) {
  auto clone = [&](const Clip &source) {
    auto result = std::make_unique<Clip>(source);
    result->id = Uuid().toString();
    result->name = name;
    result->start = start;
    result->cachedKey.clear();
    result->cachedJson = var();
    return result;
  };
  if (const auto cached = mediaCache.find(path); cached != mediaCache.end())
    return clone(*cached->second);

  FileInputStream input{File(path)};
  MidiFile file;
  require(File(path).getSize() <= 32 * 1024 * 1024, "MIDI file is too large");
  require(input.openedOk() && file.readFrom(input), "Could not read MIDI file");
  file.convertTimestampTicksToSeconds();
  auto clip = std::make_unique<Clip>();
  clip->isMidi = true;
  clip->name = name;
  clip->path = path;
  clip->start = start;
  clip->midiLength = jmax(0.001, file.getLastTimestamp());
  require(clip->midiLength <= 60 * 20, "MIDI regions must be shorter than 20 minutes");
  for (int i = 0; i < file.getNumTracks(); ++i) {
    const auto *sequence = file.getTrack(i);
    require(sequence->getNumEvents() + clip->events->getNumEvents() <= 262144,
            "MIDI file has too many events");
    for (const auto *event : *sequence) {
      const auto &m = event->message;
      if (m.getChannel() > 0 && m.getRawDataSize() <= 3)
        clip->events->addEvent(m);
    }
  }
  clip->events->updateMatchedPairs();
  mediaCache[path] = std::shared_ptr<Clip>(std::move(clip));
  return clone(*mediaCache[path]);
}

void Engine::persistMidi(Clip &clip, std::shared_ptr<MidiMessageSequence> sequence) {
  sequence->sort();
  sequence->updateMatchedPairs();
  MidiMessageSequence disk(*sequence);
  for (auto *item : disk) item->message.setTimeStamp(item->message.getTimeStamp() * 1000);
  auto end = MidiMessage::endOfTrack();
  end.setTimeStamp(clip.sourceDuration() * 1000);
  disk.addEvent(end);
  MidiFile file;
  file.setSmpteTimeFormat(25, 40);
  file.addTrack(disk);
  const auto path = File(folder).getChildFile(Uuid().toString() + ".mid");
  {
    FileOutputStream output(path);
    require(output.openedOk() && file.writeTo(output), "Could not save edited MIDI");
  }
  clip.events = std::move(sequence);
  clip.path = path.getFullPathName();
  clip.cachedKey.clear();
  clip.eventPosition = -1;
}

void Engine::finishMidiTake(Track &t) {
  t.midiRecording = false;
  if (t.midiTake.empty())
    return;
  MidiMessageSequence sequence;
  bool held[16][128]{};
  for (const auto &event : t.midiTake) {
    MidiMessage m(event.data, event.size, event.time * 1000);
    sequence.addEvent(m);
    if (m.isNoteOn())
      held[m.getChannel() - 1][m.getNoteNumber()] = true;
    if (m.isNoteOff())
      held[m.getChannel() - 1][m.getNoteNumber()] = false;
  }
  const auto duration = jmax(0.001, position.load() - t.recordStart - t.captureOffset);
  for (int channel = 1; channel <= 16; ++channel) {
    for (int note = 0; note < 128; ++note)
      if (held[channel - 1][note]) {
        auto off = MidiMessage::noteOff(channel, note);
        off.setTimeStamp(duration * 1000);
        sequence.addEvent(off);
      }
    auto off = MidiMessage::allNotesOff(channel);
    off.setTimeStamp(duration * 1000);
    sequence.addEvent(off);
  }
  sequence.updateMatchedPairs();
  auto end = MidiMessage::endOfTrack();
  end.setTimeStamp(duration * 1000);
  sequence.addEvent(end);
  MidiFile file;
  file.setSmpteTimeFormat(25, 40);
  file.addTrack(sequence);
  const auto path = File(folder).getChildFile(Uuid().toString() + ".mid");
  {
    FileOutputStream output(path);
    require(output.openedOk() && file.writeTo(output), "Could not save recorded MIDI");
  }
  auto clip = readMidiClip(path.getFullPathName(), t.name + " take", t.recordStart);
  t.clips.push_back(std::move(clip));
  t.midiTake.clear();
}
} // namespace basement
