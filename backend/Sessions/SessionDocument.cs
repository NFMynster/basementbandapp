using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace BasementBand.Sessions;

/// <summary>Validate persisted values before they reach paths, UI styles or audio math.</summary>
internal static partial class SessionDocument
{
    public static void Validate(JsonObject session)
    {
        if (session["version"]?.ToString() != "1") throw new InvalidDataException("Unsupported session version");
        Text(session, "title", 100);
        Number(session, "tempo", 40, 240);
        Number(session, "loopStart", 0, double.MaxValue);
        var start = session["loopStart"]!.GetValue<double>();
        Number(session, "loopEnd", start, double.MaxValue);
        if (session["loopEnd"]!.GetValue<double>() <= start) throw new InvalidDataException("The loop must have a positive length");
        Boolean(session, "looping");
        var tracks = session["tracks"] as JsonArray ?? throw new InvalidDataException("Invalid session tracks");
        if (tracks.Count > 32) throw new InvalidDataException("This version supports up to 32 tracks");
        var ids = new HashSet<Guid>();
        foreach (var node in tracks)
        {
            var track = node as JsonObject ?? throw new InvalidDataException("Invalid track");
            Id(track, ids);
            Text(track, "name", 80);
            Text(track, "color", 7);
            if (!HexColor().IsMatch(track["color"]!.GetValue<string>())) throw new InvalidDataException("Invalid track color");
            Number(track, "input", 0, 127);
            if (track["input"]!.GetValue<double>() % 1 != 0) throw new InvalidDataException("Invalid input channel");
            Number(track, "gain", 0, 1.5);
            Number(track, "pan", -1, 1);
            foreach (var key in new[] { "armed", "mute", "solo", "bypass" }) Boolean(track, key);
            if (track["clips"] is not JsonArray clips) throw new InvalidDataException("Invalid track regions");
            foreach (var clipNode in clips)
            {
                var clip = clipNode as JsonObject ?? throw new InvalidDataException("Invalid region");
                Id(clip, ids);
                Text(clip, "name", 1024);
                Text(clip, "path", 32768);
                Number(clip, "start", 0, double.MaxValue);
            }
        }
    }

    public static IEnumerable<JsonObject> Clips(JsonObject session) =>
        session["tracks"]!.AsArray().SelectMany(track => track!["clips"]!.AsArray()).Select(clip => clip!.AsObject());

    private static void Id(JsonObject value, HashSet<Guid> ids)
    {
        if (!Guid.TryParse(value["id"]?.ToString(), out var id) || !ids.Add(id))
            throw new InvalidDataException("Session IDs must be valid and unique");
    }
    private static void Text(JsonObject value, string key, int length)
    {
        if (value[key] is not JsonValue v || !v.TryGetValue<string>(out var text) || text.Length > length)
            throw new InvalidDataException($"Invalid session field: {key}");
    }
    private static void Number(JsonObject value, string key, double min, double max)
    {
        if (value[key] is not JsonValue v || !v.TryGetValue<double>(out var number) || !double.IsFinite(number) || number < min || number > max)
            throw new InvalidDataException($"Invalid session field: {key}");
    }
    private static void Boolean(JsonObject value, string key)
    {
        if (value[key] is not JsonValue v || !v.TryGetValue<bool>(out _))
            throw new InvalidDataException($"Invalid session field: {key}");
    }
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex HexColor();
}
