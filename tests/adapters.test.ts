import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs, parseFfmpegProgress, parseVolumeDb } from '../src/main/adapters/FfmpegAdapter'
import { buildFfprobeArgs } from '../src/main/adapters/FfprobeAdapter'
import { buildWhisperArgs, parseDetectedLanguage, parseWhisperJson, parseWhisperOutput, parseWhisperProgress } from '../src/main/adapters/WhisperCliAdapter'

describe('native process adapters', () => {
  it('passes Unicode media paths as one FFmpeg argument', () => {
    const path = '/tmp/Kayıt $(touch nope) видео.mp4'
    const args = buildFfmpegArgs(path, '/tmp/audio.wav')
    expect(args).toContain(path)
    expect(args).not.toContain('shell')
    expect(args.slice(-6)).toEqual(['-f', 'wav', '-progress', 'pipe:2', '-nostats', '/tmp/audio.wav'])
  })
  it('builds ffprobe JSON metadata arguments', () => expect(buildFfprobeArgs('a b.mp3').at(-1)).toBe('a b.mp3'))
  it('parses FFmpeg microsecond progress', () => expect(parseFfmpegProgress('out_time_us=65000000')).toBe(65_000))
  it('centralizes whisper arguments and CPU fallback', () => {
    const args = buildWhisperArgs({ audioPath: 'a.wav', modelPath: 'm.bin', outputPrefix: 'out', threads: 6, language: 'tr', acceleration: 'cpu', vadModelPath: 'vad.bin' })
    expect(args).toEqual(expect.arrayContaining(['-m', 'm.bin', '-f', 'a.wav', '-t', '6', '-l', 'tr', '-ojf', '--vad', '-vm', 'vad.bin', '-ng']))
    expect(args).not.toContain('-tr')
  })
  it('parses whisper progress and canonical JSON once', () => {
    expect(parseWhisperProgress('whisper_print_progress_callback: progress =  64%')).toBe(64)
    const parsed = parseWhisperJson(JSON.stringify({ result: { language: 'tr' }, transcription: [{ timestamps: { from: '00:00:01.250', to: '00:00:03.500' }, text: ' Merhaba ' }] }), 4_000)
    expect(parsed).toEqual({ language: 'tr', durationMs: 4_000, segments: [{ startMs: 1_250, endMs: 3_500, text: 'Merhaba' }] })
  })
  it('parses acoustic diagnostics and spoken-language detection', () => {
    expect(parseVolumeDb('[Parsed_volumedetect] mean_volume: -23.4 dB', 'mean')).toBe(-23.4)
    expect(parseDetectedLanguage('whisper_lang_auto_detect_with_state: auto-detected language: ru (p = 0.923000)')).toEqual({ language: 'ru', probability: 0.923 })
  })
  it('collects token confidence without exposing it in the transcript', () => {
    const output = parseWhisperOutput(JSON.stringify({
      result: { language: 'ru' },
      transcription: [{ offsets: { from: 0, to: 1000 }, text: ' Привет ', tokens: [{ text: ' Привет', p: 0.8 }, { text: '!', p: 0.6 }] }]
    }), 1_000)
    expect(output.result.segments[0]?.text).toBe('Привет')
    expect(output.metrics).toEqual({ tokenCount: 2, averageTokenProbability: 0.7 })
  })
})
