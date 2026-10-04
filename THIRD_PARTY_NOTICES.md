# Third-party notices

| パッケージ | 固定バージョン | 入手先 | ライセンス / 用途 |
|---|---|---|---|
| @ruby/3.4-wasm-wasi | 2.10.1 | https://www.npmjs.com/package/@ruby/3.4-wasm-wasi | MIT（包装・JS）。Ruby 3.4.1 WASM・標準ライブラリを同梱 |
| @ruby/wasm-wasi | 2.10.1（lockfile） | https://github.com/ruby/ruby.wasm | MIT、Ruby / JavaScript間の橋渡し |
| CRuby | 3.4.1（上記WASMの実測） | https://www.ruby-lang.org/ | Ruby License / BSD-2-Clause。標準ライブラリは個別のライセンスを含む |
| @bjorn3/browser_wasi_shim | 0.4.2（lockfile） | https://github.com/bjorn3/browser_wasi_shim | MIT OR Apache-2.0、WASI互換層 |
| tslib | 2.8.1（lockfile） | https://github.com/microsoft/tslib | 0BSD、TypeScript補助ランタイム |
| Vite | 8.3.2 | https://github.com/vitejs/vite | MIT、ビルド時のみ |
| @playwright/test / playwright / playwright-core | 1.63.0 | https://github.com/microsoft/playwright | Apache-2.0、テスト時のみ |
| @axe-core/playwright / axe-core | 4.13.0 | https://github.com/dequelabs/axe-core-npm | MPL-2.0、アクセシビリティのテスト時のみ |
| Minitest（CI用） | 5.25.5 | https://github.com/minitest/minitest | MIT、Rubyテスト時のみ |

全npm依存の正確な解決結果は package-lock.json を参照してください。ランタイム配布元のLICENSEとNOTICEを改変せず public/vendorへコピーし、公開ビルドでは `vendor/LICENSE` と `vendor/NOTICE` に同梱します。CRubyおよびWASMに含まれる標準ライブラリ・WASI依存の著作権・条件はそれらの原文を参照してください。

画像、音楽、外部フォントは使用していません。図形・ロゴはこのプロジェクトのCSS / SVGで作成しています。UIはOS標準の日本語フォントを使います。

WASI shimのMIT / Apache-2.0原文とtslibのライセンスもvendor/に同梱しています。
