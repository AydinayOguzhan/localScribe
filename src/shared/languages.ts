import type { LanguageId } from './types'

export const languages: ReadonlyArray<{ id: LanguageId; name: string }> = [
  { id: 'auto', name: 'Auto Detect' },
  { id: 'tr', name: 'Turkish' },
  { id: 'en', name: 'English' },
  { id: 'ru', name: 'Russian' },
  { id: 'de', name: 'German' },
  { id: 'fr', name: 'French' },
  { id: 'es', name: 'Spanish' },
  { id: 'it', name: 'Italian' },
  { id: 'pt', name: 'Portuguese' },
  { id: 'pl', name: 'Polish' },
  { id: 'uk', name: 'Ukrainian' },
  { id: 'nl', name: 'Dutch' },
  { id: 'ja', name: 'Japanese' },
  { id: 'ko', name: 'Korean' },
  { id: 'zh', name: 'Chinese' },
  { id: 'ar', name: 'Arabic' },
  { id: 'hi', name: 'Hindi' }
]
