#include "Engine.h"
#include <cmath>

namespace basement {
// Regions share immutable audio. Splitting/copying/takes never duplicate PCM in memory.
void Engine::splitRecordedTakes(Track &t, size_t first) {
  const double span = recordingLoopEnd - recordingLoopStart;
  if (first >= t.clips.size())
    return;
  auto source = std::move(t.clips[first]);
  t.clips.erase(t.clips.begin() + (int)first);
  const auto group = Uuid().toString();
  const int count = (int)std::ceil((source->duration() - 1e-7) / span);
  for (int i = 0; i < count; ++i) {
    auto take = std::make_unique<Clip>(*source);
    take->id = Uuid().toString();
    take->start = recordingLoopStart;
    take->offset = i * span;
    take->length = jmin(span, source->sourceDuration() - take->offset);
    take->sourceStart = take->offset;
    take->sourceEnd = take->offset + take->length;
    take->takeGroup = group;
    take->take = i + 1;
    take->active = i == count - 1;
    take->name = t.name + " · Take " + String(i + 1);
    t.clips.push_back(std::move(take));
  }
}

void Engine::editClip(const var &c) {
  require(!recording, "Stop recording before editing regions");
  auto &t = track(c);
  const ScopedLock lock(guard);
  auto found = std::find_if(t.clips.begin(), t.clips.end(),
                            [&](auto &clip) { return clip->id == str(c, "clip"); });
  require(found != t.clips.end(), "Region no longer exists");
  auto &clip = **found;
  const auto action = str(c, "action");
  if (action == "sound") {
    require(!clip.isMidi, "Clip volume and fades apply to audio regions");
    const double gain = number(c, "gain", clip.gain), fadeIn = number(c, "fadeIn", clip.fadeIn), fadeOut = number(c, "fadeOut", clip.fadeOut);
    require(std::isfinite(gain) && gain >= 0 && gain <= 4 && std::isfinite(fadeIn) && std::isfinite(fadeOut) && fadeIn >= 0 && fadeOut >= 0 && fadeIn <= clip.duration() && fadeOut <= clip.duration(), "Invalid clip volume or fade");
    clip.gain = (float)gain;
    clip.fadeIn = fadeIn;
    clip.fadeOut = fadeOut;
    return;
  } else if (action == "notes") {
    require(clip.isMidi && clip.active && c["edits"].isArray(), "Select an active MIDI region");
    auto &edits = *c["edits"].getArray();
    require(edits.size() <= 2048, "Edit at most 2048 notes at a time");
    auto sequence = std::make_shared<MidiMessageSequence>(*clip.events);
    sequence->updateMatchedPairs();
    std::vector<int> removed;
    std::vector<MidiMessage> added;
    for (auto &v : edits) {
      const double rawIndex = number(v, "event", -1);
      require(std::isfinite(rawIndex) && rawIndex == std::floor(rawIndex) && rawIndex >= -1 && rawIndex < sequence->getNumEvents(), "Invalid note index");
      const int index = (int)rawIndex;
      int channel = 1, velocity = 100;
      if (index >= 0) {
        auto *event = sequence->getEventPointer(index);
        require(event->message.isNoteOn() && event->noteOffObject, "Note no longer exists");
        require(std::find(removed.begin(), removed.end(), index) == removed.end(), "Duplicate note edit");
        channel = event->message.getChannel();
        velocity = event->message.getVelocity();
        removed.push_back(index);
        removed.push_back(sequence->getIndexOf(event->noteOffObject));
      }
      if (flag(v, "delete")) { require(index >= 0, "Choose a note to delete"); continue; }
      const double begin = number(v, "start"), duration = number(v, "duration"), pitch = number(v, "note", -1);
      const double rawVelocity = number(v, "velocity", velocity), rawChannel = number(v, "channel", channel);
      require(std::isfinite(begin) && std::isfinite(duration) && begin >= 0 && duration >= 0.001 && begin + duration <= clip.duration() + 1e-8 && std::isfinite(pitch) && pitch >= 0 && pitch <= 127 && pitch == std::floor(pitch) && std::isfinite(rawVelocity) && rawVelocity >= 1 && rawVelocity <= 127 && rawVelocity == std::floor(rawVelocity) && rawChannel >= 1 && rawChannel <= 16 && rawChannel == std::floor(rawChannel), "Invalid MIDI note");
      auto on = MidiMessage::noteOn((int)rawChannel, (int)pitch, (uint8)rawVelocity);
      auto off = MidiMessage::noteOff((int)rawChannel, (int)pitch);
      on.setTimeStamp(clip.offset + begin); off.setTimeStamp(clip.offset + begin + duration);
      added.push_back(on); added.push_back(off);
    }
    std::sort(removed.rbegin(), removed.rend());
    for (int index : removed) sequence->deleteEvent(index, false);
    require(sequence->getNumEvents() + (int)added.size() <= 262144, "Too many MIDI events");
    for (const auto &event : added) sequence->addEvent(event);
    persistMidi(clip, sequence);
  } else if (action == "note" || action == "quantize") {
    require(clip.isMidi && clip.active, "Select an active MIDI region");
    auto sequence = std::make_shared<MidiMessageSequence>(*clip.events);
    sequence->updateMatchedPairs();
    if (action == "quantize") {
      const double division = number(c, "division", 16);
      require(division == 4 || division == 8 || division == 16 || division == 32,
              "Choose a supported beat grid");
      const double step = 240.0 / tempo / division;
      for (auto *event : *sequence) {
        if (!event->message.isNoteOn() || !event->noteOffObject) continue;
        const double begin = event->message.getTimeStamp();
        const double end = event->noteOffObject->message.getTimeStamp();
        // Preserve notes crossing a trimmed boundary and events outside this region.
        if (begin < clip.offset || end > clip.offset + clip.duration() + 1e-8) continue;
        const double duration = end - begin;
        if (duration <= 0) continue;
        const double first = std::ceil((clip.start - 1e-9) / step);
        const double last = std::floor((clip.start + clip.duration() - duration + 1e-9) / step);
        if (first > last) continue;
        const double beat = jlimit(first, last, std::round((clip.start + begin - clip.offset) / step));
        const double aligned = clip.offset + jmax(0.0, beat * step - clip.start);
        event->message.setTimeStamp(aligned);
        event->noteOffObject->message.setTimeStamp(aligned + duration);
      }
    } else {
    const int index = (int)number(c, "event", -1);
    const double begin = number(c, "position"), duration = number(c, "length");
    const double pitch = number(c, "pitch", -1);
    require(index >= 0 && index < clip.events->getNumEvents(), "Note no longer exists");
    const auto *original = clip.events->getEventPointer(index);
    require(original->message.isNoteOn() && original->noteOffObject, "Note cannot be edited");
    require(std::isfinite(begin) && std::isfinite(duration) && std::isfinite(pitch) &&
            begin >= 0 && duration > 0 && begin + duration <= clip.duration() + 1e-8 &&
            pitch >= 0 && pitch <= 127 && pitch == std::floor(pitch), "Invalid note position");
    auto *event = sequence->getEventPointer(index);
    event->message.setNoteNumber((int)pitch);
    event->noteOffObject->message.setNoteNumber((int)pitch);
    event->message.setTimeStamp(clip.offset + begin);
    event->noteOffObject->message.setTimeStamp(clip.offset + begin + duration);
    }
    persistMidi(clip, sequence);
  } else if (action == "take") {
    require(clip.takeGroup.isNotEmpty(), "This region has no alternate takes");
    for (auto &other : t.clips)
      if (other->takeGroup == clip.takeGroup)
        other->active = other->id == clip.id;
  } else if (action == "trim") {
    const double start = number(c, "position"), length = number(c, "length");
    const double delta = start - clip.start;
    if (clip.isMidi) {
      require(std::isfinite(start) && std::isfinite(length) && start >= 0 &&
                  length >= 1 / rate && length <= 1200,
              "MIDI regions must be shorter than 20 minutes");
      const auto group = clip.takeGroup;
      for (const auto &part : t.clips)
        if (part.get() == &clip || (group.isNotEmpty() && part->takeGroup == group)) {
          const double shift = jmax(0.0, -(part->offset + delta));
          require(jmax(part->midiLength + shift, part->offset + delta + shift + length) <= 1200,
                  "MIDI source must stay within 20 minutes");
        }
      for (auto &part : t.clips)
        if (part.get() == &clip || (group.isNotEmpty() && part->takeGroup == group)) {
          const double shift = jmax(0.0, -(part->offset + delta));
          const double sourceEnd = part->trimEnd();
          auto sequence = std::make_shared<MidiMessageSequence>(*part->events);
          if (shift > 0)
            for (auto *event : *sequence)
              event->message.setTimeStamp(event->message.getTimeStamp() + shift);
          part->offset += delta + shift;
          part->start = start;
          part->length = length;
          part->midiLength = jmax(part->midiLength + shift, part->offset + length);
          part->sourceStart = jmin(part->sourceStart + shift, part->offset);
          part->sourceEnd = jmax(sourceEnd + shift, part->offset + length);
          persistMidi(*part, sequence);
        }
    } else {
    require(std::isfinite(start) && std::isfinite(length) && start >= 0 &&
                clip.offset + delta >= clip.sourceStart - 1e-8 &&
                length >= 1 / rate && clip.offset + delta + length <= clip.trimEnd() + 1e-8,
            "Trim must stay inside the original source");
    for (auto &part : t.clips)
      if (part.get() == &clip || (clip.takeGroup.isNotEmpty() && part->takeGroup == clip.takeGroup))
        require(part->offset + delta >= part->sourceStart - 1e-8 &&
                    part->offset + delta < part->trimEnd() - 1 / rate,
                "Trim would exceed an alternate take");
    const auto group = clip.takeGroup;
    for (auto &part : t.clips)
      if (part.get() == &clip || (group.isNotEmpty() && part->takeGroup == group)) {
        part->length = jmin(length, part->trimEnd() - part->offset - delta);
        part->offset += delta;
        part->start = start;
        part->fadeIn = jmin(part->fadeIn, part->length);
        part->fadeOut = jmin(part->fadeOut, part->length);
      }
    }
  } else if (action == "split") {
    const double at = number(c, "position") - clip.start;
    require(at > 1 / rate && at < clip.duration() - 1 / rate,
            "Place the playhead inside the region to split");
    if (clip.takeGroup.isNotEmpty()) {
      const auto group = clip.takeGroup, rightGroup = Uuid().toString();
      const size_t count = t.clips.size();
      bool rightActive = false;
      for (size_t i = 0; i < count; ++i) {
        auto &part = *t.clips[i];
        if (part.takeGroup != group || part.duration() <= at)
          continue;
        auto right = std::make_unique<Clip>(part);
        right->id = Uuid().toString();
        right->start += at;
        right->offset += at;
        right->length = part.duration() - at;
        right->takeGroup = rightGroup;
        rightActive |= right->active;
        part.length = at;
        t.clips.push_back(std::move(right));
      }
      if (!rightActive)
        for (auto &part : t.clips)
          if (part->takeGroup == rightGroup) {
            part->active = true;
            break;
          }
      preparePlayback(position, looping);
      return;
    }
    auto right = std::make_unique<Clip>(clip);
    right->id = Uuid().toString();
    right->start += at;
    right->offset += at;
    right->length = clip.duration() - at;
    right->takeGroup.clear();
    right->take = 0;
    clip.length = at;
    clip.takeGroup.clear();
    clip.take = 0;
    t.clips.push_back(std::move(right));
  } else if (action == "move" || action == "copy") {
    const double start = number(c, "position");
    require(std::isfinite(start) && start >= 0, "Invalid region position");
    Track *destination = &t;
    if (str(c, "target").isNotEmpty())
      destination = &track(object({{"track", str(c, "target")}}));
    require(destination->isMidi == t.isMidi, "Audio and MIDI regions need matching track types");
    if (action == "move" && clip.takeGroup.isNotEmpty()) {
      const auto group = clip.takeGroup;
      std::vector<std::unique_ptr<Clip>> moved;
      for (auto &part : t.clips)
        if (part->takeGroup == group) {
          part->start = start;
        part->fadeIn = jmin(part->fadeIn, part->length);
        part->fadeOut = jmin(part->fadeOut, part->length);
          moved.push_back(std::move(part));
        }
      std::erase_if(t.clips, [](auto &part) { return !part; });
      for (auto &part : moved)
        destination->clips.push_back(std::move(part));
      preparePlayback(position, looping);
      return;
    }
    auto moved = action == "copy" ? std::make_unique<Clip>(clip) : std::move(*found);
    if (action == "copy")
      moved->id = Uuid().toString();
    else
      t.clips.erase(found);
    moved->start = start;
    moved->takeGroup.clear();
    moved->take = 0;
    moved->active = true;
    destination->clips.push_back(std::move(moved)); // Last edited region wins overlaps.
  } else
    throw std::runtime_error("Unknown region edit");
  preparePlayback(position, looping);
}
} // namespace basement
