# LocalScribe

> Drop it. Transcribe it. Keep it local.

LocalScribe is a private, offline-first desktop transcription app for Windows and macOS. Pick or drop an audio/video file, run local speech recognition, edit the result, and save UTF-8 TXT, SRT, or VTT. There are no accounts, APIs, uploads, subscriptions, telemetry, artificial duration limits, or artificial file-size limits.

The installer contains only the Electron application. FFmpeg, ffprobe, whisper.cpp, Silero VAD, and Whisper models are downloaded by the in-app first-run wizard, checksum-verified, and stored outside the application package. Once setup is complete, transcription itself makes no network requests.

## MVP features

- Secure five-step first-run setup with host detection and resumable component/model downloads
- Multilingual Tiny, Base, Small, Medium, and Large v3 Turbo models
- Fast startup using metadata and file-size checks rather than repeated multi-gigabyte hashing
- automatic ffprobe/FFmpeg analysis and selection of the most useful audio stream; extensions are used only for the file picker
- automatic complementary-track mixing and stereo-channel recovery without exposing technical stream controls
- streamed FFmpeg conversion to 16 kHz, mono, signed 16-bit PCM WAV
- local VAD, speech-based language detection, hallucination checks, and bounded automatic recovery
- a maximum-10 batch queue with exactly one isolated whisper.cpp inference at a time
- live extraction/transcription stages, throttled progress, cancellation, and process-tree cleanup
- local segment editing with autosave, latest-10 transcript history, clipboard copy, and TXT/SRT/VTT export
- Quiet, Balanced, and Performance CPU profiles; CPU fallback and optional Metal in Auto mode
- model download, selection, deletion, and full repair/verification
- disk-space estimation before WAV extraction and safe abandoned-job cleanup
- secure Electron renderer (`contextIsolation`, sandbox, no Node integration, minimal typed preload API)

## Technology

- Electron 44
- React 19 and strict TypeScript
- electron-vite / Vite
- Tailwind CSS 4 using a small local design-token layer
- Lucide React icons
- Zod validation at IPC trust boundaries
- Electron's built-in SQLite for local transcript history; no third-party native database module
- Node streams, native `child_process.spawn`, and allowlisted streaming ZIP extraction with `yauzl`
- Vitest and ESLint
- electron-builder with NSIS, DMG, and ZIP targets

There is no Python, PyTorch, Docker, external database service, local server, backend API, or large UI framework.

## Architecture

```text
React renderer
  ↕ minimal typed preload API
Electron main process
  ├─ PathService / SettingsService / InstallationStore / HistoryStore
  ├─ DownloadManager → streamed .part → checksum → atomic rename
  ├─ RuntimeManager / ModelManager
  ├─ MediaService → FfprobeAdapter
  └─ TranscriptionQueueService → TranscriptionService / JobManager
       ├─ AudioPreparationService / FfmpegAdapter → ranked audio.wav candidates
       ├─ Silero VAD → spoken sections and language sample
       └─ WhisperCliAdapter / TranscriptQualityService → checked JSON result
                              ↓
                     canonical TranscriptResult
                       ↙       ↓       ↘
                     TXT      SRT      VTT
```

The renderer cannot invoke arbitrary paths, URLs, processes, or shell commands. It requests artifact/model IDs; the main process resolves them against internal manifests and revalidates HTTPS hosts on every redirect. Native process arguments are arrays and `shell` is always disabled, so paths containing spaces, Turkish, Russian, or shell metacharacters remain literal file names.

## Project structure

```text
src/
  main/
    adapters/       ffmpeg, ffprobe, whisper CLI knowledge
    ipc/            validated Electron IPC handlers
    manifests/      pinned runtime and model definitions
    services/       paths, downloads, settings, runtime, models, jobs, temp, processes
    utils/          atomic files, checksums, platform policy
  preload/          narrow contextBridge API
  renderer/         React pages and Midnight Ink interface
  shared/           IPC contracts, languages, transcript types/formatters
tests/              unit tests without native/model downloads
scripts/            optional runtime URL verification
```

## Runtime and model storage

All downloaded data lives under Electron's `app.getPath("userData")`, never beside the installed application:

```text
userData/
  runtime/
    ffmpeg/9.0.1/...
    whisper/openwhispr-1.0.0/...
    vad/6.2.0/...
  models/ggml-*.bin
  downloads/*.part
  temp/<job-id>/
  config/settings.json
  config/installed-components.json
  config/history.sqlite
  logs/localscribe.log
```

Settings and installation metadata use temporary-write plus atomic rename. Transcript history uses the operating system's user-only application data directory, SQLite transactions, foreign keys, and secure deletion; original media paths and media payloads are never stored in the database. Successful installation is recorded only after checksum verification, extraction, expected-file validation, executable permissions, and atomic directory finalization. Interrupted `.part` files remain resumable when the server supports HTTP Range. Retries are limited and exponential. Normal startup checks metadata, file existence, and model size; **Verify / Repair** performs full archive/model hashing only on demand.

Temporary directories are UUID-owned children of the LocalScribe temp root. Cleanup guards reject paths outside that root. Converted audio is written and read directly from disk; Electron never buffers an entire media file, model, or download.

## Pinned distributions

Runtime definitions and their exact SHA-256 values are in `src/main/manifests/runtimeManifest.ts`.

- **FFmpeg 9.0.1, Windows x64:** Gyan's Essentials ZIP. Gyan is one of the Windows binary providers linked by the official FFmpeg download page. The ZIP includes both `ffmpeg.exe` and `ffprobe.exe`.
- **FFmpeg 9.0.1, macOS Intel/Apple Silicon:** Evermeet static release ZIPs for FFmpeg and ffprobe. Evermeet is linked by the official FFmpeg download page and publishes signed static macOS builds.
- **whisper.cpp CLI, Windows x64:** the official upstream ggml-org v1.9.1 CPU release, including its required dispatch DLLs. LocalScribe does not silently fetch CUDA libraries.
- **whisper.cpp CLI, macOS:** OpenWhispr's source-visible v1.0.0 release builds provide the missing macOS CLI assets, including Metal on Apple Silicon, with GitHub-published SHA-256 digests.
- **Voice activity detection:** the official ggml-org `ggml-silero-v6.2.0.bin` model is pinned by exact size and SHA-256 and runs entirely on-device through whisper.cpp.
- **Models:** multilingual GGML model files from `ggerganov/whisper.cpp` on Hugging Face. Their exact file sizes and SHA-256 LFS/Xet object IDs are pinned. English-only `.en` variants are intentionally excluded from the standard UI.

Run `npm run runtime:verify` to perform lightweight HEAD/redirect checks of every manifest URL. It does not download model payloads. Update pins only after reviewing upstream release notes, archive layouts, sizes, and published digests (or calculating the digest of an immutable versioned archive).

## Development

Requirements: Node.js 22–24 and npm 10+. Electron 44 requires macOS 13 or later.

```bash
npm ci
npm run dev
```

For a reproducible production preview without creating an installer:

```bash
npm run build
npm start
```

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run security:audit
npm run runtime:verify
```

Development mode uses Electron's normal `userData` directory and the same manifests as production; it does not assume `process.cwd()` is an install directory. Normal unit tests do not download runtimes or models. Native end-to-end transcription requires completing the in-app setup.

## Packaging

Build the current host's configured artifacts:

```bash
npm run dist
```

Windows 10/11 x64 NSIS installer (run on Windows, or in an appropriately configured Windows CI job):

```bash
npm run dist:win
```

macOS Intel and Apple Silicon DMG/ZIP (run on macOS):

```bash
npm run dist:mac
```

Apple Silicon only (M1/M2/M3/M4 and later):

```bash
npm run dist:mac:arm64
```

The macOS packaging hook applies Electron security fuses first, then creates and verifies a complete ad-hoc bundle signature. This makes a package built on the same Mac internally consistent without a paid certificate. It does not turn the artifact into an Apple-identified or notarized public release.

Electron's application is ASAR-packed with maximum compression, production dependency pruning, and no production source maps. Runtime/model payloads are never included in the installer.

A source build can be run locally without paid certificates. An unsigned or ad-hoc-signed archive is **not** a reliable public distribution format: Gatekeeper or Windows reputation checks may block it on another computer. For public binary distribution, use electron-builder's environment variables in CI—`CSC_LINK`/`CSC_KEY_PASSWORD` for macOS and `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` for Windows. Apple notarization can use `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`, or an App Store Connect API key. Keep all certificates and secrets outside the repository. A production release pipeline should add the appropriate `afterSign` notarization hook after credentials are provisioned.

No environment variables are required for local development. `.env.example` contains names only for optional release signing; copy it to the ignored `.env` file only when you actually have those credentials. Never commit `.env`, `.npmrc`, private keys, certificates, models, downloaded runtimes, logs, or packaged artifacts.

## Adding a model

1. Add its typed ID to `ModelId` in `src/shared/types.ts`.
2. Add one multilingual definition to `modelManifest.ts` with a versioned trusted URL, exact byte size, memory guidance, and real checksum.
3. Confirm the pinned whisper runtime supports it.
4. Add recommendation/UI tests; never hard-code display sizes in React.

## Adding a runtime platform

1. Add the OS/architecture key to `SupportedPlatform` and `resolvePlatform`.
2. Add all artifacts to `runtimeManifest.ts`, including exact archive layout, companion files, byte sizes, trusted redirect hosts, and checksums.
3. Verify executability and process-tree termination on the target OS.
4. Add electron-builder architecture targets and platform tests.

## Updating FFmpeg or whisper.cpp

Pin a concrete release, not a `latest` URL. Inspect archive paths, capture upstream-published GitHub digests where available, independently verify downloaded hashes, exercise `--help` for CLI-flag compatibility, run `npm run runtime:verify`, then test fresh install, resume, repair, Unicode paths, cancellation during both native stages, and a real transcription on every affected target.

## Performance and privacy

Only one job runs at a time. Quiet uses roughly 30% of logical CPUs (maximum 6 threads), Balanced uses roughly 55% (maximum 12), and Performance uses roughly 85% (maximum 16). The model is loaded only by the whisper child process, so inference memory returns to the OS when that process exits. Progress events are capped at about four per second and diagnostic buffers are bounded. Logs rotate at about 2 MB and do not contain transcript/media content; likely personal path values are reduced to their basename.

LocalScribe accesses the network only when installing or repairing declared runtime/model artifacts. Media inspection, conversion, recognition, editing, copying, and export are entirely local.

## Troubleshooting

- **A manually deleted model shows as missing:** use Download or Repair. LocalScribe will not crash or silently trust stale metadata.
- **A download stops:** reopen LocalScribe and retry; the `.part` file is reused if the server supports Range.
- **Not enough disk space:** free the amount shown by the preflight message. Long recordings need roughly 32 KB per second plus a safety margin.
- **Runtime fails after an OS/security change:** open Settings → Runtime → Verify / Repair.
- **macOS blocks an unsigned local build:** use Finder's Open action for development. Public distribution should be Developer ID signed and notarized.
- **Windows warns about an unsigned build:** sign the production installer with an Authenticode certificate.
- **No audio track:** the file may contain video only or an unsupported/corrupt audio stream; choose another file or remux it with a supported audio codec.

## MVP boundaries and future work

The MVP intentionally omits accounts, cloud sync/transcription, payments, summarization, translation, diarization, waveforms, automatic updates, and simultaneous multi-file inference. Batch files are deliberately processed sequentially so a queue does not multiply CPU and memory pressure. The canonical segment model still leaves clear extension points for diarization, synchronized playback, click-to-seek, and translation.
