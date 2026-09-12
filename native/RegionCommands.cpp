#include "Engine.h"
#include <cmath>

namespace basement {
var Engine::handleRegionCommand(const var &c) {
  const auto op = str(c, "op");
  if (op == "audition") {
    const ScopedLock lock(guard);
    auto &t = track(c);
    if (playing || recording || !t.isMidi || !t.plugin || t.bypass) return state();
    const int note = (int)number(c, "note", 60), channel = (int)number(c, "channel", 1);
    const int velocity = (int)number(c, "velocity", 100);
    require(note >= 0 && note <= 127 && channel >= 1 && channel <= 16 && velocity >= 1 && velocity <= 127, "Invalid preview note");
    if (t.auditionSamples > 0) t.auditionMidi.addEvent(MidiMessage::noteOff(t.auditionChannel, t.auditionNote), 0);
    t.auditionNote = note;
    t.auditionChannel = channel;
    t.auditionSamples = (int)(rate * 0.2);
    t.auditionTail = 0;
    t.auditionMidi.addEvent(MidiMessage::noteOn(channel, note, (uint8)velocity), 0);
    return state();
  }
  if (op == "createMidi") {
    require(!recording, "Stop recording before creating a region");
    auto &t = track(c);
    require(t.isMidi, "Choose a MIDI track");
    const double at = number(c, "position"), duration = number(c, "length", 960.0 / tempo);
    require(std::isfinite(at) && at >= 0 && std::isfinite(duration) && duration >= 0.001 && duration <= 1200, "Invalid MIDI region");
    auto clip = std::make_unique<Clip>();
    clip->isMidi = true; clip->name = t.name + " notes"; clip->start = at; clip->midiLength = duration;
    persistMidi(*clip, std::make_shared<MidiMessageSequence>());
    const ScopedLock lock(guard);
    t.clips.push_back(std::move(clip));
    prepareTrack(t, position, looping);
    return state();
  }
  if (op == "editClip") {
    editClip(c);
    return state();
  }
  if (op == "export") {
    return exportAudio(c);
  }
  if (op == "import") {
    require(!recording, "Stop recording before importing audio");
    auto &t = track(c);
    auto source = File(str(c, "path"));
    auto dest = File(folder).getChildFile(Uuid().toString() + source.getFileExtension());
    require(source.copyFileTo(dest), "Could not copy imported audio into this session");
    const auto at = number(c, "position", position);
    require(std::isfinite(at) && at >= 0, "Invalid import position");
    auto clip = t.isMidi
                    ? readMidiClip(dest.getFullPathName(), source.getFileNameWithoutExtension(), at)
                    : readClip(dest.getFullPathName(), source.getFileNameWithoutExtension(), at);
    const ScopedLock l(guard);
    t.clips.push_back(std::move(clip));
  } else if (op == "editRegions") {
    require(!recording, "Stop recording before editing regions");
    const auto action = str(c, "action");
    require(action == "move" || action == "delete", "Invalid region action");
    require(c["regions"].isArray() && c["regions"].getArray()->size() <= 2048, "Invalid region selection");
    const double delta = number(c, "delta");
    require(std::isfinite(delta), "Invalid move distance");
    const ScopedLock lock(guard);
    std::vector<std::pair<Track *, Clip *>> selected;
    for (const auto &item : *c["regions"].getArray()) {
      auto &t = track(item);
      auto found = std::find_if(t.clips.begin(), t.clips.end(), [&](auto &clip) { return clip->id == str(item, "clip"); });
      require(found != t.clips.end() && (*found)->active, "Region no longer exists");
      if (action == "move") require((*found)->start + delta >= 0, "Regions cannot start before zero");
      selected.emplace_back(&t, found->get());
    }
    // Resolve all take groups before mutating; each take moves/deletes once.
    for (auto &t : tracks) {
      auto matches = [&](const auto &clip) {
        return std::any_of(selected.begin(), selected.end(), [&](const auto &item) {
          return item.first == t.get() && (item.second == clip.get() ||
              (item.second->takeGroup.isNotEmpty() && item.second->takeGroup == clip->takeGroup));
        });
      };
      std::vector<String> ids;
      for (const auto &clip : t->clips) if (matches(clip)) ids.push_back(clip->id);
      if (action == "delete") std::erase_if(t->clips, [&](const auto &clip) {
        return std::find(ids.begin(), ids.end(), clip->id) != ids.end();
      });
      else for (auto &clip : t->clips)
        if (std::find(ids.begin(), ids.end(), clip->id) != ids.end()) clip->start += delta;
    }
    preparePlayback(position, looping);
  } else if (op == "removeClip") {
    require(!recording, "Stop recording before editing regions");
    auto &t = track(c);
    const ScopedLock l(guard);
    String group;
    for (const auto &clip : t.clips)
      if (clip->id == str(c, "clip")) group = clip->takeGroup;
    std::erase_if(t.clips, [&](auto &clip) {
      return clip->id == str(c, "clip") || (group.isNotEmpty() && clip->takeGroup == group);
    });
    preparePlayback(position, looping);
  } else throw std::runtime_error("Unknown region command");
  syncAudioInput();
  return state();
}
} // namespace basement
