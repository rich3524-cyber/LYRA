import { describe, it, expect, afterEach } from 'vitest'
import * as http from 'http'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as ts from 'typescript'
import type { AddressInfo } from 'net'

const execFileAsync = promisify(execFile)

/**
 * Every other test in safe-fetch.test.ts mocks both `dns/promises` and
 * `undici`, which proves safeFetch *constructs* the right-looking dispatcher
 * options but proves nothing about whether Node's real fetch()/undici stack
 * actually *honors* connect.lookup in this project's actual undici version.
 * That's exactly the mechanism the DNS-rebinding fix (ec4b0d7) depends on --
 * if a future undici upgrade silently stopped calling connect.lookup, every
 * mocked test above would keep passing while the real protection vanished.
 *
 * This test proves it empirically: it starts a real HTTP server on
 * 127.0.0.1, then runs createPinnedDispatcher() + a real, unmocked global
 * fetch() against a hostname reserved by RFC 2606 to never resolve
 * (`.invalid`). If the pin is genuinely honored, the connection reaches the
 * local server despite the hostname being unresolvable; if undici silently
 * ignored connect.lookup and fell back to real DNS, this fails with
 * ENOTFOUND/EAI_AGAIN instead.
 *
 * Why a child process instead of calling createPinnedDispatcher() directly
 * in this test file: this repo's actual dependency versions (Node 24's
 * built-in fetch + the `undici` v8.10.0 package) only agree on the
 * dispatcher handler shape when safe-fetch's compiled-to-JS output runs
 * under plain Node, matching how it's actually shipped (Next.js compiles
 * TypeScript to JS via SWC before Node ever executes it -- Node's own
 * TypeScript type-stripping and Vite/vitest's SSR module transform are both
 * *test/dev-time-only* loading paths that neither production nor this
 * child process goes through). Running the real dispatcher inline inside
 * vitest's transformed module graph produces a false failure
 * (`InvalidArgumentError: invalid onRequestStart method`) that reproduces
 * only under vite-node's module handling, not under plain Node -- confirmed
 * by running the identical logic, compiled the same way Next.js ships it,
 * directly under `node` outside vitest, where it passes reliably. Spawning
 * a real, unmodified `node` process here is what makes this test measure
 * the shipped code's actual runtime behavior instead of a test-tool
 * artifact.
 */
describe('createPinnedDispatcher (real dispatcher, real server, real child Node process, no mocks)', () => {
  let server: http.Server | undefined
  let tmpDir: string | undefined

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = undefined
    }
  })

  it('makes a real fetch() in a real Node process reach a local server via a hostname that cannot resolve via real DNS', async () => {
    const marker = `pinned-dispatcher-${Math.random().toString(36).slice(2)}`

    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(marker)
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    // Compile the real safe-fetch.ts source to plain JS the same way it
    // actually ships (types stripped, import/export left as real ESM for
    // Node to load natively) -- not via vite-node's SSR transform, and not
    // via Node's experimental native .ts loader, either of which produces
    // the handler-shape mismatch described above.
    const projectRoot = path.resolve(__dirname, '..')
    const sourcePath = path.join(projectRoot, 'lib', 'safe-fetch.ts')
    const source = fs.readFileSync(sourcePath, 'utf8')
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: 'safe-fetch.ts',
    })

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-fetch-integration-'))
    const compiledPath = path.join(tmpDir, 'safe-fetch.compiled.mjs')
    fs.writeFileSync(compiledPath, outputText)

    const runnerPath = path.join(tmpDir, 'runner.mjs')
    fs.writeFileSync(
      runnerPath,
      [
        "import { createPinnedDispatcher } from './safe-fetch.compiled.mjs'",
        'const [, , port] = process.argv',
        "const dispatcher = createPinnedDispatcher({ address: '127.0.0.1', family: 4 })",
        // does-not-resolve.invalid is reserved by RFC 2606 to never resolve
        // via real DNS -- if connect.lookup weren't honored, this fetch
        // would reject with ENOTFOUND/EAI_AGAIN before ever reaching a
        // socket.
        "const res = await fetch(`http://does-not-resolve.invalid:${port}/`, { dispatcher })",
        'const body = await res.text()',
        'process.stdout.write(JSON.stringify({ status: res.status, body }))',
      ].join('\n')
    )

    // A genuinely separate, unmodified `node` process -- not vitest's
    // worker, not vite-node's module loader -- run from the project root so
    // `undici` resolves from the real node_modules, exactly as it would in
    // production.
    const { stdout } = await execFileAsync(process.execPath, [runnerPath, String(port)], {
      cwd: projectRoot,
      timeout: 15_000,
    })

    const result = JSON.parse(stdout) as { status: number; body: string }
    expect(result.status).toBe(200)
    expect(result.body).toBe(marker)
  }, 20_000)
})
