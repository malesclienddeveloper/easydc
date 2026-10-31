'use strict';
const { BotError, Stop } = require('./errors');

// --- Evaluasi kondisi yang aman dari "injeksi operator" -----------------------
// Hasil fungsi dinamis (mis. $message) ditandai: karakter operator di dalamnya
// diganti karakter private-use supaya tidak bisa dibaca sebagai operator kondisi.
const OPS = ['&', '|', '=', '!', '<', '>'];
const PLACEHOLDERS = OPS.map((_, i) => String.fromCharCode(0xe000 + i));

const escapeOps = (s) => s.replace(/[&|=!<>]/g, (c) => PLACEHOLDERS[OPS.indexOf(c)]);
const unescapeOps = (s) => s.replace(/[-]/g, (c) => OPS[c.charCodeAt(0) - 0xe000]);
const isNum = (s) => /^-?\d+(\.\d+)?$/.test(s);

function compare(raw) {
  const s = raw.trim();
  const m = /^(.*?)(==|!=|>=|<=|>|<)(.*)$/s.exec(s);
  if (!m) return unescapeOps(s).trim().toLowerCase() === 'true';
  const l = unescapeOps(m[1]).trim();
  const r = unescapeOps(m[3]).trim();
  const numeric = isNum(l) && isNum(r);
  const a = numeric ? Number(l) : l;
  const b = numeric ? Number(r) : r;
  switch (m[2]) {
    case '==': return a === b;
    case '!=': return a !== b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    default: return a < b;
  }
}

/** "a==b && c>1 || d!=e" -> boolean. Tanpa kurung. Nilai kosong/lainnya = false. */
function evalCondition(str) {
  return str.split('||').some((group) => group.split('&&').every(compare));
}

class Interpreter {
  /** Jalankan daftar node, kembalikan teks hasil. */
  async run(nodes, ctx, opts = {}) {
    let out = '';
    for (const node of nodes) {
      if (node.type === 'text') { out += node.value; continue; }
      const value = node.type === 'if' ? await this._if(node, ctx) : await this._call(node, ctx);
      out += opts.cond ? escapeOps(value) : value;
    }
    return out;
  }

  async cond(nodes, ctx) {
    return evalCondition(await this.run(nodes, ctx, { cond: true }));
  }

  async _if(node, ctx) {
    for (const branch of node.branches) {
      if (branch.cond === null || (await this.cond(branch.cond, ctx))) {
        return this.run(branch.body, ctx);
      }
    }
    return '';
  }

  async _call(node, ctx) {
    const { def } = node;
    const api = {
      run: (nodes) => this.run(nodes, ctx),
      cond: (nodes) => this.cond(nodes, ctx),
    };
    try {
      let result;
      if (def.lazy) {
        result = await def.run(ctx, node.args ?? [], api);
      } else {
        const args = [];
        for (const arg of node.args ?? []) args.push(await this.run(arg, ctx));
        result = await def.run(ctx, args, api);
      }
      return result === undefined || result === null ? '' : String(result);
    } catch (e) {
      if (e instanceof Stop || (e instanceof BotError && e.fn)) throw e;
      const err = new BotError(`${def.display}: ${e.message}`, { cause: e });
      err.fn = def.display;
      throw err;
    }
  }
}

module.exports = { Interpreter, evalCondition, escapeOps, unescapeOps };
