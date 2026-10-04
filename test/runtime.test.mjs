import { test } from "node:test";
import assert from "node:assert/strict";
import { RubyRuntime } from "../src/runtime.js";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
test("separate boot/calculation deadlines terminate workers; retry and request IDs work", async () => {
  const originalWorker = globalThis.Worker,
    originalDocument = globalThis.document;
  const workers = [];
  class FakeWorker {
    constructor() {
      this.requests = [];
      workers.push(this);
    }
    postMessage(m) {
      this.requests.push(m);
    }
    terminate() {
      this.terminated = true;
    }
    emit(data) {
      this.onmessage?.({ data });
    }
  }
  globalThis.Worker = FakeWorker;
  globalThis.document = { baseURI: "http://example.test/repo/" };
  const states = [];
  let runtime;
  try {
    runtime = new RubyRuntime((state) => states.push(state), {
      bootTimeout: 10,
      calculationTimeout: 10,
    });
    await sleep(30);
    assert.equal(workers[0].terminated, true);
    assert.equal(states.at(-1), "error");
    runtime.start();
    const worker = workers[1];
    worker.emit({ type: "ready", smoke: { version: "test" } });
    assert.equal(runtime.ready, true);
    const a = runtime.request({ action: "a" }),
      b = runtime.request({ action: "b" });
    const [ra, rb] = worker.requests.filter((x) => x.type === "request");
    worker.emit({ type: "result", id: rb.id, ok: true, result: "b" });
    worker.emit({ type: "result", id: ra.id, ok: true, result: "a" });
    assert.deepEqual(await Promise.all([a, b]), ["a", "b"]);
    const deadline = assert.rejects(
      runtime.request({ action: "stuck" }),
      /計算/,
    );
    await deadline;
    assert.equal(worker.terminated, true);
    assert.equal(runtime.ready, false);
    runtime.start();
    workers[2].emit({ type: "ready", smoke: { version: "new" } });
    worker.emit({ type: "boot-error", error: "stale" });
    assert.equal(runtime.ready, true);
    worker.onerror({ message: "late error from terminated worker" });
    assert.equal(runtime.ready, true);
  } finally {
    runtime?.stop();
    globalThis.Worker = originalWorker;
    globalThis.document = originalDocument;
  }
});
