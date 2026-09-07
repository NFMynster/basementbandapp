#pragma once
#include "Json.h"

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
  }
  void closeButtonPressed() override { setVisible(false); }
};

} // namespace basement
