import { describe, it, expect, afterEach } from 'vitest'
import * as http from 'http'
import type { AddressInfo } from 'net'
import { fetch as undiciFetch } from 'undici'
import { createPinnedDispatcher } from './safe-fetch'

/**
 * Every other test in safe-fetch.test.ts mocks both `dns/promises` and
 * `undici`, which proves safeFetch *constructs* the right-looking dispatcher
 * options but proves nothing about whether Node's real fetch()/undici stack
 * actually *honors* connect.lookup in this project's actual undici version.
 * That's exactly the mechanism the DNS-rebinding fix (ec4b0d7) depends on --
 * if a future undici upgrade silently stopped calling connect.lookup, every
 * mocked test above would keep passing while the real protection vanished.
 *
 * This test proves it empirically, entirely in-process, with no mocks: it
 * starts a real HTTP server on 127.0.0.1, then calls the real
 * createPinnedDispatcher() together with undici's own real, unmocked
 * `fetch` against a hostname reserved by RFC 2606 to never resolve
 * (`.invalid`). If the pin is genuinely honored, the connection reaches the
 * local server despite the hostname being unresolvable; if undici silently
 * ignored connect.lookup and fell back to real DNS, this fails with
 * ENOTFOUND/EAI_AGAIN instead.
 *
 * Why undici's own `fetch` and not Node's global `fetch`: this is not just
 * a style choice, it's what safeFetch() itself now does (see the comment on
 * safeFetch in safe-fetch.ts). Node's global fetch is powered by a
 * separately vendored, Node-version-pinned copy of undici bundled into Node
 * core -- a *different* copy than the `undici` package installed in
 * node_modules -- and the two are not guaranteed to agree on the
 * Dispatcher/Handler protocol a custom `dispatcher: Agent` must implement.
 * This was empirically confirmed while writing this test, the hard way:
 * passing an Agent built from the npm `undici` package as `dispatcher` to
 * Node's global fetch throws `InvalidArgumentError: invalid onRequestStart
 * method` (UND_ERR_INVALID_ARG) on this project's actual pinned undici
 * version -- reproducible from a plain, unmodified `node` process with no
 * test framework involved at all, i.e. a real bug, not a test-tool
 * artifact. (An earlier version of this test wrongly concluded the failure
 * was specific to vitest's module transform, because it happened to compile
 * into a scratch directory with no project `node_modules` ancestor and
 * silently picked up an unrelated, stray `undici` elsewhere on the
 * filesystem instead of this project's pinned copy -- once corrected to
 * resolve the actual pinned `undici`, the failure reproduced identically
 * under plain Node, which is what led to fixing safeFetch() to use undici's
 * own fetch instead of Node's global one.) Using undici's own fetch here --
 * matching the fix -- is what makes this test pass, and is also why a
 * separate child-process/compile step turned out to be unnecessary: once
 * dispatcher and fetch come from the same undici instance, the real
 * mechanism works correctly called directly, in-process, under vitest.
 */
describe('createPinnedDispatcher + undici fetch (real dispatcher, real server, real undici, no mocks)', () => {
  let server: http.Server | undefined

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  })

  it('makes a real fetch() reach a local server via a hostname that cannot resolve via real DNS', async () => {
    const marker = `pinned-dispatcher-${Math.random().toString(36).slice(2)}`

    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(marker)
    })
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port

    const dispatcher = createPinnedDispatcher({ address: '127.0.0.1', family: 4 })

    // does-not-resolve.invalid is reserved by RFC 2606 to never resolve via
    // real DNS -- if connect.lookup weren't honored, this fetch would
    // reject with ENOTFOUND/EAI_AGAIN before ever reaching a socket.
    const res = await undiciFetch(`http://does-not-resolve.invalid:${port}/`, {
      dispatcher,
    } as never)

    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toBe(marker)
  })
})
