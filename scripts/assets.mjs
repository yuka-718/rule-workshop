import { mkdir, copyFile } from "node:fs/promises";
await mkdir("public/vendor", { recursive: true });
for (const name of ["ruby+stdlib.wasm", "LICENSE", "NOTICE"]) {
  await copyFile(
    `node_modules/@ruby/3.4-wasm-wasi/dist/${name}`,
    `public/vendor/${name}`,
  );
}
for (const [source, target] of [
  [
    "node_modules/@bjorn3/browser_wasi_shim/LICENSE-MIT",
    "browser_wasi_shim-LICENSE-MIT",
  ],
  [
    "node_modules/@bjorn3/browser_wasi_shim/LICENSE-APACHE",
    "browser_wasi_shim-LICENSE-APACHE",
  ],
  ["node_modules/tslib/LICENSE.txt", "tslib-LICENSE.txt"],
])
  await copyFile(source, `public/vendor/${target}`);
