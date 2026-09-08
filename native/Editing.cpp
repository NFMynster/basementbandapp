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
  if (action == "take") {
    require(clip.takeGroup.isNotEmpty(), "This region has no alternate takes");
    for (auto &other : t.clips)
      if (other->takeGroup == clip.takeGroup)
        other->active = other->id == clip.id;
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
