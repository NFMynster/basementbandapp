using System.Text.Json.Nodes;
using BasementBand.Audio;

namespace BasementBand.Sessions;

internal sealed class SessionService(EngineClient engine, SessionStore store)
{
    public Task<JsonObject> InitializeAsync() => engine.SendAsync(new JsonObject { ["op"] = "init", ["folder"] = store.CreateWorkingDirectory() });

    public async Task<JsonObject> ExecuteAsync(JsonObject command)
    {
        switch (command["op"]?.GetValue<string>())
        {
            case "save":
                var snapshot = await engine.SendAsync(new JsonObject { ["op"] = "snapshot" });
                var path = Path.GetFullPath(command["path"]!.GetValue<string>());
                await store.SaveAsync(snapshot, path);
                return new JsonObject { ["saved"] = path };
            case "open":
                var session = await store.LoadAsync(command["path"]!.GetValue<string>());
                return await engine.SendAsync(new JsonObject { ["op"] = "restore", ["session"] = session, ["folder"] = store.CreateWorkingDirectory() });
            case "new":
                command["folder"] = store.CreateWorkingDirectory();
                break;
        }
        return await engine.SendAsync(command);
    }
}
