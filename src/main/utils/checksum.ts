import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { Checksum } from '../../shared/types'

export async function calculateChecksum(path: string, algorithm: Checksum['algorithm']): Promise<string> {
  const hash = createHash(algorithm)
  const input = createReadStream(path)
  for await (const chunk of input) hash.update(chunk)
  return hash.digest('hex')
}

export async function verifyChecksum(path: string, expected: Checksum): Promise<boolean> {
  return (await calculateChecksum(path, expected.algorithm)).toLowerCase() === expected.value.toLowerCase()
}
