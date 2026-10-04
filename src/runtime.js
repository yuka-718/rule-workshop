export class RubyRuntime {
  constructor(
    onState = () => {},
    { bootTimeout = 120000, calculationTimeout = 8000 } = {},
  ) {
    this.onState = onState;
    this.bootTimeout = bootTimeout;
    this.calculationTimeout = calculationTimeout;
    this.pending = new Map();
    this.nextId = 0;
    this.start();
  }
  start() {
    this.stop("Rubyを再起動しました。もう一度操作してください。");
    this.ready = false;
    this.onState("loading");
    const worker = new Worker(new URL("./ruby.worker.js", import.meta.url), {
      type: "module",
    });
    this.worker = worker;
    this.bootTimer = setTimeout(
      () =>
        this.fail(
          "Rubyの初期読み込みがタイムアウトしました。接続を確認して再試行してください。",
        ),
      this.bootTimeout,
    );
    worker.onmessage = ({ data }) => {
      if (this.worker !== worker) return;
      if (data.type === "ready") {
        clearTimeout(this.bootTimer);
        this.ready = true;
        this.smoke = data.smoke;
        this.onState("ready", data.smoke);
      } else if (data.type === "boot-error") {
        this.fail(
          `Rubyを読み込めませんでした。通信またはWebAssemblyの対応を確認し、再試行してください。 ${data.error}`,
        );
      } else if (data.type === "result") {
        const item = this.pending.get(data.id);
        if (!item) return;
        clearTimeout(item.timer);
        this.pending.delete(data.id);
        if (data.ok) item.resolve(data.result);
        else item.reject(new Error(data.error));
      }
    };
    worker.onerror = (event) =>
      this.fail(
        `Ruby Workerでエラーが発生しました。再試行してください。${event.message || ""}`,
      );
    worker.postMessage({
      type: "init",
      wasm: new URL("./vendor/ruby+stdlib.wasm", document.baseURI).href,
    });
  }
  request(payload) {
    if (!this.ready)
      return Promise.reject(new Error("Rubyの読み込み完了をお待ちください。"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            "計算が8秒を超えたため停止しました。ルールを短くしてRubyを再起動してください。",
          ),
        this.calculationTimeout,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ type: "request", id, payload });
    });
  }
  fail(message) {
    this.stop(message);
    this.onState("error", message);
  }
  stop(message = "処理を停止しました。") {
    this.ready = false;
    clearTimeout(this.bootTimer);
    this.worker?.terminate();
    this.worker = null;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error(message));
    }
    this.pending.clear();
  }
}
