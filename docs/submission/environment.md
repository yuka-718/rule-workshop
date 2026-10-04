# 動作環境と審査用の起動方法

## 公開版で確認する場合

https://yuka-718.github.io/rule-workshop/ を開いてください。

JavaScript、WebAssembly、Web Workerが有効なブラウザが必要です。初回は約30MBのRuby WASMを読み込みます。ログインやAPIキーは不要です。読み込めないときは「再試行」を押してください。構文解析とパズル計算はブラウザ内で行います。

## 同梱のビルド済み版で確認する場合

提出ZIPの `app/` がビルド済みWebアプリです。HTTPサーバーで配信してください。HTMLをファイルとして直接開く `file://` ではWorkerやfetchが制限されます。

Python 3が入っている場合、ZIPを展開したフォルダで次を実行します。

```sh
python3 -m http.server 8000
```

http://localhost:8000/app/ を開きます。WASMも同梱されており、ソースコードのビルドや外部CDNは不要です。初期ファイルを同梱しているため、ローカル配信ではインターネット接続なしでもアプリを読み込めます。共有したURLを別の端末で遊ぶには、相手もアクセスできる公開先が必要です。

## ソースコードから起動する場合

`source/` に移動し、Node.js 22.12以上とnpmを使います。

```sh
npm ci
npm run dev
```

通常のRubyからコアのテストを実行できます。CIはRuby 3.4とMinitest 5.25.5を使用しています。

```sh
gem install minitest -v 5.25.5 --no-document
npm run test:ruby
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:browser
```

## テスト環境の補足

検証したMacではPlaywrightのWebKitが空ページ生成でも停止しました。Macで同じ現象が出る場合は `npm run test:browser -- --project=chromium --project=firefox` を使用してください。LinuxのGitHub Actionsでは3つのエンジンで各14件、計42件が成功しました。実際のSafariアプリやiOS実機の動作確認とは区別しています。

## 制限

3×3・赤青の2色専用。最大24ルール、8,192 UTF-8バイト。ループ・定義・定数参照・任意呼び出しなどには非対応です。初期起動は120秒、計算は8秒でタイムアウト。保存先は利用したブラウザのlocalStorageで、ブラウザデータを消すと自作ルールも消えます。

`docs/verification.md` に実施したテストと未確認事項、`THIRD_PARTY_NOTICES.md` に使用ライブラリとライセンスを記録しています。
