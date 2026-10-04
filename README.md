# ルール工房

**Rubyで小さなルールを書くと、答えがひとつのパズルになる。**

公開サイト: https://yuka-718.github.io/rule-workshop/

3×3・赤と青の2色に絞ったパズル制作アプリです。条件だけでは解が多すぎたり、逆に解がなかったりする困りごとを、全512通りの正確な探索とヒント生成で解決します。中高生Rubyプログラミングコンテスト2026への応募を想定した実装です。応募手続きは行っていません。

## 使い方

1. サンプルのRuby DSLを読み、数字や条件を書き換える。
2. **ルールを調べる**で、ルールだけの解の数と盤面例を確認する。
3. **問題を作る**で、一意解になる固定ヒントを生成する。
4. **あそぶ**でマスを埋める。赤は丸、青は四角、未入力は点。ヒントは背景と右上の印でも識別できる。
5. **共有**からURLをコピー、または問題ファイル（JSON）を保存して渡す。受け手はコードを確認してから問題を読み込む。

クリックは「未入力→赤→青」の順。色ボタンで赤・青・消去を選んでから塗ることもできます。「1手戻す」は直前の入力ややり直しを取り消します。キーボードは矢印で移動、Rで赤、Bで青、Delete / Backspace / 0で消去、Space / Enterで切り替え。固定ヒントは変更できません。エディターではTabで空白2個、Escの後にTabでエディターを出ます。Shift + Tabで前へ移動、Ctrl / Cmd + Enterで検証します。

## 1.1で改善したこと

- ルールを順に加えたときの候補数と、前回からの解数変化を表示。解0になる位置も確認できます。
- エラーの行番号と、その行への移動ボタン。
- 自作ルールをサンプルに切り替えたときに、元のルールを1件復元できます。
- 色を選んで塗る入力、直前の手やリセットの取り消し。
- 共有URLを保ったままガイドを開ける操作。長いURL用の問題ファイル入出力。
- WASMの読み込み量表示、文字のコントラスト、エディターからのキーボード移動。
- Chromium / Firefox / WebKitの回帰テストとアクセシビリティ自動検査。

## ローカル起動

Node.js 22.12以上（CIは22）、npm、通常のRuby（ローカル検証2.6.10、CIは3.4）を使用します。コアの実行に追加gemは不要です。テストにはMinitestを使用します。現在のRuby環境でMinitestが入っていない場合は `gem install minitest -v 5.25.5` を使ってください。

```sh
npm ci
npm run dev
```

表示されたlocalhostのURLを開きます。初回に約30MBのRuby WASMを読み込みます。エディターはロード中も操作できます。通常のインターネット接続とWebAssembly / Worker対応ブラウザが必要です。バックエンド、DB、APIキー、有料APIは使いません。

```sh
npm run build      # 配信対象を dist/ に作成
npm run preview    # ビルド成果物を確認
npm run test:ruby  # Rubyのモデル・DSL・探索・生成・判定
npm test           # 共有データの検証
npx playwright install chromium firefox webkit  # CI/Linux向け。macOSでは既存Chromeも利用可能
npm run test:browser             # build後に3エンジンで実行
```

このMacのPlaywright WebKitは空ページ生成でも停止するため、ローカルでは `npm run test:browser -- --project=chromium --project=firefox` で実行し、WebKitはLinuxのCIで検証します。

ブラウザテストは `/rule-workshop/` サブパスで本番ビルドを動かし、同じ `test/fixtures.json` に対する通常RubyとブラウザRubyの結果を比較します。テスト結果は [docs/verification.md](docs/verification.md) を参照してください。

## GitHub Pagesへの公開

`.github/workflows/pages.yml` がpush/PR時にRubyテスト、共有テスト、ビルド、ブラウザテストを実行します。mainへのpushと手動実行では、成功後にdistだけをPagesへ公開します。

新しいリポジトリでは Settings → Pages → Build and deployment → Source を **GitHub Actions** にしてください。workflowに `pages: write` と `id-token: write` が必要です。既存リポジトリの公開範囲は変更しません。baseは相対パスのため、別のリポジトリ名でもJS / Worker / WASMを同じサイトから読み込みます。

WASM、RubyランタイムのJavaScriptはnpmの固定バージョンからビルドに含めます。起動時に外部CDNへ接続しません。lockfileも保存しています。

## 制約と設計上の判断

- 盤面は3×3、完成状態は赤か青のみ。未入力はプレイ用の `null` で、青と混同しません。
- Ruby全機能の実行環境ではなく、Ripperで許可構文のみ解釈するDSLです。詳しくは [docs/dsl.md](docs/dsl.md)。
- ヒントを順番に外す方式で一意解を保証しますが、ヒント数の大域的な最小化は保証しません。
- 解なし、全9マスを固定する必要がある問題は生成しません。
- ルールは8,192 UTF-8バイト・24個まで。プレビューは最大12盤面。初期ロードは120秒、計算は8秒でタイムアウトします。
- localStorageには自作コードと、サンプル切り替え前のコードを1件保存します。共有URLにはバージョン、コード、ヒントのみを保存し、正解盤面は含めません。URLを知る人はルールとヒントを読めます。
- 共有URLは最大24,000文字。問題ファイルは64KB以内で、同じv / code / hints形式です。受け手の同意後にRubyで一意解を再確認します。保存済みコードも自動評価しません。
- 編集直後は以前の結果を「変更前の結果」と表示し、再検証前の生成を禁止します。生成済みの問題も破棄します。
- ログイン、ランキング、投稿一覧、対戦、生成AI連携、4×4以上は実装していません。
- この作業を開始したフォルダに既存リポジトリやAGENTS.mdはありませんでした。新しい `rule-workshop` リポジトリを作る判断をしています。

[設計](docs/architecture.md) / [DSL](docs/dsl.md) / [実演](docs/demo.md) / [AI作業記録](AI_USAGE.md) / [第三者ライセンス](THIRD_PARTY_NOTICES.md)

## 応募資料

[作品紹介原稿](docs/submission/overview.md) / [動作環境](docs/submission/environment.md) / [応募前の確認](docs/submission/checklist.md)。作品紹介PDF、スクリーンショット、ビルド済み版とソースコードを含む提出ZIPを別途作成しています。本人の判断・確認・修正の記録はAI_USAGE.mdに本人が追記します。
