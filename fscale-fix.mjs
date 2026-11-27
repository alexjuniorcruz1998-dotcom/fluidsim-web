import Decimal from './decimal.mjs';

// Keep the extended-precision product finite when the intermediate 2^n
// overflows/underflows f64. These hooks also cover interpreter-inlined FSCALE.
const D = Decimal.clone({ precision: 48 });
const two = new D(2);

export async function createFscaleWasm(env) {
  let exports, low = 0, pending = null, right = 0;
  const original = env.env.console_log_from_wasm;
  function readST(view, index) {
    const at = 1152 + index * 16;
    const raw = view.getUint16(at + 8, true), exponent = raw & 32767;
    if (exponent === 32767) return new D(NaN);
    const value = new D(view.getBigUint64(at, true).toString())
      .mul(two.pow((exponent || 1) - 16383 - 63));
    return raw & 32768 ? value.neg() : value;
  }
  function writeExtended(view, at, value) {
    if (!value.isFinite()) return false;
    const sign = value.isNeg() ? 32768 : 0;
    if (value.isZero()) {
      view.setBigUint64(at, 0n, true);
      view.setUint16(at + 8, sign, true);
      return true;
    }
    value = value.abs();
    let exponent = value.log(2).floor().toNumber();
    let mantissa = value.div(two.pow(exponent - 63))
      .toDecimalPlaces(0, D.ROUND_HALF_EVEN);
    if (mantissa.gte('18446744073709551616')) {
      mantissa = mantissa.div(2);
      exponent++;
    }
    // Leave unsupported extreme x87 cases to the original implementation.
    if (exponent <= -16383 || exponent >= 16384) return false;
    view.setBigUint64(at, BigInt(mantissa.toFixed(0)), true);
    view.setUint16(at + 8, sign | (exponent + 16383), true);
    return true;
  }
  env.env.console_log_from_wasm = (tag, value) => {
    if (tag === 0x6f1000) { low = value >>> 0; return; }
    if (tag === 0x6f1001) {
      const bits = new DataView(new ArrayBuffer(8));
      bits.setUint32(0, low, true);
      bits.setInt32(4, value, true);
      const exponent = bits.getFloat64(0, true);
      pending = null;
      if (!Number.isFinite(exponent) || Math.abs(exponent) <= 1023) return;
      const view = new DataView(exports.memory.buffer), index = view.getUint8(1032);
      if (readST(view, (index + 1) & 7).trunc().toNumber() === exponent) {
        pending = { index, exponent, input: readST(view, index) };
      }
      return;
    }
    if (tag === 0x6f1022) return;
    if (tag === 0x6f1023) { right = value; return; }
    if (tag === 0x6f1024) {
      if (!pending) return;
      const view = new DataView(exports.memory.buffer), p = pending;
      if (view.getUint8(1032) !== p.index || !readST(view, p.index).eq(p.input)) return;
      const exponent = view.getUint16(right + 8, true) & 32767;
      if (exponent !== 32767 && exponent !== 0) return;
      if (writeExtended(view, value, p.input.mul(two.pow(p.exponent)))) {
        exports.diag_skip.value = 1;
        pending = null;
      }
      return;
    }
    original(tag, value);
  };
  const response = await fetch(new URL('./v86-fscale.wasm', import.meta.url));
  if (!response.ok) throw new Error('Falha ao carregar o simulador: HTTP ' + response.status);
  const result = await WebAssembly.instantiate(await response.arrayBuffer(), env);
  exports = result.instance.exports;
  return exports;
}
