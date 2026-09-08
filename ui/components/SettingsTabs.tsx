export type SettingsTab = "audio" | "midi" | "shortcuts" | "export";

const labels: Record<SettingsTab, string> = {
  audio: "Audio inputs & output",
  midi: "MIDI tracks",
  shortcuts: "Keyboard shortcuts",
  export: "Export",
};

export function SettingsTabs({
  selected,
  onChange,
}: {
  selected: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}) {
  return (
    <div
      className="settings-tabs"
      role="tablist"
      aria-label="Settings sections"
    >
      {(Object.keys(labels) as SettingsTab[]).map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={selected === tab}
          onClick={() => onChange(tab)}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}
