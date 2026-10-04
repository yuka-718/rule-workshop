import "./style.css";
import samples from "./samples.json";
import { RubyRuntime } from "./runtime.js";
import { encodeShare, decodeShare, MAX_CODE_BYTES } from "./share.js";
const $ = (id) => document.getElementById(id);
const storageKey = "rule-workshop.draft.v1";
let revision = 0,
  busy = false,
  lastValid = null,
  puzzle = null,
  input = [],
  playRevision = 0;
let pendingImport = null,
  mode = "make",
  runtime,
  autoAnalyze = true;
const editor = $("code");
function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").className = error ? "notice error" : "notice";
  $("notice").hidden = !message;
}
function saveDraft() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ v: 1, code: editor.value }),
    );
    $("save-status").textContent = "このブラウザに保存済み";
  } catch {
    $("save-status").textContent = "保存できません（ブラウザ設定を確認）";
  }
}
function updateLines() {
  $("line-numbers").textContent = editor.value
    .split("\n")
    .map((_, i) => i + 1)
    .join("\n");
  $("byte-count").textContent =
    `${new TextEncoder().encode(editor.value).length.toLocaleString()} / 8,192 bytes`;
  $("line-numbers").scrollTop = editor.scrollTop;
}
function updateButtons() {
  const ready = !!runtime?.ready;
  $("analyze").disabled = !ready || busy || !!pendingImport;
  $("generate").disabled =
    !ready ||
    busy ||
    !!pendingImport ||
    !lastValid ||
    lastValid.revision !== revision ||
    lastValid.count === 0;
  $("accept-import").disabled = !ready || busy;
  $("reset").disabled = !puzzle || !ready;
  $("share").disabled = !puzzle;
  $("analyze").textContent = busy ? "Rubyで調べています…" : "ルールを調べる";
  document.body.classList.toggle("busy", busy);
}
function clearPuzzle() {
  puzzle = null;
  input = [];
  playRevision++;
  renderPlay();
}
function changed({ save = true } = {}) {
  revision++;
  lastValid = null;
  pendingImport = null;
  $("import-banner").hidden = true;
  $("make-content").classList.add("stale");
  $("result-state").textContent = "変更前の結果";
  $("result-state").className = "pill warning";
  clearPuzzle();
  updateLines();
  if (save) saveDraft();
  updateButtons();
}
function setCode(value, options) {
  editor.value = value;
  changed(options);
}
function setMode(value) {
  mode = value;
  document.body.classList.toggle("playing", value === "play");
  $("make-mode").classList.toggle("active", value === "make");
  $("play-mode").classList.toggle("active", value === "play");
  $("make-mode").setAttribute("aria-pressed", String(value === "make"));
  $("play-mode").setAttribute("aria-pressed", String(value === "play"));
  $("make-content").hidden = value !== "make";
  $("play-content").hidden = value !== "play";
  $("result-heading").textContent =
    value === "make" ? "答えをたしかめる" : "パズルをあそぶ";
}
function shape(color) {
  const el = document.createElement("i");
  el.className = `shape ${color}`;
  el.setAttribute("aria-hidden", "true");
  return el;
}
function showAnalysis(result) {
  $("make-content").classList.remove("stale");
  $("solution-count").textContent = result.count;
  const label =
    result.count === 0
      ? "解なし"
      : result.count === 1
        ? "1通り・一意解"
        : "複数解";
  $("result-state").textContent = label;
  $("result-state").className =
    `pill ${result.count === 0 ? "error" : "success"}`;
  $("summary-copy").textContent =
    result.count === 0
      ? "条件がぶつかっているようです。数字やルールを見直してみよう。"
      : result.count === 1
        ? "ルールだけで答えがひとつ！ ヒントなしで遊べます。"
        : "いろいろな答えが見つかりました。ヒントを付けて、ひとつに絞ろう。";
  $("previews").replaceChildren();
  $("preview-label").textContent =
    `${result.previews.length} / ${result.count} 通りを表示`;
  result.previews.forEach((cells, i) => {
    const grid = document.createElement("div");
    grid.className = "mini-board";
    grid.setAttribute("role", "img");
    grid.setAttribute(
      "aria-label",
      `盤面${i + 1}：${cells.map((c) => (c === "red" ? "赤" : "青")).join("、")}`,
    );
    cells.forEach((c) => {
      const cell = document.createElement("span");
      cell.className = "mini-cell";
      cell.append(shape(c));
      grid.append(cell);
    });
    $("previews").append(grid);
  });
  if (!result.count) {
    const el = document.createElement("div");
    el.className = "empty-preview";
    el.textContent = "このルールをすべて満たす盤面はありません。";
    $("previews").append(el);
  }
}
async function analyze() {
  const current = revision;
  busy = true;
  notice("");
  updateButtons();
  try {
    const result = await runtime.request({
      action: "analyze",
      code: editor.value,
    });
    if (current !== revision) return;
    lastValid = { ...result, revision: current };
    showAnalysis(result);
  } catch (error) {
    if (current === revision) {
      lastValid = null;
      $("make-content").classList.add("stale");
      $("result-state").textContent = "検証エラー";
      $("result-state").className = "pill error";
      notice(error.message, true);
    }
  } finally {
    busy = false;
    updateButtons();
  }
}
function installPuzzle(result, code) {
  puzzle = { ...result, code };
  input = [...result.hints];
  playRevision++;
  $("result-state").textContent = "ヒント込みで1通り";
  $("result-state").className = "pill success";
  renderPlay();
  setMode("play");
  updateButtons();
}
async function generate() {
  if (!lastValid || lastValid.revision !== revision) return;
  const current = revision,
    code = editor.value;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
  busy = true;
  notice("");
  updateButtons();
  try {
    const result = await runtime.request({ action: "generate", code, seed });
    if (current !== revision) return;
    installPuzzle(result, code);
  } catch (error) {
    if (current === revision) notice(error.message, true);
  } finally {
    busy = false;
    updateButtons();
  }
}
function renderPlay() {
  $("board").replaceChildren();
  $("board").classList.remove("cleared");
  $("puzzle-title").textContent = puzzle?.name || "まず問題を作ってみよう";
  $("puzzle-meta").textContent = puzzle
    ? `ルールだけ：${puzzle.count}通り → 固定ヒント込み：1通り ／ ヒント${puzzle.hint_count}マス`
    : "「つくる」でルールを調べて、問題を作れます。";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("button");
    cell.className = "board-cell";
    cell.dataset.index = i;
    cell.disabled = !puzzle;
    cell.addEventListener("click", () => changeCell(i));
    cell.addEventListener("keydown", (event) => {
      let next = null;
      if (event.key === "ArrowRight") next = (i + 1) % 9;
      if (event.key === "ArrowLeft") next = (i + 8) % 9;
      if (event.key === "ArrowDown") next = (i + 3) % 9;
      if (event.key === "ArrowUp") next = (i + 6) % 9;
      if (next !== null) {
        event.preventDefault();
        $("board").children[next].focus();
        return;
      }
      if (
        ["r", "R", "b", "B", "Delete", "Backspace", "0"].includes(event.key)
      ) {
        event.preventDefault();
        changeCell(
          i,
          ["r", "R"].includes(event.key)
            ? "red"
            : ["b", "B"].includes(event.key)
              ? "blue"
              : null,
        );
      }
    });
    $("board").append(cell);
  }
  $("play-rules").replaceChildren();
  puzzle?.rules.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    $("play-rules").append(li);
  });
  paintBoard();
  setJudge("マスを埋めて、すべてのルールを満たそう。");
}
function paintBoard() {
  Array.from($("board").children).forEach((cell, i) => {
    const color = input[i] ?? null,
      fixed = !!puzzle?.hints[i];
    cell.replaceChildren();
    if (color) cell.append(shape(color));
    cell.className = `board-cell${fixed ? " hint" : ""}${color ? "" : " empty"}`;
    cell.setAttribute("aria-disabled", String(fixed || !puzzle));
    cell.setAttribute(
      "aria-label",
      `${Math.floor(i / 3) + 1}行${(i % 3) + 1}列、${color === "red" ? "赤" : color === "blue" ? "青" : "未入力"}${fixed ? "、固定ヒント" : ""}`,
    );
  });
}
function setJudge(message, status = "") {
  $("judge-status").textContent = message;
  $("judge-status").className = `judge-status ${status}`;
}
async function changeCell(i, value) {
  if (!puzzle || puzzle.hints[i] !== null || !runtime.ready) return;
  input[i] =
    arguments.length === 2
      ? value
      : input[i] === null
        ? "red"
        : input[i] === "red"
          ? "blue"
          : null;
  const current = ++playRevision;
  const activePuzzle = puzzle;
  paintBoard();
  $("board").classList.remove("cleared");
  Array.from($("play-rules").children).forEach((el) => (el.className = ""));
  if (input.includes(null)) {
    setJudge(`入力中です。あと${input.filter((x) => x === null).length}マス。`);
    return;
  }
  setJudge("Rubyで答えを確認しています…");
  try {
    const result = await runtime.request({
      action: "judge",
      code: puzzle.code,
      hints: puzzle.hints,
      cells: [...input],
    });
    if (current !== playRevision || activePuzzle !== puzzle) return;
    setJudge(result.message, result.status);
    if (result.status === "correct") $("board").classList.add("cleared");
    Array.from($("play-rules").children).forEach(
      (el) =>
        (el.className = result.failed?.includes(el.textContent)
          ? "failed"
          : result.status === "correct"
            ? "passed"
            : ""),
    );
  } catch (error) {
    if (current === playRevision) setJudge(error.message, "incorrect");
  }
}
function loadSharedHash() {
  if (!location.hash || location.hash === "#guide") return;
  autoAnalyze = false;
  revision++;
  clearPuzzle();
  lastValid = null;
  try {
    const data = decodeShare(location.hash);
    setCode(data.code, { save: false });
    pendingImport = data;
    $("import-banner").hidden = false;
    $("save-status").textContent = "共有されたコード・未評価";
    $("result-state").textContent = "確認待ち";
    notice("");
    setMode("make");
  } catch (error) {
    pendingImport = null;
    notice(error.message, true);
  }
  updateButtons();
}
editor.value = samples[0].code;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (
    saved?.v === 1 &&
    typeof saved.code === "string" &&
    new TextEncoder().encode(saved.code).length <= MAX_CODE_BYTES
  ) {
    editor.value = saved.code;
    autoAnalyze = false;
    $("save-status").textContent = "保存したルールを復元しました";
    notice("前回のルールを復元しました。「ルールを調べる」で続けられます。");
  }
} catch {
  /* A damaged local draft does not prevent startup. */
}
updateLines();
renderPlay();
loadSharedHash();
editor.addEventListener("input", () => {
  changed();
  notice("");
});
editor.addEventListener("scroll", () => {
  $("line-numbers").scrollTop = editor.scrollTop;
});
editor.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    editor.setRangeText(
      "  ",
      editor.selectionStart,
      editor.selectionEnd,
      "end",
    );
    changed();
  }
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key === "Enter" &&
    !$("analyze").disabled
  ) {
    event.preventDefault();
    analyze();
  }
});
$("make-mode").addEventListener("click", () => setMode("make"));
$("play-mode").addEventListener("click", () => setMode("play"));
$("analyze").addEventListener("click", analyze);
$("generate").addEventListener("click", generate);
$("reset").addEventListener("click", () => {
  if (puzzle) {
    input = [...puzzle.hints];
    playRevision++;
    renderPlay();
  }
});
$("sample-button").addEventListener("click", () =>
  $("samples-dialog").showModal(),
);
samples.forEach((sample, i) => {
  const button = document.createElement("button");
  button.className = "sample-option";
  const number = document.createElement("span");
  number.textContent = `0${i + 1}`;
  const text = document.createElement("div"),
    title = document.createElement("strong"),
    description = document.createElement("small");
  title.textContent = sample.name;
  description.textContent = sample.description;
  text.append(title, description);
  button.append(number, text);
  button.addEventListener("click", () => {
    setCode(sample.code);
    setMode("make");
    notice("サンプルを選びました。「ルールを調べる」を押してみよう。");
    $("samples-dialog").close();
  });
  $("sample-list").append(button);
});
document
  .querySelectorAll(".close-dialog")
  .forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close()),
  );
$("share").addEventListener("click", () => {
  if (!puzzle) return;
  try {
    const url = new URL(location.href);
    url.hash = encodeShare(puzzle.code, puzzle.hints);
    $("share-url").value = url.href;
    $("copy-status").textContent = "";
    $("share-dialog").showModal();
  } catch (error) {
    notice(error.message, true);
  }
});
$("copy-link").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("share-url").value);
    $("copy-status").textContent = "コピーしました。好きな相手に届けてみよう。";
  } catch {
    $("share-url").focus();
    $("share-url").select();
    $("copy-status").textContent =
      "自動コピーできませんでした。選択したURLを手動でコピーしてください。";
  }
});
$("accept-import").addEventListener("click", async () => {
  if (!pendingImport) return;
  const current = revision,
    data = pendingImport;
  busy = true;
  notice("");
  updateButtons();
  try {
    const result = await runtime.request({
      action: "restore",
      code: data.code,
      hints: data.hints,
    });
    if (current !== revision) return;
    pendingImport = null;
    $("import-banner").hidden = true;
    $("save-status").textContent = "共有された問題";
    installPuzzle(result, data.code);
  } catch (error) {
    if (current === revision) notice(error.message, true);
  } finally {
    busy = false;
    updateButtons();
  }
});
window.addEventListener("hashchange", loadSharedHash);
$("retry").addEventListener("click", () => {
  notice("");
  runtime.start();
});
runtime = new RubyRuntime((state, data) => {
  $("runtime-dot").className = `status-dot ${state}`;
  $("retry").hidden = state !== "error";
  $("runtime-text").textContent =
    state === "ready"
      ? `Ruby ${data.version} · 準備できました`
      : state === "loading"
        ? "Rubyを読み込んでいます…（初回 約30MB）"
        : "Rubyの読み込み・実行エラー";
  if (state === "error") notice(data, true);
  updateButtons();
  if (state === "ready" && autoAnalyze && !pendingImport) {
    autoAnalyze = false;
    analyze();
  }
});
updateButtons();
