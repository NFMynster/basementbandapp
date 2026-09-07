using System.Text.Json;
using System.Text.Json.Nodes;

namespace BasementBand.Sessions;

/// <summary>Versioned session documents and portable media; no audio-process knowledge.</summary>
internal sealed class SessionStore(string dataDirectory)
{
    private static readonly JsonSerializerOptions Formatting = new() { WriteIndented = true };

    public string CreateWorkingDirectory()
    {
        var path = Path.Combine(dataDirectory, $"{DateTime.Now:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    public async Task SaveAsync(JsonObject snapshot, string target)
    {
        snapshot["version"] = 1;
        SessionDocument.Validate(snapshot);
        target = Path.GetFullPath(target);
        var assets = target + ".audio";
        Directory.CreateDirectory(assets);
        foreach (var clip in SessionDocument.Clips(snapshot))
        {
            var source = Path.GetFullPath(clip["path"]!.GetValue<string>());
            var destination = Path.Combine(assets, clip["id"]!.GetValue<string>() + Path.GetExtension(source));
            var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
            if (!string.Equals(source, destination, comparison)) File.Copy(source, destination, overwrite: true);
            clip["path"] = Path.GetRelativePath(Path.GetDirectoryName(target)!, destination);
            clip.Remove("peaks"); // Derived from audio on load, not project state.
        }
        foreach (var key in new[] { "position", "playing", "recording", "device", "deviceError", "diskOverrun", "sampleRate", "bufferSize" }) snapshot.Remove(key);
        foreach (var node in snapshot["tracks"]!.AsArray())
        {
            var track = node!.AsObject();
            track.Remove("peak");
            track.Remove("recordStart");
        }
        var temporary = target + $".{Guid.NewGuid():N}.tmp";
        try
        {
            await File.WriteAllTextAsync(temporary, snapshot.ToJsonString(Formatting));
            File.Move(temporary, target, overwrite: true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    public async Task<JsonObject> LoadAsync(string path)
    {
        path = Path.GetFullPath(path);
        var session = JsonNode.Parse(await File.ReadAllTextAsync(path)) as JsonObject
            ?? throw new InvalidDataException("This file is not a session document");
        SessionDocument.Validate(session);
        foreach (var clip in SessionDocument.Clips(session))
        {
            var source = Path.GetFullPath(clip["path"]!.GetValue<string>(), Path.GetDirectoryName(path)!);
            if (!File.Exists(source)) throw new FileNotFoundException("Missing recording: " + source);
            clip["path"] = source;
        }
        return session;
    }
}
