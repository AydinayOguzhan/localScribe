import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'node:child_process'

export interface ManagedProcess {
  child: ChildProcessWithoutNullStreams
  completed: Promise<{ code: number; signal: NodeJS.Signals | null }>
}

export class ProcessManager {
  private readonly processes = new Map<string, ChildProcessWithoutNullStreams>()

  spawn(tag: string, executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio = {}): ManagedProcess {
    if (this.processes.has(tag)) throw new Error(`Process ${tag} is already running`)
    const child = spawn(executable, [...args], {
      ...options,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32'
    })
    this.processes.set(tag, child)
    const completed = new Promise<{ code: number; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code: code ?? -1, signal }))
    }).finally(() => this.processes.delete(tag))
    return { child, completed }
  }

  async terminate(tag: string): Promise<void> {
    const child = this.processes.get(tag)
    if (!child || child.pid === undefined || child.exitCode !== null) return
    await this.terminateChild(child)
  }

  async terminateAll(): Promise<void> {
    await Promise.all([...this.processes.values()].map((child) => this.terminateChild(child)))
  }

  private async terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (!child.pid || child.exitCode !== null) return
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { shell: false, windowsHide: true })
      await new Promise<void>((resolve) => killer.once('close', () => resolve()))
      return
    }
    try { process.kill(-child.pid, 'SIGTERM') } catch { try { child.kill('SIGTERM') } catch { return } }
    await Promise.race([
      new Promise<void>((resolve) => child.once('close', () => resolve())),
      new Promise<void>((resolve) => setTimeout(() => {
        if (child.exitCode === null) {
          try { process.kill(-child.pid!, 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch { /* already stopped */ } }
        }
        resolve()
      }, 2_000))
    ])
  }
}
