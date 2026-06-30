'use strict';

/**
 * wa-logger-2.26.26.4.js — full TX/RX stanza logger for WA 2.26.26.4
 *
 * Runtime class names (from jadx 2.26.26.4 "renamed from" comments):
 *   X.0Ol   — BinaryNode       A00=tag(String) A01=data(byte[]) A02=children(0Ol[]) A03=attrs(0Oj[])
 *   X.0Oj   — NodeAttr         A02=key A03=value A01=jid
 *   X.1JX   — BinaryWriter     CWR(0Ol, int) = TX choke-point
 *   X.1JP   — XmlWriter        CWQ(0Ol) backup
 *   X.1Kd   — ConnManager      A02/A03 = TX-Send
 *   X.7Rx   — NodeRouter       AA0(0Ol, 5SN) = RX-Dispatch
 *   X.5SN   — RoutingContext   A09/A0E call AA0
 *   X.7mk   — RouterInterface  AA0(0Ol, 5SN)
 *
 * No enumerateLoadedClasses — would cause ANR.
 *
 * Usage:
 *   frida -U -f com.whatsapp -l wa-logger-2.26.26.4.js 2>&1 | tee wa.log
 *   frida -U com.whatsapp    -l wa-logger-2.26.26.4.js
 */

// ─── Utils ────────────────────────────────────────────────────────────────────

function ts() {
    const d = new Date();
    return ('0' + d.getHours()).slice(-2)   + ':' +
           ('0' + d.getMinutes()).slice(-2) + ':' +
           ('0' + d.getSeconds()).slice(-2) + '.' +
           ('00' + d.getMilliseconds()).slice(-3);
}

function log(tag, msg) {
    console.log('[' + ts() + '][' + tag + '] ' + msg);
}

function safe(fn, fallback) {
    try { return fn(); } catch (_) { return fallback !== undefined ? fallback : '<err>'; }
}

function jstr(o) {
    if (o === null || o === undefined) return '<null>';
    return safe(function () { return o.toString(); }, '<err>');
}

// ─── Node → XML ───────────────────────────────────────────────────────────────

function hexN(arr, n) {
    const out = [];
    try {
        const JArr = getJArr();
        const len = arr.length !== undefined ? arr.length : JArr.getLength(arr);
        const max = Math.min(len, n || 64);
        for (let i = 0; i < max; i++) {
            try {
                // Java byte[] elements via reflect.Array.getByte (signed byte → unsigned)
                const b = JArr.getByte(arr, i);
                out.push(('0' + (b & 0xff).toString(16)).slice(-2));
            } catch (_) {
                const b = arr[i];
                if (b !== undefined && b !== null) out.push(('0' + (b & 0xff).toString(16)).slice(-2));
            }
        }
        if (len > max) out.push('…(' + len + 'B)');
    } catch (_) {}
    return out.join('');
}

// Frida field access via Java reflection — bypasses Frida's method/field name ambiguity.
// X.0Ol has BOTH instance fields (A00-A03) AND static methods with the same names.
// obj.fieldName in Frida 17 returns the method wrapper, not the field value.
const _fieldCache = {};
let _JArr = null;  // java.lang.reflect.Array — lazy init inside Java context

function getJArr() {
    if (!_JArr) _JArr = Java.use('java.lang.reflect.Array');
    return _JArr;
}

// Get length of a Java array returned from Field.get() — .length is undefined in Frida 17.
function javaArrayLen(arr) {
    if (!arr) return 0;
    try { return getJArr().getLength(arr); } catch (_) { return 0; }
}

// Get element i from a Java object array returned from Field.get().
function javaArrayGet(arr, i) {
    try { return getJArr().get(arr, i); } catch (_) { return null; }
}

function fv(obj, fieldName) {
    try {
        const cls = obj.getClass();
        const clsName = cls.getName();
        const cacheKey = clsName + '#' + fieldName;

        let field = _fieldCache[cacheKey];
        if (!field) {
            let c = cls;
            while (c) {
                try {
                    field = c.getDeclaredField(fieldName);
                    field.setAccessible(true);
                    _fieldCache[cacheKey] = field;
                    break;
                } catch (_) {
                    c = c.getSuperclass();
                    if (!c || c.getName() === 'java.lang.Object') break;
                }
            }
        }
        if (!field) return null;
        return field.get(obj);
    } catch (_) { return null; }
}

// X.0Oj fields: A02=key(String) A03=value(String) A01=jid(Jid) A00=type(byte)
function attrStr(attrsRaw) {
    if (!attrsRaw) return '';
    let s = '';
    try {
        const len = javaArrayLen(attrsRaw);
        for (let i = 0; i < len; i++) {
            const a = javaArrayGet(attrsRaw, i);
            if (!a) continue;
            const key = safe(function () { return jstr(fv(a, 'A02')); }, '?');
            if (!key || key === '?' || key === '<null>') continue;
            let val = '';
            const jid = safe(function () { return fv(a, 'A01'); }, null);
            if (jid && jstr(jid) !== '<null>') {
                val = jstr(jid);
            } else {
                val = safe(function () { return jstr(fv(a, 'A03')); }, '');
            }
            s += ' ' + key + '="' + val + '"';
        }
    } catch (_) {}
    return s;
}

function nodeToXml(node, depth) {
    if (!node) return '<null/>';
    depth = depth || 0;
    if (depth > 10) return '<…/>';
    const pad = '  '.repeat(depth);

    const tag      = safe(function () { return jstr(fv(node, 'A00')); }, '?');
    const data     = safe(function () { return fv(node, 'A01'); }, null);
    const children = safe(function () { return fv(node, 'A02'); }, null);
    const attrsRaw = safe(function () { return fv(node, 'A03'); }, null);
    const attrs    = safe(function () { return attrStr(attrsRaw); }, '');

    // byte[] uses Array.getLength since reflection returns java.lang.Object even for byte[]
    const dataLen    = data ? safe(function () { return getJArr().getLength(data); }, 0) : 0;
    const childCount = javaArrayLen(children);

    if (!dataLen && !childCount) {
        return pad + '<' + tag + attrs + '/>';
    }

    let out = pad + '<' + tag + attrs + '>';

    if (dataLen > 0) {
        // Read bytes via reflect.Array.getByte and build string or hex
        const text = safe(function () {
            const JArr = getJArr();
            const chars = [];
            for (let i = 0; i < dataLen; i++) {
                const b = JArr.getByte(data, i) & 0xff;
                // Printable ASCII + tab/lf/cr only
                if (b !== 0x09 && b !== 0x0a && b !== 0x0d && (b < 0x20 || b > 0x7e)) return null;
                chars.push(String.fromCharCode(b));
            }
            return chars.join('');
        }, null);
        if (text) {
            out += text;
        } else {
            out += '[' + dataLen + 'B:' + hexN(data, 64) + ']';
        }
    }

    if (childCount > 0) {
        for (let i = 0; i < childCount; i++) {
            const child = javaArrayGet(children, i);
            if (child) out += '\n' + nodeToXml(child, depth + 1);
        }
        out += '\n' + pad;
    }

    out += '</' + tag + '>';
    return out;
}

// ─── One-shot field debug (dumps all declared fields + values of first node) ──
let _debugDone = false;
function debugNode(node) {
    if (_debugDone) return;
    _debugDone = true;
    try {
        const cls = node.getClass();
        const clsName = cls.getName();
        log('DEBUG-CLASS', clsName);
        const fields = cls.getDeclaredFields();
        for (let i = 0; i < fields.length; i++) {
            try {
                fields[i].setAccessible(true);
                const fname  = fields[i].getName();
                const ftype  = fields[i].getType().getName();
                const rawVal = fields[i].get(node);
                let vs = '<null>';
                if (rawVal !== null) {
                    if (ftype === '[B') {
                        vs = '[byte[] len=' + (rawVal.length !== undefined ? rawVal.length : javaArrayLen(rawVal)) + ']';
                    } else if (ftype.startsWith('[')) {
                        vs = '[array len=' + javaArrayLen(rawVal) + ' type=' + ftype + ']';
                    } else {
                        vs = jstr(rawVal) + ' (type=' + ftype + ')';
                    }
                }
                log('DEBUG-FIELD', fname + ' = ' + vs);
            } catch (fe) {
                log('DEBUG-FIELD-ERR', fields[i].getName() + ': ' + fe.message);
            }
        }
    } catch (e) {
        log('DEBUG-ERR', e.message);
    }
}

// ─── Hook helper ─────────────────────────────────────────────────────────────

function tryHook(label, fn) {
    try {
        fn();
        log('HOOK', label + ' ✓');
    } catch (e) {
        log('HOOK-ERR', label + ': ' + e.message);
    }
}

// ─── TX hooks ─────────────────────────────────────────────────────────────────

function hookTX() {
    // Primary: X.1JX.CWR — last step before binary encode, catches ALL TX
    tryHook('X.1JX.CWR (TX-ALL)', function () {
        const W = Java.use('X.1JX');
        W.CWR.overload('X.0Ol', 'int').implementation = function (node, prio) {
            debugNode(node);  // one-shot: dumps all fields on first call
            log('TX', nodeToXml(node, 0));
            return this.CWR(node, prio);
        };
    });

    // Backup: X.1JP.CWQ (XML writer, older builds or debug mode)
    tryHook('X.1JP.CWQ (TX-XML)', function () {
        const W = Java.use('X.1JP');
        W.CWQ.overload('X.0Ol').implementation = function (node) {
            log('TX-XML', nodeToXml(node, 0));
            return this.CWQ(node);
        };
    });

    // X.1Kd.A02 — sendNode (no ACK)
    tryHook('X.1Kd.A02 (TX-SEND)', function () {
        const Kd = Java.use('X.1Kd');
        Kd.A02.overload('X.0Ol').implementation = function (node) {
            log('TX-SEND', nodeToXml(node, 0));
            return this.A02(node);
        };
    });

    // X.1Kd.A03 — sendNode with ACK timeout
    tryHook('X.1Kd.A03 (TX-ACK)', function () {
        const Kd = Java.use('X.1Kd');
        Kd.A03.overload('X.0Ol', 'long').implementation = function (node, t) {
            log('TX-ACK', nodeToXml(node, 0));
            return this.A03(node, t);
        };
    });
}

// ─── RX hooks ─────────────────────────────────────────────────────────────────

function hookRX() {
    // X.7Rx.AA0 — main incoming node router (routes iq/message/presence/etc)
    tryHook('X.7Rx.AA0 (RX-ROUTER)', function () {
        const Rx = Java.use('X.7Rx');
        Rx.AA0.overload('X.0Ol', 'X.5SN').implementation = function (node, ctx) {
            log('RX', nodeToXml(node, 0));
            return this.AA0(node, ctx);
        };
    });

    // X.5SN.A09 — single node dispatch (traverses path then calls AA0)
    // First arg is the ROOT node being dispatched
    tryHook('X.5SN.A09 (RX-DISPATCH)', function () {
        const SN = Java.use('X.5SN');
        SN.A09.overload('X.0Ol', 'X.7mk', '[Ljava.lang.String;').implementation = function (node, handler, path) {
            const tag = safe(function () { return jstr(node.A00); }, '');
            // Only log root-level stanza tags to avoid noise from sub-node lookups
            const ROOT = { iq:1, message:1, presence:1, notification:1, call:1,
                           ib:1, receipt:1, ack:1, chatstate:1, success:1,
                           failure:1, blocklist:1, privacy:1, stream_error:1 };
            if (tag && ROOT[tag]) log('RX-ROOT:' + tag, nodeToXml(node, 0));
            return this.A09(node, handler, path);
        };
    });

    // X.5SN.A0E — multi-node dispatch
    tryHook('X.5SN.A0E (RX-MULTI)', function () {
        const SN = Java.use('X.5SN');
        SN.A0E.overload('X.0Ol', 'X.7mk', '[Ljava.lang.String;', 'long', 'long').implementation = function (node, handler, path, min, max) {
            const tag = safe(function () { return jstr(node.A00); }, '');
            const ROOT = { iq:1, message:1, presence:1, notification:1, call:1,
                           ib:1, receipt:1, ack:1, chatstate:1, success:1,
                           failure:1, blocklist:1, privacy:1 };
            if (tag && ROOT[tag]) log('RX-MULTI:' + tag, nodeToXml(node, 0));
            return this.A0E(node, handler, path, min, max);
        };
    });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Java.perform(function () {
    log('INIT', '=== wa-logger-2.26.26.4 starting ===');
    _JArr = Java.use('java.lang.reflect.Array');  // pre-init before any hooks fire
    hookTX();
    hookRX();
    log('INIT', '=== hooks installed ===');
});
