#pragma once

namespace basement {
// Brings a top-level native window to the front and gives it keyboard focus.
// The audio engine is a background child process, so Windows' focus-stealing
// protection ignores its own requests; this borrows the foreground window's
// input queue for the switch. No-op on other platforms.
void bringToForeground(void *nativeWindow);
} // namespace basement
