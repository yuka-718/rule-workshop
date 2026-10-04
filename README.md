# ルール工房

**Rubyで小さなルールを書くと、答えがひとつのパズルになる。**

公開サイト: https://yuka-718.github.io/rule-workshop/

3×3・赤と青の2色に絞ったパズル制作アプリです。条件だけでは解が多すぎたり、逆に解がなかったりする困りごとを、全512通りの正確な探索とヒント生成で解決します。中高生Rubyプログラミングコンテスト2026への応募を想定した実装です。応募手続きは行っていません。

## 使い方

1. サンプルのRuby DSLを読み、数字や条件を書き換える。
2. **ルールを調べる**で、ルールだけの解の数と盤面例を確認する。
3. **問題を作る**で、一意解になる固定ヒントを生成する。
4. **あそぶ**でマスを埋める。赤は丸、青は四角、未入力は点。ヒントは背景と右上の印でも識別できる。
5. **共有**からURLをコピーして渡す。受け手はコードを確認してから問題を読み込む。

クリックは「未入力→赤→青」の順。キーボードは矢印で移動、Rで赤、Bで青、Delete / Backspace / 0で消去、Space / Enterで切り替え。固定ヒントは変更できません。エディターではTabで空白2個、Ctrl / Cmd + Enterで検証します。

## ローカル起動

Node.js 22.12以上（CIは22）、npm、通常のRuby（ローカル検証2.6.10、CIは3.4）を使用します。Rubyの追加gemは不要です。現在のRuby環境でMinitestが入っていない場合は `gem install minitest -v 5.25.5` を使ってください。

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
npx playwright install chromium  # CI/Linux向け。macOSでは既存Chromeも利用可能
npm run test:browser             # build後に実行
```

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
- localStorageには自作コードのみを保存します。共有URLにはバージョン、コード、ヒントのみを保存し、正解盤面は含めません。URLを知る人はルールとヒントを読めます。
- 共有データは最大24,000文字。受け手の同意後にRubyで一意解を再確認します。保存済みコードも自動評価しません。
- 編集直後は以前の結果を「変更前の結果」と表示し、再検証前の生成を禁止します。生成済みの問題も破棄します。
- ログイン、ランキング、投稿一覧、対戦、生成AI連携、4×4以上は実装していません。
- この作業を開始したフォルダに既存リポジトリやAGENTS.mdはありませんでした。新しい `rule-workshop` リポジトリを作る判断をしています。

[設計](docs/architecture.md) / [DSL](docs/dsl.md) / [実演](docs/demo.md) / [AI作業記録](AI_USAGE.md) / [第三者ライセンス](THIRD_PARTY_NOTICES.md)
