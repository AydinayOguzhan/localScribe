import type { ArtifactDefinition, SupportedPlatform } from '../../shared/types'

export const MEDIA_VERSION = '9.0.1'
const MAC_WHISPER_VERSION = 'openwhispr-1.0.0'

const githubHosts = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']
const evermeetHosts = ['evermeet.cx', 'deolaha.ca', 'e.deolaha.ca']
const huggingFaceHosts = ['huggingface.co', 'cdn-lfs.huggingface.co', 'cas-bridge.xethub.hf.co', 'cas-server.xethub.hf.co', 'us.aws.cdn.hf.co']

const vadArtifact: ArtifactDefinition = {
  id: 'vad-silero-v6.2.0',
  version: '6.2.0',
  label: 'Silero VAD',
  description: 'Local voice activity detection model',
  url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
  allowedHosts: huggingFaceHosts,
  archiveType: 'none',
  downloadSize: 885_098,
  installedSize: 885_098,
  checksum: { algorithm: 'sha256', value: '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987' },
  expectedFiles: ['ggml-silero-v6.2.0.bin'],
  executableFiles: [],
  source: 'Official ggml-org/whisper-vad Silero v6.2 model'
}

export const runtimeManifest: Record<SupportedPlatform, ArtifactDefinition[]> = {
  'win32-x64': [
    {
      id: 'media-win32-x64',
      version: MEDIA_VERSION,
      label: 'FFmpeg + ffprobe',
      description: 'Media decoding and inspection',
      url: 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.1/ffmpeg-9.0.1-essentials_build.zip',
      allowedHosts: githubHosts,
      archiveType: 'zip',
      downloadSize: 111_253_802,
      installedSize: 220_000_000,
      checksum: { algorithm: 'sha256', value: 'fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9' },
      expectedFiles: [
        'ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe',
        'ffmpeg-9.0.1-essentials_build/bin/ffprobe.exe'
      ],
      executableFiles: [
        'ffmpeg-9.0.1-essentials_build/bin/ffmpeg.exe',
        'ffmpeg-9.0.1-essentials_build/bin/ffprobe.exe'
      ],
      source: 'Gyan FFmpeg essentials build linked from ffmpeg.org'
    },
    {
      id: 'whisper-win32-x64',
      version: '1.9.1',
      label: 'Whisper Runtime',
      description: 'Local speech recognition engine (CPU)',
      url: 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.1/whisper-bin-x64.zip',
      allowedHosts: githubHosts,
      archiveType: 'zip',
      downloadSize: 7_982_101,
      installedSize: 20_355_072,
      checksum: { algorithm: 'sha256', value: '7d8be46ecd31828e1eb7a2ecdd0d6b314feafd82163038ab6092594b0a063539' },
      expectedFiles: [
        'Release/whisper-cli.exe', 'Release/whisper.dll', 'Release/ggml.dll', 'Release/ggml-base.dll',
        'Release/ggml-cpu-x64.dll', 'Release/ggml-cpu-sse42.dll', 'Release/ggml-cpu-haswell.dll',
        'Release/ggml-cpu-alderlake.dll', 'Release/ggml-cpu-cannonlake.dll', 'Release/ggml-cpu-cascadelake.dll',
        'Release/ggml-cpu-icelake.dll', 'Release/ggml-cpu-sandybridge.dll', 'Release/ggml-cpu-skylakex.dll'
      ],
      executableFiles: ['Release/whisper-cli.exe'],
      source: 'Official ggml-org/whisper.cpp v1.9.1 CPU release'
    },
    vadArtifact
  ],
  'darwin-arm64': [
    {
      id: 'ffmpeg-darwin-arm64',
      version: MEDIA_VERSION,
      label: 'FFmpeg',
      description: 'Media decoding',
      url: 'https://evermeet.cx/ffmpeg/ffmpeg-9.0.1.zip',
      allowedHosts: evermeetHosts,
      archiveType: 'zip',
      downloadSize: 26_172_529,
      installedSize: 80_776_328,
      checksum: { algorithm: 'sha256', value: '8a8c9e549983409fe6604b9aa665648b7a5def9407fe814c39c8b2ea7f64a48f' },
      expectedFiles: ['ffmpeg'],
      executableFiles: ['ffmpeg'],
      source: 'Evermeet static macOS build linked from ffmpeg.org'
    },
    {
      id: 'ffprobe-darwin-arm64',
      version: MEDIA_VERSION,
      label: 'ffprobe',
      description: 'Media inspection',
      url: 'https://evermeet.cx/ffmpeg/ffprobe-9.0.1.zip',
      allowedHosts: evermeetHosts,
      archiveType: 'zip',
      downloadSize: 26_075_757,
      installedSize: 80_590_016,
      checksum: { algorithm: 'sha256', value: 'd13f35db03456b7f65b7edb6437c86e23810fbfe91795e571f5b77211343b4f1' },
      expectedFiles: ['ffprobe'],
      executableFiles: ['ffprobe'],
      source: 'Evermeet static macOS build linked from ffmpeg.org'
    },
    {
      id: 'whisper-darwin-arm64',
      version: MAC_WHISPER_VERSION,
      label: 'Whisper Runtime',
      description: 'Local speech recognition engine with Metal',
      url: 'https://github.com/sjoerdteunisse/whisper.cpp/releases/download/v1.0.0/whisper-cpp-darwin-arm64.zip',
      allowedHosts: githubHosts,
      archiveType: 'zip',
      downloadSize: 1_103_195,
      installedSize: 2_946_120,
      checksum: { algorithm: 'sha256', value: 'd033bd3f590cad50f39957bf86354f87b44394cb001e3f78a7b47264358103e3' },
      expectedFiles: ['whisper-cpp-darwin-arm64'],
      executableFiles: ['whisper-cpp-darwin-arm64'],
      source: 'OpenWhispr reproducible whisper.cpp CLI Metal build'
    },
    vadArtifact
  ],
  'darwin-x64': [
    {
      id: 'ffmpeg-darwin-x64',
      version: MEDIA_VERSION,
      label: 'FFmpeg',
      description: 'Media decoding',
      url: 'https://evermeet.cx/ffmpeg/ffmpeg-9.0.1.zip',
      allowedHosts: evermeetHosts,
      archiveType: 'zip',
      downloadSize: 26_172_529,
      installedSize: 80_776_328,
      checksum: { algorithm: 'sha256', value: '8a8c9e549983409fe6604b9aa665648b7a5def9407fe814c39c8b2ea7f64a48f' },
      expectedFiles: ['ffmpeg'],
      executableFiles: ['ffmpeg'],
      source: 'Evermeet static macOS Intel build linked from ffmpeg.org'
    },
    {
      id: 'ffprobe-darwin-x64',
      version: MEDIA_VERSION,
      label: 'ffprobe',
      description: 'Media inspection',
      url: 'https://evermeet.cx/ffmpeg/ffprobe-9.0.1.zip',
      allowedHosts: evermeetHosts,
      archiveType: 'zip',
      downloadSize: 26_075_757,
      installedSize: 80_590_016,
      checksum: { algorithm: 'sha256', value: 'd13f35db03456b7f65b7edb6437c86e23810fbfe91795e571f5b77211343b4f1' },
      expectedFiles: ['ffprobe'],
      executableFiles: ['ffprobe'],
      source: 'Evermeet static macOS Intel build linked from ffmpeg.org'
    },
    {
      id: 'whisper-darwin-x64',
      version: MAC_WHISPER_VERSION,
      label: 'Whisper Runtime',
      description: 'Local speech recognition engine (CPU)',
      url: 'https://github.com/sjoerdteunisse/whisper.cpp/releases/download/v1.0.0/whisper-cpp-darwin-x64.zip',
      allowedHosts: githubHosts,
      archiveType: 'zip',
      downloadSize: 1_131_934,
      installedSize: 2_701_744,
      checksum: { algorithm: 'sha256', value: 'f0f2ab6c2e92b7022ac02f0759a7a38f3ea110764e00b05a6f0d6c1dcadd571c' },
      expectedFiles: ['whisper-cpp-darwin-x64'],
      executableFiles: ['whisper-cpp-darwin-x64'],
      source: 'OpenWhispr reproducible whisper.cpp CLI build'
    },
    vadArtifact
  ]
}

export function getRuntimeArtifacts(platform: SupportedPlatform): ArtifactDefinition[] {
  return runtimeManifest[platform]
}

export function isWhisperArtifact(artifact: ArtifactDefinition): boolean {
  return artifact.id.startsWith('whisper-')
}

export function isVadArtifact(artifact: ArtifactDefinition): boolean {
  return artifact.id.startsWith('vad-')
}
