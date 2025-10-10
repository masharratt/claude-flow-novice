import * as wasm from "./wasm_regex_engine_bg.wasm";
export * from "./wasm_regex_engine_bg.js";
import { __wbg_set_wasm } from "./wasm_regex_engine_bg.js";
__wbg_set_wasm(wasm);