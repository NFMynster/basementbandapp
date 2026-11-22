#pragma once
#include <juce_audio_utils/juce_audio_utils.h>

namespace basement {
using namespace juce;
inline var object(std::initializer_list<std::pair<String, var>> values) {
  auto *d = new DynamicObject();
  for (auto &[k, v] : values)
    d->setProperty(Identifier(k), v);
  return var(d);
}
inline String str(const var &v, const char *key, const String &fallback = {}) {
  return v.getProperty(key, fallback).toString();
}
inline double number(const var &v, const char *key, double fallback = 0) {
  return (double)v.getProperty(key, fallback);
}
inline bool flag(const var &v, const char *key, bool fallback = false) {
  return (bool)v.getProperty(key, fallback);
}
/**
 * Deep equality for engine JSON. Shared objects compare by identity first, so
 * clips whose cached JSON did not change cost nothing to compare.
 */
inline bool sameJson(const var &a, const var &b) {
  if (auto *x = a.getDynamicObject()) {
    auto *y = b.getDynamicObject();
    if (y == nullptr) return false;
    if (x == y) return true;
    const auto &mine = x->getProperties(), &theirs = y->getProperties();
    if (mine.size() != theirs.size()) return false;
    for (int i = 0; i < mine.size(); ++i) {
      const auto *other = theirs.getVarPointer(mine.getName(i));
      if (other == nullptr || !sameJson(*mine.getVarPointerAt(i), *other)) return false;
    }
    return true;
  }
  if (auto *x = a.getArray()) {
    auto *y = b.getArray();
    if (y == nullptr || x->size() != y->size()) return false;
    if (x == y) return true;
    for (int i = 0; i < x->size(); ++i)
      if (!sameJson(x->getReference(i), y->getReference(i))) return false;
    return true;
  }
  return b.getDynamicObject() == nullptr && b.getArray() == nullptr && a.equalsWithSameType(b);
}
inline void require(bool condition, const char *message) {
  if (!condition)
    throw std::runtime_error(message);
}

} // namespace basement
