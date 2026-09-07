using System.Diagnostics;
using System.Text.Json.Nodes;

namespace BasementBand.Audio;

/// <summary>Serial control channel to JUCE. Audio never crosses this boundary.</summary>
internal sealed class EngineClient : IAsyncDisposable
{
    private const string ResponsePrefix = "BASEMENT:";
    private readonly Process process;
    private readonly SemaphoreSlim requests = new(1, 1);
    private Exception? failure;

    public EngineClient(string executable, bool testDevice)
    {
        var start = new ProcessStartInfo(executable)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        if (testDevice) start.ArgumentList.Add("--test-device");
        process = Process.Start(start) ?? throw new IOException("Cannot launch the audio engine");
        process.ErrorDataReceived += (_, e) => { if (e.Data is not null) Console.Error.WriteLine(e.Data); };
        process.BeginErrorReadLine();
    }

    public async Task<JsonObject> SendAsync(JsonObject command)
    {
        await requests.WaitAsync();
        try
        {
            if (failure is not null) throw new IOException("The audio engine is unavailable. Restart the app.", failure);
            var deadline = command["op"]?.GetValue<string>() == "export" ? TimeSpan.FromMinutes(30) : TimeSpan.FromSeconds(45);
            using var timeout = new CancellationTokenSource(Debugger.IsAttached ? Timeout.InfiniteTimeSpan : deadline);
            JsonObject reply;
            try
            {
                await process.StandardInput.WriteLineAsync(command.ToJsonString().AsMemory(), timeout.Token);
                await process.StandardInput.FlushAsync(timeout.Token);
                while (true)
                {
                    var line = await process.StandardOutput.ReadLineAsync(timeout.Token)
                        ?? throw new IOException("The audio engine exited. Restart the app.");
                    // A plugin may log to stdout. Only framed engine responses are protocol data.
                    if (!line.StartsWith(ResponsePrefix, StringComparison.Ordinal))
                    {
                        Console.Error.WriteLine(line);
                        continue;
                    }
                    reply = JsonNode.Parse(line[ResponsePrefix.Length..])?.AsObject()
                        ?? throw new InvalidDataException("Invalid audio-engine response");
                    break;
                }
            }
            catch (Exception e) when (e is OperationCanceledException or IOException or System.Text.Json.JsonException)
            {
                // Once a request times out, late replies must never be assigned to another command.
                failure = e;
                throw new IOException("Audio communication failed. Restart the app before continuing.", e);
            }
            if (reply["error"] is JsonNode error) throw new InvalidOperationException(error.ToString());
            return reply;
        }
        finally { requests.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            process.StandardInput.Close();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            try { await process.WaitForExitAsync(timeout.Token); }
            catch (OperationCanceledException) { process.Kill(entireProcessTree: true); }
        }
        finally { process.Dispose(); requests.Dispose(); }
    }
}
