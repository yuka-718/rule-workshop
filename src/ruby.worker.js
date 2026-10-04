import { DefaultRubyVM } from "@ruby/3.4-wasm-wasi/dist/browser";
import core from "../ruby/core.rb?raw";
let vm;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const response = await fetch(data.wasm);
      if (!response.ok) throw new Error(`WASM HTTP ${response.status}`);
      const module = await WebAssembly.compile(await response.arrayBuffer());
      ({ vm } = await DefaultRubyVM(module));
      // Only this author-controlled source is loaded as Ruby code.
      vm.eval(core);
      vm.eval('require "js"');
      const smoke = JSON.parse(
        vm
          .eval(
            'JSON.generate({version: RUBY_VERSION, parsed: !Ripper.sexp("1 + 2").nil?, sum: (1..9).sum})',
          )
          .toString(),
      );
      self.postMessage({ type: "ready", smoke });
    } catch (error) {
      self.postMessage({ type: "boot-error", error: String(error) });
    }
    return;
  }
  if (data.type === "request" && vm) {
    try {
      // User text crosses the boundary as a value, never as Ruby source.
      const json = vm.wrap(JSON.stringify(data.payload)).call("to_s");
      const result = vm
        .eval("RuleWorkshop::API")
        .call("handle", json)
        .toString();
      self.postMessage({ type: "result", id: data.id, ...JSON.parse(result) });
    } catch (error) {
      self.postMessage({
        type: "result",
        id: data.id,
        ok: false,
        error: `Ruby処理中にエラーが発生しました。${String(error).slice(0, 250)}`,
      });
    }
  }
};
