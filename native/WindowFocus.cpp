// Kept apart from the JUCE sources: <windows.h> names clash with JUCE's
// (Rectangle, Point...) under `using namespace juce`.
#include "WindowFocus.h"

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#define WIN32_LEAN_AND_MEAN
#include <windows.h>

namespace basement {
void bringToForeground(void *nativeWindow) {
  const auto window = static_cast<HWND>(nativeWindow);
  if (!window) return;
  const HWND foreground = GetForegroundWindow();
  const DWORD foregroundThread = foreground ? GetWindowThreadProcessId(foreground, nullptr) : 0;
  const DWORD ownThread = GetCurrentThreadId();
  // While attached to the foreground thread's input, this thread may set the
  // foreground window. The app's own UI is that foreground window here.
  const bool attached = foregroundThread != 0 && foregroundThread != ownThread &&
                        AttachThreadInput(ownThread, foregroundThread, TRUE);
  if (IsIconic(window)) ShowWindow(window, SW_RESTORE);
  BringWindowToTop(window);
  SetForegroundWindow(window);
  SetActiveWindow(window);
  if (attached) AttachThreadInput(ownThread, foregroundThread, FALSE);
}
} // namespace basement
#else
namespace basement {
void bringToForeground(void *) {}
} // namespace basement
#endif
