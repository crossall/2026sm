/*
 * app.js — 화면과 사용자 조작을 담당합니다.
 * 계산은 전부 assets/ks-core.js 의 KS 객체가 맡습니다.
 *
 * 구조
 *   S              현재 입력 상태 (구성요소·선수관계·문항·응답)
 *   render*()      S 를 화면에 그리는 함수들
 *   save()/load()  브라우저 저장소에 남기고 되살리기
 *   아래쪽         링크 공유 · 파일 저장 · PNG 내보내기 · 인쇄
 */
"use strict";

var CODES = KS.CODES;
var STORAGE_KEY = "ks-calc-v1";

/* ── 분수 나눗셈 예시 (처음 열었을 때 보이는 값) ─────────────── */
var EXAMPLE = {
  kc: ["분수의 의미를 알고 두 분수의 크기를 비교할 수 있다",
       "분수에 자연수를 곱한 값을 구할 수 있다",
       "분수를 자연수로 나눈 값을 구할 수 있다",
       "어떤 수의 역수를 구할 수 있다",
       "분수를 분수로 나누는 절차를 수행할 수 있다",
       "나눗셈을 포함제로 해석해 문제 상황에 적용할 수 있다"],
  //      A  B  C  D      E(=B·C·D)  F(=E)
  pre: [0, 1, 1, 1, 0b1110, 0b10000],
  items: [["3/4과 2/3 중 어느 것이 큰가", 0b1],
          ["2/3 × 4 = ?", 0b11],
          ["3/4 ÷ 2 = ?", 0b101],
          ["5/6의 역수는?", 0b1001],
          ["3/4 ÷ 2/3 = ?", 0b11111],
          ["리본 6m를 2/3m씩 자르면 몇 도막인가", 0b110001],
          ["÷1/3이 ×3과 같은 이유를 설명하시오", 0b111000],
          ["2/5 ÷ 3 = ?", 0b101]],
  resp: ["O", "O", "X", "O", "X", "O", "O", "O"]
};

var S = { kc: [], pre: [], items: [], resp: [], sel: null };

/* ── 작은 도우미들 ───────────────────────────────────────────── */
function $(sel) { return document.querySelector(sel); }
function el(tag, cls, text) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function toast(msg) {
  var t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove("on"); }, 2400);
}
function snapshot() { return { kc: S.kc, pre: S.pre, items: S.items, resp: S.resp }; }
function adopt(d) {
  if (!d || !Array.isArray(d.kc) || !d.kc.length) return false;
  S.kc = d.kc.slice();
  S.pre = (d.pre || []).slice();
  while (S.pre.length < S.kc.length) S.pre.push(0);
  S.items = (d.items || []).map(function (x) { return [x[0], x[1]]; });
  S.resp = (d.resp || []).slice();
  while (S.resp.length < S.items.length) S.resp.push("");
  S.sel = null;
  return true;
}
function loadExample() { adopt(EXAMPLE); save(); renderAll(); }
function clearAll() {
  S.kc = ["", "", "", "", ""];
  S.pre = [0, 0, 0, 0, 0];
  S.items = Array.from({ length: 6 }, function () { return ["", 0]; });
  S.resp = Array(6).fill("");
  S.sel = null;
  save(); renderAll();
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot())); } catch (e) { /* 저장 못 해도 계속 씁니다 */ }
}
function restore() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return adopt(JSON.parse(raw));
  } catch (e) {}
  return false;
}
function model() { return KS.compute(S.kc, S.pre); }
function activeMask() { return model().activeMask; }

/* ══════════════ 1번 탭 · 지식 구조 ══════════════ */

function renderKC() {
  var box = $("#kcList");
  box.innerHTML = "";
  S.kc.forEach(function (text, i) {
    var row = el("div", "kcrow");
    row.appendChild(el("span", "code", CODES[i]));

    var input = el("input");
    input.value = text;
    input.placeholder = "예: 분수의 크기를 비교할 수 있다";
    input.setAttribute("aria-label", CODES[i] + " 지식 구성요소");
    input.oninput = function (e) {
      S.kc[i] = e.target.value;
      save(); renderOutputs(); renderMatrix(); renderQ();
    };
    row.appendChild(input);

    var del = el("button", "del", "×");
    del.title = "삭제";
    del.setAttribute("aria-label", CODES[i] + " 삭제");
    del.onclick = function () { removeKC(i); };
    row.appendChild(del);
    box.appendChild(row);
  });
  $("#btnAddKC").style.display = S.kc.length >= 8 ? "none" : "";
}

/** i번째 구성요소를 지우고, 뒤쪽 비트를 한 칸씩 당깁니다. */
function shiftMask(mask, removed, total) {
  var out = 0, bit = 0;
  for (var k = 0; k < total; k++) {
    if (k === removed) continue;
    if (mask >> k & 1) out |= 1 << bit;
    bit++;
  }
  return out;
}
function removeKC(i) {
  if (S.kc.length <= 2) { toast("구성요소는 두 개 이상 있어야 합니다."); return; }
  var total = S.kc.length;
  S.kc.splice(i, 1);
  S.pre.splice(i, 1);
  S.pre = S.pre.map(function (p) { return shiftMask(p, i, total); });
  S.items = S.items.map(function (it) { return [it[0], shiftMask(it[1], i, total)]; });
  S.sel = null;
  save(); renderAll();
}

function renderMatrix() {
  var t = $("#mtx");
  t.innerHTML = "";
  var head = el("tr");
  head.appendChild(el("th", "rh", "이것을 배우려면 ↓"));
  S.kc.forEach(function (_, j) { head.appendChild(el("th", null, CODES[j])); });
  t.appendChild(head);

  S.kc.forEach(function (name, i) {
    var row = el("tr");
    var th = el("th", "rh", CODES[i] + (name.trim() ? "" : " (비어 있음)"));
    th.title = name || "";
    row.appendChild(th);

    S.kc.forEach(function (_, j) {
      var td = el("td");
      var btn = el("button", "cellbtn");
      if (i === j) {
        btn.disabled = true;
        btn.textContent = "–";                    // 자기 자신은 선수가 될 수 없습니다
      } else {
        var on = !!(S.pre[i] >> j & 1);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.textContent = on ? "●" : "";
        btn.setAttribute("aria-label", CODES[i] + "를 배우려면 " + CODES[j] + "가 필요");
        btn.onclick = function () {
          S.pre[i] ^= (1 << j);                   // 켜져 있으면 끄고, 꺼져 있으면 켭니다
          S.sel = null; save(); renderMatrix(); renderOutputs();
        };
      }
      td.appendChild(btn);
      row.appendChild(td);
    });
    t.appendChild(row);
  });
}

function renderStats(M) {
  var box = $("#stats");
  box.innerHTML = "";
  [["지식 구성요소", M.active.length, "개", "dim"],
   ["제약이 없다면", M.totalCombinations.toLocaleString(), "가지", "dim"],
   ["실제 가능한 상태", M.states.length.toLocaleString(), "가지", "hi"],
   ["학습 경로", M.totalPaths.toLocaleString(), "가지", "dim"]
  ].forEach(function (row) {
    var d = el("div", "stat " + row[3]);
    d.appendChild(el("div", "k", row[0]));
    var v = el("div", "v", String(row[1]));
    v.appendChild(el("span", "u", row[2]));
    d.appendChild(v);
    box.appendChild(d);
  });
}

function renderNotices(M) {
  var box = $("#notices");
  box.innerHTML = "";
  function add(cls, icon, html) {
    var d = el("div", "notice " + cls);
    d.appendChild(el("span", "ic", icon));
    var s = el("span"); s.innerHTML = html;
    d.appendChild(s); box.appendChild(d);
  }
  var k = M.active.length, all = M.totalCombinations, real = M.states.length;
  if (k === 0) { add("", "※", "왼쪽에 지식 구성요소를 적으면 여기부터 계산이 시작됩니다."); return; }
  if (M.unreachable.length) {
    add("warn", "!", "<b>" + M.unreachable.map(function (i) { return CODES[i]; }).join(", ") +
      "</b> 에는 하나씩 배워서 도달할 수 없습니다. 선수관계가 서로를 가리키는 순환(A→B, B→A)이 있는지 확인하십시오.");
  }
  if (real === all) {
    add("", "※", "선수관계를 하나도 긋지 않아 2<sup>" + k + "</sup> 그대로입니다. “못하면 못한다”가 확실한 관계를 넣어 보십시오.");
  } else if (real > 0) {
    add("", "→", "제약이 <b>" + all.toLocaleString() + "가지</b>를 <b>" + real.toLocaleString() +
      "가지</b>로 줄였습니다 — 약 " + (all / real).toFixed(1) + "분의 1. 진단은 이 " + real + "가지 중 어디인지만 알아내면 됩니다.");
  }
  if (k > 0 && k < 4) add("", "※", "구성요소가 " + k + "개입니다. 3개 이하이면 진단할 것이 거의 없습니다. <b>다섯 개</b>를 권합니다.");
  if (real > 60) add("warn", "!", "상태가 " + real + "가지여서 격자 그림 대신 목록만 표시합니다. 문항 몇 개로 위치를 특정하려면 상태 수를 줄이는 편이 좋습니다.");
}

/* ── 격자 그리기 ──────────────────────────────────────────────
   아는 것의 개수(rank)를 층으로 삼아 아래에서 위로 쌓고,
   한 개념만 차이 나는 상태끼리 선으로 잇습니다.                */
var SVG_NS = "http://www.w3.org/2000/svg";

function latticeLayout(M) {
  var rows = {};
  M.states.forEach(function (s) {
    var r = KS.popcount(s);
    (rows[r] = rows[r] || []).push(s);
  });
  var ranks = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; });
  var NW = Math.max(46, 18 + M.active.length * 10), NH = 25, GX = 16, GY = 54, PAD = 26;
  var widest = Math.max.apply(null, ranks.map(function (r) { return rows[r].length; }));
  var W = Math.max(360, PAD * 2 + widest * (NW + GX) - GX);
  var H = PAD * 2 + ranks.length * GY - (GY - NH);
  var pos = {};
  ranks.forEach(function (r, ri) {
    var arr = rows[r], total = arr.length * (NW + GX) - GX, x0 = (W - total) / 2;
    arr.forEach(function (s, i) {
      pos[s] = { x: x0 + i * (NW + GX), y: H - PAD - NH - ri * GY };
    });
  });
  return { pos: pos, W: W, H: H, NW: NW, NH: NH };
}

function edgePath(a, b, NW, NH) {
  var x1 = a.x + NW / 2, y1 = a.y, x2 = b.x + NW / 2, y2 = b.y + NH;
  return "M" + x1 + "," + y1 + "C" + x1 + "," + (y1 - 14) + " " + x2 + "," + (y2 + 14) + " " + x2 + "," + y2;
}

function renderLattice(M) {
  var wrap = $("#latWrap");
  wrap.innerHTML = "";
  if (!M.states.length || M.states.length > 60) {
    wrap.appendChild(el("p", "mtx-legend", M.states.length
      ? "상태가 많아 격자를 생략했습니다. 아래 목록으로 확인하십시오."
      : "구성요소를 입력하면 격자가 그려집니다."));
    return;
  }
  var L = latticeLayout(M);
  var svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "lattice");
  svg.setAttribute("viewBox", "0 0 " + L.W + " " + L.H);
  svg.setAttribute("width", L.W);
  svg.setAttribute("height", L.H);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "가능한 지식 상태 " + M.states.length + "가지를 아는 것이 적은 순서로 아래에서 위로 배치한 격자");

  var edges = document.createElementNS(SVG_NS, "g");
  svg.appendChild(edges);
  M.states.forEach(function (s) {
    M.outerFringe(s).forEach(function (j) {
      var t = s | (1 << j);
      if (!M.stateSet.has(t)) return;
      var p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", edgePath(L.pos[s], L.pos[t], L.NW, L.NH));
      p.setAttribute("class", "lat-edge" + (S.sel === s ? " up" : ""));
      var tip = document.createElementNS(SVG_NS, "title");
      tip.textContent = KS.setLabel(s) + " → " + CODES[j] + " 추가";
      p.appendChild(tip);
      edges.appendChild(p);
    });
  });

  M.states.forEach(function (s) {
    var p = L.pos[s];
    var g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "lat-node" + (s === 0 ? " empty" : "") +
      (s === M.full ? " full" : "") + (S.sel === s ? " sel" : ""));
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", "지식 상태 " + KS.setLabel(s));
    var rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", p.x); rect.setAttribute("y", p.y);
    rect.setAttribute("width", L.NW); rect.setAttribute("height", L.NH);
    var txt = document.createElementNS(SVG_NS, "text");
    txt.setAttribute("x", p.x + L.NW / 2); txt.setAttribute("y", p.y + L.NH / 2 + 4);
    txt.setAttribute("text-anchor", "middle");
    txt.textContent = s === 0 ? "없음" : CODES.filter(function (_, i) { return s >> i & 1; }).join("");
    g.appendChild(rect); g.appendChild(txt);
    function toggle() { S.sel = (S.sel === s ? null : s); renderOutputs(); }
    g.onclick = toggle;
    g.onkeydown = function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    };
    svg.appendChild(g);
  });
  wrap.appendChild(svg);
}

function renderDetail(M) {
  var box = $("#detail");
  box.innerHTML = "";
  if (S.sel === null) {
    box.appendChild(el("p", "mtx-legend",
      "아래에서 위로 갈수록 아는 것이 늘어납니다. 선 하나가 구성요소 하나만큼의 차이이고, 아래에서 위까지 이어지는 길 하나하나가 곧 학습 경로입니다."));
    return;
  }
  var s = S.sel, out = M.outerFringe(s), inner = M.innerFringe(s);
  var dl = el("dl", "detail");
  function add(k, v, cls) {
    dl.appendChild(el("dt", null, k));
    dl.appendChild(el("dd", cls || null, v));
  }
  add("지식 상태", KS.setLabel(s), "set");
  add("아는 것", s ? KS.codeList(s) : "없음");
  add("지금 배울 수 있는 것", out.length ? out.map(function (i) { return CODES[i]; }).join(", ") : "없음 (완전 습득)", "fr");
  if (out.length) add("", out.map(function (i) { return CODES[i] + " · " + S.kc[i]; }).join("\n"));
  add("가장 최근에 익힌 것", inner.length ? inner.map(function (i) { return CODES[i]; }).join(", ") : "없음");
  add("여기까지 오는 경로", (M.paths[s] || 0).toLocaleString() + "가지");
  box.appendChild(dl);
  var b = el("button", "btn ghost", "선택 해제");
  b.style.marginTop = "10px";
  b.onclick = function () { S.sel = null; renderOutputs(); };
  box.appendChild(b);
}

function renderStateTable(M) {
  var t = $("#stateTbl");
  t.innerHTML = "";
  var head = el("tr");
  ["#", "아는 수", "지식 상태", "지금 배울 수 있는 것"].forEach(function (h) { head.appendChild(el("th", null, h)); });
  t.appendChild(head);
  if (!M.states.length) {
    var r = el("tr"), c = el("td", null, "아직 계산할 것이 없습니다.");
    c.colSpan = 4; r.appendChild(c); t.appendChild(r);
    return;
  }
  M.states.forEach(function (s, i) {
    var row = el("tr", "clickable" + (S.sel === s ? " sel" : ""));
    row.appendChild(el("td", "num", String(i + 1)));
    row.appendChild(el("td", "num", String(KS.popcount(s))));
    row.appendChild(el("td", "set", KS.setLabel(s)));
    var f = M.outerFringe(s);
    row.appendChild(el("td", "fr", f.length ? f.map(function (j) { return CODES[j]; }).join(", ") : "—"));
    row.onclick = function () { S.sel = (S.sel === s ? null : s); renderOutputs(); };
    t.appendChild(row);
  });
}

/* ══════════════ 2번 탭 · Q-matrix ══════════════ */

function renderQ() {
  var t = $("#qTbl");
  t.innerHTML = "";
  var am = activeMask();
  var head = el("tr");
  head.appendChild(el("th", "item", "문항"));
  S.kc.forEach(function (name, i) {
    var th = el("th", null, CODES[i]);
    th.title = name || "";
    head.appendChild(th);
  });
  head.appendChild(el("th", null, "요구"));
  head.appendChild(el("th", null, "응답"));
  t.appendChild(head);

  S.items.forEach(function (item, r) {
    var tr = el("tr");
    var td = el("td", "item");
    var input = el("input", "itxt");
    input.value = item[0];
    input.placeholder = "문항 " + (r + 1);
    input.setAttribute("aria-label", "문항 " + (r + 1));
    input.oninput = function (e) { S.items[r][0] = e.target.value; save(); renderDiag(); };
    td.appendChild(input);
    tr.appendChild(td);

    S.kc.forEach(function (_, j) {
      var cell = el("td");
      var btn = el("button", "qcell");
      var on = !!(item[1] >> j & 1);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "●" : "";
      btn.setAttribute("aria-label", "문항 " + (r + 1) + "이 " + CODES[j] + "를 요구");
      btn.onclick = function () { S.items[r][1] ^= (1 << j); save(); renderQ(); renderDiag(); };
      cell.appendChild(btn);
      tr.appendChild(cell);
    });

    var req = KS.popcount(item[1] & am);
    var reqCell = el("td", "num", String(req));
    if (req === 1) { reqCell.style.color = "var(--accent)"; reqCell.style.fontWeight = "600"; }
    tr.appendChild(reqCell);

    var respCell = el("td");
    var rb = el("button", "rcell");
    var v = S.resp[r] || "";
    rb.dataset.v = v;
    rb.textContent = v || "·";
    rb.setAttribute("aria-label", "문항 " + (r + 1) + " 응답 — 지금 " + (v === "O" ? "맞힘" : v === "X" ? "틀림" : "안 정함"));
    rb.onclick = function () {
      S.resp[r] = v === "O" ? "X" : v === "X" ? "" : "O";   // O → X → 빈칸 → O
      save(); renderQ(); renderDiag();
    };
    respCell.appendChild(rb);
    tr.appendChild(respCell);
    t.appendChild(tr);
  });
}

var VERDICT = { yes: ["✓", "v-yes"], sus: ["◎", "v-sus"], wob: ["△", "v-wob"], no: ["·", "v-no"], none: ["—", "v-no"] };

function renderDiag() {
  var M = model();
  var D = KS.diagnose(M, S.items.map(function (i) { return i[1]; }), S.resp);
  var t = $("#diagTbl");
  t.innerHTML = "";
  var head = el("tr");
  ["", "지식 구성요소", "오답 중 요구", "정답 중 요구", "판정"].forEach(function (h) { head.appendChild(el("th", null, h)); });
  t.appendChild(head);

  if (!M.active.length) {
    var r = el("tr"), c = el("td", null, "1번 탭에서 지식 구성요소를 먼저 입력하십시오.");
    c.colSpan = 5; r.appendChild(c); t.appendChild(r);
  }
  M.active.forEach(function (j) {
    var row = el("tr"), d = D.result[j];
    row.appendChild(el("td", "set", CODES[j]));
    row.appendChild(el("td", null, S.kc[j]));
    row.appendChild(el("td", "num", d.wrongCount + " / " + D.wrongTotal));
    row.appendChild(el("td", "num", String(d.rightCount)));
    var mark = VERDICT[d.verdict];
    var cell = el("td");
    cell.style.textAlign = "center";
    cell.appendChild(el("span", "verdict " + mark[1], mark[0]));
    row.appendChild(cell);
    t.appendChild(row);
  });

  var box = $("#conclusions");
  box.innerHTML = "";
  function chipRow(label, key, cls) {
    var list = M.active.filter(function (j) { return D.result[j].verdict === key; });
    var row = el("div", "concl");
    row.appendChild(el("span", "chip " + (list.length ? cls : "none"),
      label + " · " + (list.length ? list.map(function (j) { return CODES[j]; }).join(", ") : "없음")));
    list.forEach(function (j) { row.appendChild(el("span", "chip", CODES[j] + " " + S.kc[j])); });
    return row;
  }
  if (D.wrongTotal === 0) {
    box.appendChild(el("p", "mtx-legend", "오답으로 표시한 문항이 없습니다. 위에서 응답 칸을 눌러 O / X 를 바꿔 보십시오."));
  } else {
    box.appendChild(chipRow("◎ 의심됨", "sus", "sus"));
    box.appendChild(chipRow("△ 의심되나 흔들림", "wob", "wob"));
  }

  var lg = $("#legend");
  lg.innerHTML = "";
  [["✓", "v-yes", "그 구성요소만 요구하는 단독 문항을 맞혔음 → 알고 있다고 봄"],
   ["◎", "v-sus", "모든 오답이 이 구성요소를 요구하고, 이것을 요구하는 정답 문항이 하나도 없음 → 가장 의심됨"],
   ["△", "v-wob", "모든 오답이 이 구성요소를 요구하지만, 이것을 요구하는 정답 문항도 있음 → 의심되나 판정이 흔들림"],
   ["·", "v-no", "오답 중에 이 구성요소를 요구하지 않는 문항이 있음 → 이것 때문은 아님"]
  ].forEach(function (row) {
    lg.appendChild(el("span", "sym " + row[1], row[0]));
    lg.appendChild(el("span", null, row[2]));
  });
}

/* ══════════════ 내보내기 ══════════════ */

/** 표를 탭 구분 텍스트로 복사 — 문서에 붙이면 표로 들어갑니다. */
function copyTable() {
  var M = model();
  var out = "순번\t아는 수\t지식 상태\t지금 배울 수 있는 것\n";
  M.states.forEach(function (s, i) {
    var f = M.outerFringe(s);
    out += (i + 1) + "\t" + KS.popcount(s) + "\t" + KS.setLabel(s) + "\t" +
      (f.length ? f.map(function (j) { return CODES[j]; }).join(", ") : "-") + "\n";
  });
  out += "\n구성요소 " + M.active.length + "개 · 제약 없으면 " + M.totalCombinations +
    "가지 · 실제 " + M.states.length + "가지 · 학습 경로 " + M.totalPaths + "가지\n";
  M.active.forEach(function (i) { out += CODES[i] + "\t" + S.kc[i] + "\n"; });
  copyText(out, "표를 복사했습니다. 문서에 붙여 넣으십시오.");
}

function copyText(text, okMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () { toast(okMsg); },
      function () { fallbackCopy(text, okMsg); });
  } else fallbackCopy(text, okMsg);
}
function fallbackCopy(text, okMsg) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); toast(okMsg); }
  catch (e) { toast("복사에 실패했습니다. 직접 선택해 복사하십시오."); }
  document.body.removeChild(ta);
}

/** 브라우저에서 파일 하나를 내려받게 합니다. */
function download(filename, blob) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function saveFile() {
  var data = JSON.stringify(snapshot(), null, 2);
  download("지식구조.json", new Blob([data], { type: "application/json" }));
  toast("지식구조.json 으로 저장했습니다.");
}

function openFile(file) {
  var reader = new FileReader();
  reader.onload = function () {
    try {
      if (adopt(JSON.parse(reader.result))) { save(); renderAll(); toast("불러왔습니다."); }
      else toast("파일 내용을 알아볼 수 없습니다.");
    } catch (e) { toast("JSON 파일이 아닌 것 같습니다."); }
  };
  reader.readAsText(file);
}

/**
 * 격자를 PNG 파일로 저장합니다.
 * 화면의 SVG는 CSS로 색을 입히는데, 파일로 뽑을 때는 CSS가 따라가지 않습니다.
 * 그래서 색과 굵기를 직접 써 넣은 SVG 문자열을 새로 만들어 캔버스에 그립니다.
 */
function exportPNG() {
  var M = model();
  if (!M.states.length || M.states.length > 60) {
    toast("격자가 그려진 상태에서만 저장할 수 있습니다.");
    return;
  }
  var L = latticeLayout(M);
  var SCALE = 2;                       // 2배로 그려서 인쇄해도 또렷하게
  var PAD_TOP = 34;                    // 제목 자리
  var W = L.W, H = L.H + PAD_TOP;

  var parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">');
  parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
  parts.push('<text x="' + (W / 2) + '" y="20" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#0B1F38">' +
    esc("가능한 지식 상태 " + M.states.length + "가지") + '</text>');
  parts.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#6B7A8F">' +
    esc("제약이 없다면 " + M.totalCombinations + "가지 · 학습 경로 " + M.totalPaths + "가지") + '</text>');

  M.states.forEach(function (s) {
    M.outerFringe(s).forEach(function (j) {
      var t = s | (1 << j);
      if (!M.stateSet.has(t)) return;
      var a = { x: L.pos[s].x, y: L.pos[s].y + PAD_TOP };
      var b = { x: L.pos[t].x, y: L.pos[t].y + PAD_TOP };
      parts.push('<path d="' + edgePath(a, b, L.NW, L.NH) + '" fill="none" stroke="#D6DEE9" stroke-width="1.3"/>');
    });
  });
  M.states.forEach(function (s) {
    var p = L.pos[s], y = p.y + PAD_TOP;
    var stroke = s === 0 ? "#6B7A8F" : (s === M.full ? "#0B1F38" : "#2E6BB8");
    var label = s === 0 ? "없음" : CODES.filter(function (_, i) { return s >> i & 1; }).join("");
    parts.push('<rect x="' + p.x + '" y="' + y + '" width="' + L.NW + '" height="' + L.NH +
      '" rx="5" fill="#ffffff" stroke="' + stroke + '" stroke-width="1.5"/>');
    parts.push('<text x="' + (p.x + L.NW / 2) + '" y="' + (y + L.NH / 2 + 4) +
      '" text-anchor="middle" font-family="monospace" font-size="11" font-weight="600" fill="' + stroke + '">' +
      esc(label) + '</text>');
  });
  parts.push('</svg>');

  var svgText = parts.join("");
  var img = new Image();
  img.onload = function () {
    var canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(function (blob) {
      download("지식구조_격자.png", blob);
      toast("지식구조_격자.png 로 저장했습니다. 실습 제출물 ①에 쓰시면 됩니다.");
    }, "image/png");
  };
  img.onerror = function () { toast("이미지를 만들지 못했습니다."); };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 지금 입력한 내용을 통째로 담은 주소를 만듭니다. */
function shareUrl() {
  var base = location.origin + location.pathname;
  return base + "#d=" + KS.encodeState(snapshot());
}

/* ══════════════ 화면 갱신과 연결 ══════════════ */

function renderOutputs() {
  var M = model();
  renderStats(M); renderNotices(M); renderLattice(M); renderDetail(M); renderStateTable(M); renderDiag();
}
function renderAll() { renderKC(); renderMatrix(); renderQ(); renderOutputs(); }

document.addEventListener("DOMContentLoaded", function () {
  $("#btnAddKC").onclick = function () {
    if (S.kc.length >= 8) return;
    S.kc.push(""); S.pre.push(0); save(); renderAll();
  };
  $("#btnAddItem").onclick = function () {
    S.items.push(["", 0]); S.resp.push(""); save(); renderQ(); renderDiag();
  };
  $("#btnExample").onclick = loadExample;
  $("#btnClear").onclick = function () {
    if (confirm("입력한 내용을 모두 지웁니다. 계속할까요?")) clearAll();
  };
  $("#btnCopy").onclick = copyTable;
  $("#btnSave").onclick = saveFile;
  $("#btnLoad").onclick = function () { $("#fileIn").click(); };
  $("#fileIn").onchange = function (e) {
    if (e.target.files[0]) openFile(e.target.files[0]);
    e.target.value = "";
  };
  $("#btnPng").onclick = exportPNG;
  $("#btnPrint").onclick = function () { window.print(); };

  var dlg = $("#dlgShare");
  $("#btnShare").onclick = function () {
    $("#shareUrl").value = shareUrl();
    if (dlg.showModal) dlg.showModal(); else copyText(shareUrl(), "주소를 복사했습니다.");
  };
  $("#btnCloseShare").onclick = function () { dlg.close(); };
  $("#btnCopyUrl").onclick = function () {
    copyText($("#shareUrl").value, "주소를 복사했습니다. 게시판에 붙여 넣으십시오.");
    dlg.close();
  };

  $("#btnTheme").onclick = function () {
    var root = document.documentElement;
    var cur = root.getAttribute("data-theme");
    var dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", dark ? "light" : "dark");
    try { localStorage.setItem(STORAGE_KEY + ":theme", dark ? "light" : "dark"); } catch (e) {}
  };

  document.querySelectorAll(".tab").forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll(".tab").forEach(function (x) {
        x.setAttribute("aria-selected", x === b ? "true" : "false");
      });
      document.querySelectorAll(".panel").forEach(function (p) {
        p.classList.toggle("on", p.id === b.dataset.panel);
      });
    };
  });

  try {
    var th = localStorage.getItem(STORAGE_KEY + ":theme");
    if (th) document.documentElement.setAttribute("data-theme", th);
  } catch (e) {}

  // 주소에 공유 데이터가 있으면 그것을 우선합니다
  var loaded = false;
  if (location.hash.indexOf("#d=") === 0) {
    try { loaded = adopt(KS.decodeState(location.hash.slice(3))); } catch (e) {}
    if (loaded) toast("공유된 지식 구조를 불러왔습니다.");
  }
  if (!loaded) loaded = restore();
  if (!loaded) adopt(EXAMPLE);
  renderAll();
});
