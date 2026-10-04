import "./style.css";
import samples from "./samples.json";
import { RubyRuntime } from "./runtime.js";
import {
  encodeShare,
  decodeShare,
  MAX_CODE_BYTES,
} from "./share.js";
const $ = (id) => document.getElementById(id);
const storageKey = "rule-workshop.draft.v1";
const backupKey = "rule-workshop.backup.v1";
const editor = $("code");
let revision = 0,
  busy = false,
  lastValid = null,
  lastAnalysis = null,
  validationError = null;
let puzzle = null,
  input = [],
  moves = [],
  paint = "cycle",
  playRevision = 0;
let pendingImport = null,
  sharedSource = false,
  mode = "make",
  runtime,
  autoAnalyze = true,
  escapeTab = false;
let backup = readDraft(backupKey);
function validCode(code) {
  return (
    typeof code === "string" &&
    new TextEncoder().encode(code).length <= MAX_CODE_BYTES
  );
}
function readDraft(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    return data?.v === 1 && validCode(data.code) ? data.code : null;
  } catch {
    return null;
  }
}
function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").className = error ? "notice error" : "notice";
  $("notice").hidden = !message;
}
function saveDraft() {
  if (!validCode(editor.value)) {
    $("save-status").textContent = "上限超過のため保存できません";
    return;
  }
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ v: 1, code: editor.value }),
    );
    $("save-status").textContent = "このブラウザに保存済み";
  } catch {
    $("save-status").textContent = "保存できません。ブラウザ設定を確認";
  }
}
function preserveDraft() {
  if (
    !validCode(editor.value) ||
    sharedSource ||
    samples.some((s) => s.code === editor.value)
  )
    return;
  backup = editor.value;
  try {
    localStorage.setItem(backupKey, JSON.stringify({ v: 1, code: backup }));
  } catch {
    /* In-memory undo is still available. */
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
  // A pending restore/generation installs a board and enters play when done.
  // Prevent a mode click from being silently overwritten by that response.
  $("make-mode").disabled = busy;
  $("play-mode").disabled = busy;
  $("analyze").disabled = !ready || busy || !!pendingImport;
  $("generate").disabled =
    !ready ||
    busy ||
    !!pendingImport ||
    !lastValid ||
    lastValid.revision !== revision ||
    lastValid.count === 0;
  $("accept-import").disabled = !ready || busy;
  $("start-puzzle").disabled = !ready || busy || !!pendingImport;
  $("reset").disabled = !puzzle || !ready;
  $("undo-move").disabled = !puzzle || !ready || !moves.length;
  $("share").disabled = !puzzle;
  $("draft-recovery").hidden = backup === null || backup === editor.value;
  $("analyze").textContent = busy ? "Rubyで調べています…" : "ルールを調べる";
  $("make-content").setAttribute("aria-busy", String(busy));
  document.body.classList.toggle("busy", busy);
}
function updateBadge() {
  let label = "まだ調べていません",
    style = "";
  if (mode === "play" && puzzle) {
    label = "ヒント込みで1通り";
    style = "success";
  } else if (pendingImport) {
    label = "確認待ち";
  } else if (validationError) {
    label = "検証エラー";
    style = "error";
  } else if (lastValid?.revision === revision) {
    label =
      lastValid.count === 0
        ? "解なし"
        : lastValid.count === 1
          ? "1通り・一意解"
          : "複数解";
    style = lastValid.count === 0 ? "error" : "success";
  } else if (lastAnalysis) {
    label = "変更前の結果";
    style = "warning";
  }
  $("result-state").textContent = label;
  $("result-state").className = `pill ${style}`;
}
function clearError() {
  validationError = null;
  $("editor-error").hidden = true;
  editor.removeAttribute("aria-invalid");
}
function showError(error) {
  validationError = error;
  editor.setAttribute("aria-invalid", "true");
  $("editor-error").replaceChildren();
  const description = document.createElement("span");
  description.textContent = `${error.line ? `${error.line}行目：` : ""}${error.message}`;
  $("editor-error").append(description);
  if (error.line) {
    const button = document.createElement("button");
    button.className = "small-button";
    button.textContent = "エラー行へ";
    button.addEventListener("click", () => {
      const lines = editor.value.split("\n");
      const line = Math.min(error.line, lines.length) - 1;
      const start = lines
        .slice(0, line)
        .reduce((sum, s) => sum + s.length + 1, 0);
      editor.focus();
      editor.setSelectionRange(start, start + lines[line].length);
      editor.scrollTop = Math.max(0, line - 3) * 26;
    });
    $("editor-error").append(button);
  }
  $("editor-error").hidden = false;
  notice(error.message, true);
  updateBadge();
}
function clearPuzzle() {
  puzzle = null;
  input = [];
  moves = [];
  playRevision++;
  renderPlay();
}
function detachShare() {
  if (location.hash.startsWith("#p="))
    history.replaceState(null, "", location.pathname + location.search);
  sharedSource = false;
}
function changed({ save = true } = {}) {
  revision++;
  autoAnalyze = false;
  lastValid = null;
  pendingImport = null;
  clearError();
  $("import-banner").hidden = true;
  $("make-content").classList.toggle("stale", !!lastAnalysis);
  if (lastAnalysis) {
    $("count-change").textContent =
      "変更前の結果です。もう一度ルールを調べてください。";
    $("count-change").hidden = false;
  }
  clearPuzzle();
  updateLines();
  if (save) {
    detachShare();
    saveDraft();
  }
  updateBadge();
  updateButtons();
}
function setCode(value, options) {
  editor.value = value;
  changed(options);
}
function setMode(value) {
  mode = value;
  document.body.classList.toggle("playing", value === "play");
  for (const name of ["make", "play"]) {
    $(`${name}-mode`).classList.toggle("active", name === value);
    $(`${name}-mode`).setAttribute("aria-pressed", String(name === value));
  }
  $("make-content").hidden = value !== "make";
  $("play-content").hidden = value !== "play";
  $("result-heading").textContent =
    value === "make" ? "答えをたしかめる" : "パズルをあそぶ";
  updateBadge();
}
function shape(color) {
  const el = document.createElement("i");
  el.className = `shape ${color}`;
  el.setAttribute("aria-hidden", "true");
  return el;
}
function showAnalysis(result, code) {
  const previous = lastAnalysis;
  lastAnalysis = { ...result, code };
  $("make-content").classList.remove("stale");
  $("solution-count").textContent = result.count;
  $("count-change").hidden = !previous || previous.code === code;
  $("count-change").textContent = previous
    ? `前回 ${previous.count}通り → 今回 ${result.count}通り`
    : "";
  $("summary-copy").textContent =
    result.count === 0
      ? "条件がぶつかっています。下の絞り込みで、0通りになったルールを確認しよう。"
      : result.count === 1
        ? "ルールだけで答えがひとつ！ ヒントなしで遊べます。"
        : "いろいろな答えが見つかりました。ヒントを付けて、ひとつに絞ろう。";
  $("rule-insights").hidden = !result.rule_stats?.length;
  $("rule-insights").open = result.count === 0;
  $("rule-stats").replaceChildren();
  result.rule_stats?.forEach((stat) => {
    const item = document.createElement("li"),
      label = document.createElement("span"),
      count = document.createElement("strong");
    label.textContent = stat.name;
    count.textContent = `${stat.before} → ${stat.remaining}通り`;
    if (stat.before > 0 && stat.remaining === 0) item.className = "conflict";
    item.append(label, count);
    $("rule-stats").append(item);
  });
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
  updateBadge();
}
async function analyze() {
  if (busy || pendingImport || !runtime?.ready) return false;
  const current = revision,
    code = editor.value;
  busy = true;
  clearError();
  notice("");
  updateButtons();
  try {
    const result = await runtime.request({ action: "analyze", code });
    if (current !== revision) return false;
    lastValid = { ...result, revision: current };
    showAnalysis(result, code);
    return true;
  } catch (error) {
    if (current === revision) {
      lastValid = null;
      showError(error);
      $("make-content").classList.toggle("stale", !!lastAnalysis);
    }
    return false;
  } finally {
    busy = false;
    updateButtons();
  }
}
function installPuzzle(result, code) {
  puzzle = { ...result, code };
  input = [...result.hints];
  moves = [];
  playRevision++;
  selectPaint("cycle");
  renderPlay();
  setMode("play");
  updateButtons();
  const first = $("board").querySelector(".board-cell:not(.hint)");
  first?.focus({ preventScroll: true });
  if (innerWidth <= 760) $("result-heading").scrollIntoView({ block: "start" });
}
async function generate() {
  if (busy || !lastValid || lastValid.revision !== revision) return;
  const current = revision,
    code = editor.value;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
  busy = true;
  notice("");
  updateButtons();
  try {
    const result = await runtime.request({ action: "generate", code, seed });
    if (current === revision) installPuzzle(result, code);
  } catch (error) {
    if (current === revision) notice(error.message, true);
  } finally {
    busy = false;
    updateButtons();
  }
}
function renderPlay() {
  $("play-empty").hidden = !!puzzle;
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
      const offset = { ArrowRight: 1, ArrowLeft: 8, ArrowDown: 3, ArrowUp: 6 }[
        event.key
      ];
      if (offset !== undefined) {
        event.preventDefault();
        $("board").children[(i + offset) % 9].focus();
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
    cell.setAttribute(
      "aria-disabled",
      String(fixed || !puzzle || !runtime?.ready),
    );
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
function rememberMove() {
  moves.push([...input]);
  if (moves.length > 100) moves.shift();
}
async function judgeInput() {
  const current = ++playRevision,
    activePuzzle = puzzle;
  paintBoard();
  updateButtons();
  $("board").classList.remove("cleared");
  Array.from($("play-rules").children).forEach((el) => {
    el.className = "";
  });
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
    Array.from($("play-rules").children).forEach((el, i) => {
      el.className = result.results?.[i]?.passed ? "passed" : "failed";
    });
  } catch (error) {
    if (current === playRevision) setJudge(error.message, "incorrect");
  }
}
function changeCell(i, value) {
  if (!puzzle || puzzle.hints[i] !== null || !runtime.ready) return;
  const next =
    arguments.length === 2
      ? value
      : paint === "cycle"
        ? input[i] === null
          ? "red"
          : input[i] === "red"
            ? "blue"
            : null
        : paint === "empty"
          ? null
          : paint;
  if (input[i] === next) return;
  rememberMove();
  input[i] = next;
  judgeInput();
}
function selectPaint(value) {
  paint = value;
  document.querySelectorAll("[data-paint]").forEach((button) => {
    const active = button.dataset.paint === value;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
function presentImport(data) {
  document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
  preserveDraft();
  setCode(data.code, { save: false });
  pendingImport = data;
  sharedSource = true;
  $("import-banner").hidden = false;
  $("save-status").textContent = "共有されたコード・未評価";
  notice("");
  setMode("make");
  updateBadge();
  updateButtons();
}
function loadSharedHash() {
  if (!location.hash || location.hash === "#guide") {
    if (sharedSource) {
      setCode(readDraft(storageKey) ?? samples[0].code, { save: false });
      sharedSource = false;
      setMode("make");
      notice("自分のルールに戻りました。");
    }
    return;
  }
  autoAnalyze = false;
  revision++;
  pendingImport = null;
  $("import-banner").hidden = true;
  clearPuzzle();
  lastValid = null;
  try {
    presentImport(decodeShare(location.hash));
  } catch (error) {
    notice(error.message, true);
    updateBadge();
  }
  updateButtons();
}
function chooseSample(sample) {
  preserveDraft();
  setCode(sample.code);
  setMode("make");
  notice("サンプルを選びました。「ルールを調べる」を押してみよう。");
}
const saved = readDraft(storageKey);
editor.value = saved ?? samples[0].code;
if (saved !== null) {
  autoAnalyze = false;
  $("save-status").textContent = "保存したルールを復元しました";
  notice("前回のルールを復元しました。「ルールを調べる」で続けられます。");
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
  if (event.key === "Escape") {
    escapeTab = true;
    return;
  }
  if (event.key === "Tab") {
    if (escapeTab || event.shiftKey) {
      escapeTab = false;
      return;
    }
    event.preventDefault();
    editor.setRangeText(
      "  ",
      editor.selectionStart,
      editor.selectionEnd,
      "end",
    );
    changed();
  } else escapeTab = false;
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
$("start-puzzle").addEventListener("click", async () => {
  chooseSample(samples[0]);
  if (await analyze()) await generate();
});
$("reset").addEventListener("click", () => {
  if (puzzle) {
    rememberMove();
    input = [...puzzle.hints];
    judgeInput();
  }
});
$("undo-move").addEventListener("click", () => {
  if (puzzle && moves.length) {
    input = moves.pop();
    judgeInput();
  }
});
document
  .querySelectorAll("[data-paint]")
  .forEach((button) =>
    button.addEventListener("click", () => selectPaint(button.dataset.paint)),
  );
$("undo-sample").addEventListener("click", () => {
  if (backup !== null) {
    const code = backup;
    backup = null;
    try {
      localStorage.removeItem(backupKey);
    } catch {}
    setCode(code);
    setMode("make");
    notice("元のルールに戻しました。");
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
    chooseSample(sample);
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
  if (!pendingImport || busy) return;
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
    if (current === revision) showError(error);
  } finally {
    busy = false;
    updateButtons();
  }
});
window.addEventListener("hashchange", loadSharedHash);
// Scrolling to documentation must not overwrite the puzzle's hash data.
document.querySelector(".guide-link").addEventListener("click", (event) => {
  event.preventDefault();
  $("guide").focus({ preventScroll: true });
  $("guide").scrollIntoView();
});
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  $("workspace").focus();
});
$("retry").addEventListener("click", () => {
  notice("");
  runtime.start();
});
runtime = new RubyRuntime((state, data) => {
  $("runtime-dot").className = `status-dot ${state}`;
  $("retry").hidden = state !== "error";
  let message = "Rubyを読み込んでいます…（初回 約30MB）";
  if (state === "ready") message = `Ruby ${data.version} · 準備できました`;
  else if (state === "error") message = "Rubyの読み込み・実行エラー";
  else if (data?.stage === "download")
    message = `Rubyを読み込み中… ${(data.received / 1048576).toFixed(1)}MB`;
  else if (data?.stage === "compile") message = "Rubyを準備しています…";
  $("runtime-text").textContent = message;
  if (state === "error") notice(data, true);
  updateButtons();
  paintBoard();
  if (state === "ready" && autoAnalyze && !pendingImport) {
    autoAnalyze = false;
    analyze();
  }
});
updateButtons();
