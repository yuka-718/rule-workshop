import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeShare, decodeShare, validateShare } from "../src/share.js";
test("UTF-8 rules and hints round trip; no answer in payload", () => {
  const code = 'puzzle "赤と青 <script>" do\nend';
  const hints = ["red", null, "blue", null, null, null, null, null, null];
  const value = decodeShare(encodeShare(code, hints));
  assert.deepEqual(value, { v: 1, code, hints });
  assert.deepEqual(Object.keys(value).sort(), ["code", "hints", "v"]);
});
test("bad, oversized, unknown version and additional fields rejected", () => {
  for (const h of [
    "#bad",
    "#p=%%%",
    "#p=e30",
    "#p=" + "a".repeat(24000),
    "#p=_w",
  ])
    assert.throws(() => decodeShare(h));
  const valid = { v: 1, code: "test", hints: Array(9).fill(null) };
  for (const patch of [
    { v: 2 },
    { code: "赤".repeat(3000) },
    { hints: ["red"] },
    { hints: Array(9).fill("green") },
    { answer: [] },
  ])
    assert.throws(() => validateShare({ ...valid, ...patch }));
});
