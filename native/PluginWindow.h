#pragma once
#include "Json.h"
#include "WindowFocus.h"

namespace basement {
class PluginWindow : public DocumentWindow {
public:
  PluginWindow(AudioPluginInstance &p)
      : DocumentWindow(p.getName(), Colours::darkgrey, DocumentWindow::closeButton) {
    setUsingNativeTitleBar(true);
    setContentOwned(
        p.createEditorIfNeeded() ? p.getActiveEditor() : new GenericAudioProcessorEditor(p), true);
    centreWithSize(getWidth(), getHeight());
    setVisible(true);
#if JUCE_MAC
    Process::makeForegroundProcess();
#endif
    raise();
    if (auto *content = getContentComponent(); content && content->getWantsKeyboardFocus())
      content->grabKeyboardFocus();
    Component::SafePointer<PluginWindow> safe(this);
    MessageManager::callAsync([safe] {
      if (safe == nullptr) return;
#if JUCE_MAC
      Process::makeForegroundProcess();
#endif
      safe->raise();
    });
  }
  // toFront alone is ignored on Windows: the engine is a background process.
  void raise() {
    toFront(true);
    if (auto *peer = getPeer()) bringToForeground(peer->getNativeHandle());
  }
  void closeButtonPressed() override { setVisible(false); }
};

} // namespace basement
