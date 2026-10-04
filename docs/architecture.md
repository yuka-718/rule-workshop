# 設計

## 処理の流れ

```text
編集・共有URL確認 (main.js)
  → リクエスト番号とJSONデータ (runtime.js)
  → Web Worker (ruby.worker.js)
  → Ruby API → Parser → Puzzle / Rule → Solver → Generator
  ← JSONの結果
  ← 編集リビジョンを照合して描画
```

**Rubyがパズルの意味を決めます。** JavaScriptはDOM、キーボード、localStorage、共有URL、Workerの管理を担当し、探索や正解判定を代行しません。

## Rubyの責務

- `Board`: 常に9マスの完成盤面。`Enumerable` の `count` を利用し、行・列・隣接判定を提供。未入力はこのクラスへ渡さない。
- `Parser`: Ripperの構文木をサイズ・深さ・ノード数で制限し、構文とメソッドの許可リストを検査する。引数型・式の結果型も検査する。ユーザーが書いた文字列は実行しない。
- `Rule`: 名前と作者管理のProc。Parserが認めた演算だけをProcで組み立て、盤面ごとに評価する。
- `Puzzle`: 作品名とルールの集合。全ルールの `all?` を満たす盤面だけが解。
- `Solver`: 0〜511のビットを9つの赤青マスへ変換し、全解を `select`。ヒントの照合もRuby側で行う。
- `Generator`: `Random.new(seed)` で完成盤面を選び、9マスをランダム順に1つずつ外す。その都度、全解集合のうちヒントを満たすものが1つのときだけ採用。最後に再検証。残った各ヒントはその生成結果で取り除けないが、全候補にわたる最小ヒント数は保証しない。
- `API`: リクエスト型と盤面データを検査し、analyze / generate / restore / judge を提供。judgeはヒント矛盾、未入力、完成盤面の順で確認。

コアは通常のRubyから `require_relative` で読み込めます。ブラウザAPIへの依存はありません。Ruby2.6〜3.4共通の構文を使用し、標準ライブラリのRipper・JSONに依存します。

## Workerと非同期処理

Ruby WASMのコンパイルと起動はWorker内で行います。`vm.eval` に渡すのは作者管理のcore.rbと固定のAPI取得式のみです。入力は `vm.wrap(JSON.stringify(payload)).call('to_s')` により値として受け渡します。入力文字列をRubyソースへ連結しません。

Worker起動は120秒、各計算は8秒でタイムアウト。タイムアウト時にWorkerを終了して待機中のリクエストを破棄し、「再試行」で新しいWorkerを作成します。初期起動と計算の時間制限は別々です。計算上限8秒は入力制限の補助であり、Workerだけに安全性を依存しません。

リクエストIDは異なる応答の取り違えを防ぎます。画面側ではエディターのrevisionを検査し、編集中の古い検証・生成・共有復元結果を破棄。プレイ操作にも別のrevisionを使い、やり直し後や次の入力後に古い正解表示を出さないようにします。

## 保存・共有

localStorageは `{v:1, code}` を保存。壊れた保存データは無視し、保存できない場合はファイルバーに表示します。

共有形式は `#p=<UTF-8 JSONをbase64url化>`。JSONのキーは `v, code, hints` のみ許可します。形式検査時点ではルールを評価しません。確認ボタン後にRuby側でもヒントと解数を検査し、一意解でない共有問題は拒否します。正解盤面やseedは共有しません。

## 初期実験

UIを作る前に、ブラウザWorker内でRuby 3.4.1、Ripper.sexp、JSON、(1..9).sum = 45を実測しました。本体Workerの起動時にも同じ小さな検査を実行し、ブラウザテストで結果を検証しています。

## 公開

Viteのbaseは `./`。WorkerはViteがURLを組み立て、WASMはdocument.baseURIから同じサブパスに解決します。npmパッケージのWASMとライセンスをpublic/vendorへコピーし、distへ同梱。CDN、バックエンド、通信APIへの依存はありません。
