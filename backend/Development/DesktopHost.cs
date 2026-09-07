using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Collections.Concurrent;

namespace BasementBand.Development;

/// <summary>
/// F5 keeps this C# process under the debugger. Electron connects back to it
/// instead of launching a second, un-debugged copy of the service.
/// </summary>
internal sealed class DesktopHost : IAsyncDisposable
{
    private readonly Process desktop;
    private readonly TcpClient connection;
    public StreamReader Input { get; }
    public StreamWriter Output { get; }
    public string NativeExecutable { get; }
    public string DataDirectory { get; }

    private DesktopHost(Process desktop, TcpClient connection, string root, string nativeExecutable)
    {
        this.desktop = desktop;
        this.connection = connection;
        Input = new StreamReader(connection.GetStream());
        Output = new StreamWriter(connection.GetStream()) { AutoFlush = true };
        NativeExecutable = nativeExecutable;
        DataDirectory = Path.Combine(root, "artifacts", "dev-sessions");
    }

    public static async Task<DesktopHost> StartAsync()
    {
        var root = FindRepository();
        if (!File.Exists(Path.Combine(root, "node_modules", "vite", "bin", "vite.js")))
            throw new InvalidOperationException("Run npm ci in the repository once, then press F5 again. See docs/BUILD.md.");
        var native = Path.Combine(root, "artifacts", "native", OperatingSystem.IsWindows() ? "BasementAudio.exe" : "BasementAudio");
        if (!File.Exists(native))
        {
            Console.WriteLine("Building the native audio engine for the first launch...");
            using var build = StartNode(root, "scripts/native.mjs");
            await build.WaitForExitAsync();
            if (build.ExitCode != 0) throw new IOException("Native build failed. See the build output and docs/BUILD.md.");
        }

        // Debug-only, loopback-only, one authenticated connection. The normal
        // packaged app still uses inherited process pipes and opens no port.
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        Process? child = null;
        var diagnostics = new ConcurrentQueue<string>();
        void Report(string line)
        {
            diagnostics.Enqueue(line);
            while (diagnostics.Count > 40) diagnostics.TryDequeue(out _);
            Console.WriteLine(line);
            Debug.WriteLine(line);
        }
        try
        {
            child = StartNode(root, "scripts/dev.mjs", new Dictionary<string, string>
            {
                ["BASEMENT_BACKEND_PORT"] = port.ToString(),
                ["BASEMENT_BACKEND_TOKEN"] = token
            }, Report);
            using var timeout = new CancellationTokenSource(Debugger.IsAttached ? Timeout.InfiniteTimeSpan : TimeSpan.FromSeconds(90));
            EventHandler exited = (_, _) => timeout.Cancel();
            child.EnableRaisingEvents = true;
            child.Exited += exited;
            try
            {
                if (child.HasExited) throw new IOException("Desktop launcher exited. Check the output above.");
                while (true)
                {
                    var socket = await listener.AcceptTcpClientAsync(timeout.Token);
                    socket.NoDelay = true;
                    // Read exactly the token bytes so no buffered reader can
                    // consume the first JSON command after the handshake.
                    var authentication = new byte[65];
                    try
                    {
                        await socket.GetStream().ReadExactlyAsync(authentication, timeout.Token);
                        var expected = System.Text.Encoding.ASCII.GetBytes(token + "\n");
                        if (!CryptographicOperations.FixedTimeEquals(authentication, expected))
                        {
                            socket.Dispose();
                            continue;
                        }
                        Console.WriteLine($"Desktop connected to C# service process {Environment.ProcessId}.");
                        return new DesktopHost(child, socket, root, native);
                    }
                    catch { socket.Dispose(); throw; }
                }
            }
            catch (OperationCanceledException error)
            {
                var reason = child.HasExited
                    ? $"Desktop launcher exited with code {child.ExitCode} before connecting."
                    : "Desktop did not connect within 90 seconds.";
                throw new IOException(reason + Environment.NewLine + string.Join(Environment.NewLine, diagnostics), error);
            }
            finally { child.Exited -= exited; }
        }
        catch
        {
            if (child is not null) { if (!child.HasExited) child.Kill(entireProcessTree: true); child.Dispose(); }
            throw;
        }
        finally { listener.Stop(); }
    }

    private static string FindRepository()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
            if (File.Exists(Path.Combine(directory.FullName, "package.json")) && Directory.Exists(Path.Combine(directory.FullName, "native")))
                return directory.FullName;
        throw new DirectoryNotFoundException("The --desktop launch mode must run from a repository build. Use the packaged app for standalone launches.");
    }

    private static Process StartNode(string root, string script, Dictionary<string, string>? environment = null, Action<string>? report = null)
    {
        var start = new ProcessStartInfo("node")
        {
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        start.ArgumentList.Add(script);
        if (environment is not null) foreach (var (key, value) in environment) start.Environment[key] = value;
        var process = Process.Start(start) ?? throw new IOException("Could not start Node.js");
        void Log(string? line) { if (line is null) return; if (report is not null) report(line); else { Console.WriteLine(line); Debug.WriteLine(line); } }
        process.OutputDataReceived += (_, e) => Log(e.Data);
        process.ErrorDataReceived += (_, e) => Log(e.Data);
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    public async ValueTask DisposeAsync()
    {
        await Output.DisposeAsync();
        Input.Dispose();
        connection.Dispose();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try { await desktop.WaitForExitAsync(timeout.Token); }
        catch (OperationCanceledException) { desktop.Kill(entireProcessTree: true); }
        finally { desktop.Dispose(); }
    }
}
