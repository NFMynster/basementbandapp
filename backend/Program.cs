using System.Text.Json.Nodes;
using BasementBand.Audio;
using BasementBand.Sessions;
using BasementBand.Development;

try
{
    await using var desktop = args.Contains("--desktop") ? await DesktopHost.StartAsync() : null;
    var input = (TextReader?)desktop?.Input ?? Console.In;
    var output = (TextWriter?)desktop?.Output ?? Console.Out;
    var executable = desktop?.NativeExecutable ?? Environment.GetEnvironmentVariable("BASEMENT_NATIVE")
        ?? throw new InvalidOperationException("BASEMENT_NATIVE is required");
    var data = desktop?.DataDirectory ?? Environment.GetEnvironmentVariable("BASEMENT_DATA")
        ?? Path.Combine(Path.GetTempPath(), "BasementBand");
    await using var engine = new EngineClient(executable, Environment.GetEnvironmentVariable("BASEMENT_TEST_DEVICE") == "1");
    var service = new SessionService(engine, new SessionStore(data));
    await service.InitializeAsync();
    string? line;
    while ((line = await input.ReadLineAsync()) is not null)
    {
        JsonNode? id = null;
        try
        {
            var command = JsonNode.Parse(line)?.AsObject() ?? throw new InvalidDataException("Invalid command");
            id = command["id"]?.DeepClone();
            command.Remove("id");
            var result = await service.ExecuteAsync(command);
            await output.WriteLineAsync(new JsonObject { ["id"] = id, ["result"] = result }.ToJsonString());
        }
        catch (Exception error)
        {
            await output.WriteLineAsync(new JsonObject { ["id"] = id, ["error"] = error.Message }.ToJsonString());
        }
    }
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    System.Diagnostics.Debug.WriteLine(error.ToString());
    Environment.ExitCode = 1;
}
