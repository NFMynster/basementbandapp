import React, { useState } from "react";
import type { Devices, Track } from "../../models";
import type { EngineSession } from "./useEngineSession";

export type InspectorPanel = "input" | "plugins" | "eq" | "notes" | "region";
export type SettingsTab = "audio" | "midi" | "shortcuts" | "export";

/** Which dialog or inspector panel is open, plus the device list they show. */
export function useDialogs({
  run,
  track,
  setSelected,
}: {
  run: EngineSession["run"];
  track: Track | undefined;
  setSelected: (id: string) => void;
}) {
  const [panel, setPanel] = useState<InspectorPanel>("input"),
    [propertiesPing, setPropertiesPing] = useState(0),
    [showHelp, setHelp] = useState(false),
    [welcome, setWelcome] = useState(
      () => localStorage.getItem("basement.hideWelcome") !== "1",
    ),
    [setup, setSetup] = useState(false),
    [settingsTab, setSettingsTab] = useState<SettingsTab>("audio"),
    [devices, setDevices] = useState<Devices | null>(null),
    [deviceLoading, setDeviceLoading] = useState(false),
    [creatingTrack, setCreatingTrack] = useState(false),
    [soundBrowser, setSoundBrowser] = useState<{
      track: string;
      append?: boolean;
      presets?: boolean;
    } | null>(null);

  async function openSetup(tab?: "audio" | "midi" | React.MouseEvent) {
    setSettingsTab(
      typeof tab === "string" ? tab : track?.kind === "midi" ? "midi" : "audio",
    );
    setSetup(true);
    setDevices(null);
    setDeviceLoading(true);
    try {
      const d = await run({ op: "devices" }, false);
      if (d) setDevices(d);
    } finally {
      setDeviceLoading(false);
    }
  }
  async function openCreateTrack() {
    setCreatingTrack(true);
    const devices = await run({ op: "devices" }, false);
    if (devices) setDevices(devices);
  }
  function openProperties(id: string) {
    setSelected(id);
    setPanel("input");
    setPropertiesPing((value) => value + 1);
  }

  return {
    panel,
    setPanel,
    propertiesPing,
    openProperties,
    showHelp,
    setHelp,
    welcome,
    setWelcome,
    setup,
    setSetup,
    settingsTab,
    setSettingsTab,
    openSetup,
    devices,
    setDevices,
    deviceLoading,
    creatingTrack,
    setCreatingTrack,
    openCreateTrack,
    soundBrowser,
    setSoundBrowser,
  };
}
