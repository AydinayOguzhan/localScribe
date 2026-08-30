import type { ModelDefinition, ModelId } from '../../shared/types'

const hosts = ['huggingface.co', 'cdn-lfs.huggingface.co', 'cas-bridge.xethub.hf.co', 'cas-server.xethub.hf.co', 'us.aws.cdn.hf.co']
const baseUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

export const modelManifest: Record<ModelId, ModelDefinition> = {
  tiny: {
    id: 'tiny', name: 'Tiny', description: 'Best for quick drafts on low-memory devices',
    url: `${baseUrl}/ggml-tiny.bin`, allowedHosts: hosts, fileName: 'ggml-tiny.bin',
    downloadSize: 77_691_713, memoryBytes: 390_000_000, speed: 'Fastest', quality: 'Basic',
    checksum: { algorithm: 'sha256', value: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21' }
  },
  base: {
    id: 'base', name: 'Base', description: 'Fast transcription for everyday recordings',
    url: `${baseUrl}/ggml-base.bin`, allowedHosts: hosts, fileName: 'ggml-base.bin',
    downloadSize: 147_951_465, memoryBytes: 500_000_000, speed: 'Very fast', quality: 'Good',
    checksum: { algorithm: 'sha256', value: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe' }
  },
  small: {
    id: 'small', name: 'Small', description: 'Great balance of accuracy and speed',
    url: `${baseUrl}/ggml-small.bin`, allowedHosts: hosts, fileName: 'ggml-small.bin',
    downloadSize: 487_601_967, memoryBytes: 1_000_000_000, speed: 'Fast', quality: 'Very good', recommended: true,
    checksum: { algorithm: 'sha256', value: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b' }
  },
  medium: {
    id: 'medium', name: 'Medium', description: 'Higher accuracy for challenging recordings',
    url: `${baseUrl}/ggml-medium.bin`, allowedHosts: hosts, fileName: 'ggml-medium.bin',
    downloadSize: 1_533_763_059, memoryBytes: 2_600_000_000, speed: 'Slower', quality: 'Excellent',
    checksum: { algorithm: 'sha256', value: '6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208' }
  },
  'large-v3-turbo': {
    id: 'large-v3-turbo', name: 'Large v3 Turbo', description: 'Top-tier multilingual quality for powerful computers',
    url: `${baseUrl}/ggml-large-v3-turbo.bin`, allowedHosts: hosts, fileName: 'ggml-large-v3-turbo.bin',
    downloadSize: 1_624_555_275, memoryBytes: 2_700_000_000, speed: 'Moderate', quality: 'Best',
    checksum: { algorithm: 'sha256', value: '1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69' }
  }
}

export const modelList = Object.values(modelManifest)

export function recommendModel(totalMemoryBytes: number): ModelId {
  const gib = totalMemoryBytes / 1024 ** 3
  if (gib < 6) return 'base'
  if (gib >= 24) return 'medium'
  return 'small'
}
