import { useEffect, useState } from "react";
import { FolderOpen, Search, Star, Trash2, RefreshCw } from "lucide-react";
import { Modal } from "./Modal";
import { desktop as api } from "../services/desktop";
import type { LibraryCommand, SoundLibrary } from "../models";
import type { WorkspaceController } from "../hooks/useWorkspace";

export function SoundBrowser({
  controller: w,
}: {
  controller: WorkspaceController;
}) {
  const target = w.soundBrowser;
  const [data, setData] = useState<SoundLibrary | null>(null),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [pending, setPending] = useState(false),
    [presetName, setPresetName] = useState("");
  const track = w.s.tracks.find((t) => t.id === target?.track);
  async function command(c: LibraryCommand) {
    setPending(true);
    setError("");
    try {
      const next = await api.soundLibrary(c);
      setData(next);
      if (next.session) {
        w.setS(next.session);
        w.setDirty(true);
        w.setSoundBrowser(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .soundLibrary({ op: "list" })
        .then((v) => {
          if (alive) setData(v);
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    void tick();
    const timer = setInterval(tick, 700);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  if (!target || !track) return null;
  const presets = target.presets;
  const instrument = track.kind === "midi" && !target.append;
  const plugins = (data?.plugins ?? [])
    .filter(
      (p) =>
        p.instrument === instrument &&
        `${p.name} ${p.manufacturer}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter !== "favorites" || p.favorite) &&
        (filter !== "recent" || p.recent > 0),
    )
    .sort((a, b) =>
      filter === "recent" ? b.recent - a.recent : a.name.localeCompare(b.name),
    );
  return (
    <Modal
      title={
        presets
          ? "Track presets"
          : instrument
            ? "Choose an instrument"
            : "Choose an effect"
      }
      className="sound-browser"
      onClose={() => {
        if (!pending) w.setSoundBrowser(null);
      }}
    >
      <h2>
        {presets
          ? "Track presets"
          : instrument
            ? "Choose an instrument"
            : "Choose an effect"}
      </h2>
      <p>
        {presets
          ? "Save plug-ins, their settings, EQ, volume and pan. Recordings and input routing stay with the track."
          : "Your installed VST3 plug-ins, ready to play."}
      </p>
      {presets ? (
        <div className="preset-save">
          <input
            aria-label="Preset name"
            placeholder="Name this track setup"
            maxLength={80}
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button
            disabled={pending || w.s.playing || !presetName.trim()}
            onClick={() =>
              void command({
                op: "savePreset",
                track: track.id,
                name: presetName,
              })
            }
          >
            Save current setup
          </button>
        </div>
      ) : (
        <>
          <div className="library-search">
            <Search size={16} />
            <input
              aria-label="Search plug-ins"
              placeholder="Search by name or maker"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Plug-in filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="favorites">Favorites</option>
              <option value="recent">Recent</option>
            </select>
          </div>
          <div className="library-actions">
            <button
              disabled={pending || data?.scanning}
              onClick={() => void command({ op: "scan" })}
            >
              <RefreshCw size={14} />
              Scan installed
            </button>
            <button
              disabled={pending || data?.scanning}
              onClick={() => void command({ op: "scanFolder" })}
            >
              <FolderOpen size={14} />
              Scan folder
            </button>
            <button
              disabled={pending || w.s.playing}
              onClick={async () => {
                setPending(true);
                const result = await w.task(() =>
                  api.plugin(track.id, false, target.append),
                );
                setPending(false);
                if (result) w.setSoundBrowser(null);
              }}
            >
              Browse file
            </button>
          </div>
        </>
      )}
      <div
        className="library-list"
        aria-label={presets ? "Saved track presets" : "Installed plug-ins"}
      >
        {presets && track.kind === "audio" && !!data?.starters.length && (
          <>
            <h3>Starter sounds</h3>
            {data.starters.map((p) => (
              <div className="library-item" key={p.id}>
                <button
                  disabled={pending || w.s.playing}
                  onClick={() =>
                    void command({
                      op: "applyPreset",
                      track: track.id,
                      id: p.id,
                    })
                  }
                >
                  <strong>{p.name}</strong>
                  <small>{p.hint}</small>
                </button>
              </div>
            ))}
            <h3>Your presets</h3>
          </>
        )}
        {presets
          ? (data?.presets ?? [])
              .filter((p) => p.kind === track.kind)
              .map((p) => (
                <div className="library-item" key={p.id}>
                  <button
                    disabled={pending || w.s.playing}
                    onClick={() =>
                      void command({
                        op: "applyPreset",
                        track: track.id,
                        id: p.id,
                      })
                    }
                  >
                    {p.name}
                  </button>
                  <button
                    aria-label={`Delete ${p.name}`}
                    disabled={pending}
                    onClick={async () => {
                      if (
                        await w.confirmAction(
                          `Delete preset ${p.name}?`,
                          "Delete preset",
                        )
                      )
                        void command({ op: "deletePreset", id: p.id });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
          : plugins.map((p) => (
              <div className="library-item" key={p.id}>
                <button
                  className={p.favorite ? "favorite" : ""}
                  aria-label={`Favorite ${p.name}`}
                  aria-pressed={p.favorite}
                  disabled={pending}
                  onClick={() => void command({ op: "favorite", id: p.id })}
                >
                  <Star size={15} />
                </button>
                <button
                  disabled={pending || w.s.playing}
                  onClick={() =>
                    void command({
                      op: "load",
                      track: track.id,
                      id: p.id,
                      append: target.append,
                    })
                  }
                >
                  <strong>{p.name}</strong>
                  <small>{p.manufacturer}</small>
                </button>
              </div>
            ))}
        {!presets && plugins.length === 0 && (
          <p>
            {data?.scanning
              ? "Finding your plug-ins..."
              : "No matching plug-ins. Scan installed plug-ins or browse to a VST3 file."}
          </p>
        )}
        {presets && !data?.presets.some((p) => p.kind === track.kind) && (
          <p>No presets for this track type yet. Save a setup above.</p>
        )}
      </div>
      {data?.scanning && <p role="status">Scanning {data.progress}</p>}
      {error && <p role="alert">{error}</p>}
      {!!data?.errors.length && (
        <details>
          <summary>{data.errors.length} scan issue(s)</summary>
          {data.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </details>
      )}
    </Modal>
  );
}
