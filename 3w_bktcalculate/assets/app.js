/*
 * app.js — 화면 그리기와 사용자 조작
 * ------------------------------------------------------------------
 * 계산은 전부 assets/bkt-core.js 에 있습니다. 이 파일은 그 결과를 화면에 그리고,
 * 입력이 바뀌면 다시 그리는 일만 합니다.
 *
 * 상태(state)는 아래 S 하나뿐입니다. 무엇이 바뀌든 render() 를 다시 부릅니다.
 * 화면 조각을 부분적으로 고치지 않는 편이 코드를 읽기 쉽게 만듭니다.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  var esc = function (s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  };
  var f3 = function (x) { return x.toFixed(3); };
  /** 그 요소가 없으면 조용히 넘어갑니다. 아티팩트판은 버튼 몇 개가 빠져 있습니다. */
  var on = function (id, ev, fn) { var n = $(id); if (n) n.addEventListener(ev, fn); };

  /* 아티팩트(claude.ai)에서는 페이지가 시작한 내려받기가 막혀 있습니다.
     그 경우 그림을 미리 보여 주고 클립보드로 복사하는 길을 대신 씁니다. */
  var CAN_DOWNLOAD = !window.__NO_DOWNLOAD__;

  // ── 기본 상태 ────────────────────────────────────────────────
  var FB_OPTIONS = ["없음", "KR", "KCR", "EF", "EF + 되묻기"];

  function defaultRules() {
    return [
      { presc: "다음 개념으로", fb: "없음", why: "숙련으로 판정됐으므로 더 말할 것이 없음. 여기서 칭찬을 붙이면 주의가 자아로 올라감" },
      { presc: "같은 개념 한 문제 더", fb: "KCR", why: "판단이 아직 안 섰으니 정보를 더 모으는 단계. 설명까지 주면 다음 문항의 진단값이 흐려짐" },
      { presc: "선수 개념으로 내려감", fb: "EF", why: "어디서 어긋났는지 짚어야 다음 시도가 달라짐" },
      { presc: "선수 개념 진단 문항", fb: "EF + 되묻기", why: "그 개념이 아니라 아래가 무너졌을 가능성이 큼" },
      { presc: "판단 보류 · 문항 추가", fb: "KR", why: "모르는 것이 아니라 판단할 데이터가 없는 상태" }
    ];
  }

  function defaultState() {
    return {
      params: { L0: 0.30, T: 0.10, G: 0.20, S: 0.10, mastery: 0.95 },
      responses: [true, true, true, true, true, true, true, true],
      gB: 0.5,
      th: { mid: 0.5, minObs: 3, streak: 3 },
      probe: { pL: 0.42, count: 2, streak: 0 },
      rules: defaultRules()
    };
  }

  /** 분수 나눗셈 예시 — 워크시트 3면과 같은 설정입니다. */
  function exampleState() {
    var s = defaultState();
    s.params = { L0: 0.30, T: 0.10, G: 0.25, S: 0.12, mastery: 0.95 };
    s.responses = [true, true, false, true, true, true, true, true];
    s.rules[2].why = "어디서 어긋났는지 짚어야 다음 시도가 달라짐. 오답 선택지를 오류 유형별로 만들어 두어 절차를 추론함";
    s.rules[3].why = "그 개념이 아니라 아래가 무너졌을 가능성이 큼. 되묻기로 어디까지 아는지 먼저 확인";
    s.rules[4].why = "모르는 것이 아니라 판단할 데이터가 없는 상태. 여기서 재교수로 보내면 새로 온 학생이 계속 걸림";
    return s;
  }

  var S = defaultState();

  // ── 모수 슬라이더 정의 ───────────────────────────────────────
  var PRAMS = [
    { key: "L0", sym: "P(L0)", name: "사전 지식", lab: "배우기 전부터 알고 있을 확률. 보통 0.1 ~ 0.4", min: 0, max: 0.95, step: 0.01 },
    { key: "T", sym: "P(T)", name: "학습률", lab: "한 번 시도하면 새로 알게 될 확률. 보통 0.05 ~ 0.3", min: 0, max: 0.6, step: 0.01 },
    { key: "G", sym: "P(G)", name: "추측", lab: "모르는데 맞힐 확률. 선다형이면 1 ÷ 선택지 수", min: 0, max: 0.8, step: 0.01 },
    { key: "S", sym: "P(S)", name: "실수", lab: "아는데 틀릴 확률. 보통 0.05 ~ 0.15", min: 0, max: 0.8, step: 0.01 },
    { key: "mastery", sym: "임계값", name: "숙련 판정", lab: "이 값을 넘으면 다음 개념으로. 관행은 0.95", min: 0.5, max: 0.99, step: 0.01 }
  ];

  function buildParams() {
    var box = $("params");
    box.innerHTML = "";
    PRAMS.forEach(function (d) {
      var w = el("div", "pram");
      w.dataset.key = d.key;
      var top = el("div", "top");
      top.appendChild(el("span", "sym", d.sym + "  " + d.name));
      var v = el("span", "val", S.params[d.key].toFixed(2));
      v.dataset.role = "val";
      top.appendChild(v);
      w.appendChild(top);
      w.appendChild(el("div", "lab", d.lab));
      var r = document.createElement("input");
      r.type = "range"; r.min = d.min; r.max = d.max; r.step = d.step;
      r.value = S.params[d.key];
      r.setAttribute("aria-label", d.sym + " " + d.name);
      r.addEventListener("input", function () {
        S.params[d.key] = parseFloat(r.value);
        render();
      });
      w.appendChild(r);
      box.appendChild(w);
    });
  }

  function syncParams() {
    Array.prototype.forEach.call($("params").children, function (w) {
      var k = w.dataset.key;
      w.querySelector('[data-role="val"]').textContent = S.params[k].toFixed(2);
      w.querySelector("input").value = S.params[k];
    });
    var d = BKT.degenerate(S.params);
    $("params").querySelectorAll(".pram").forEach(function (w) {
      var k = w.dataset.key;
      var bad = d && d.level === "bad" && (k === "G" || k === "S");
      w.classList.toggle("flagged", !!bad);
    });
  }

  // ── 경고 줄 ──────────────────────────────────────────────────
  function renderAlert() {
    var d = BKT.degenerate(S.params);
    var box = $("alert");
    box.innerHTML = "";
    var a = el("div", "alert " + (d ? d.level : "ok"));
    a.appendChild(el("span", "ic", d ? (d.level === "bad" ? "✕" : "!") : "✓"));
    a.appendChild(el("span", null, d ? d.text : "정상 범위입니다. P(G) + P(S) = " +
      (S.params.G + S.params.S).toFixed(2) + " 로 1 미만입니다."));
    box.appendChild(a);
  }

  // ── 응답 칩 ──────────────────────────────────────────────────
  function renderSeq() {
    var box = $("seq");
    box.innerHTML = "";
    S.responses.forEach(function (r, i) {
      var b = el("button", "chip " + (r ? "o" : "x"), r ? "O" : "X");
      b.title = (i + 1) + "번째 시도 — 눌러서 바꾸기";
      b.setAttribute("aria-label", (i + 1) + "번째 시도 " + (r ? "정답" : "오답"));
      b.addEventListener("click", function () { S.responses[i] = !S.responses[i]; render(); });
      box.appendChild(b);
    });
  }

  // ── 통계 타일 ────────────────────────────────────────────────
  function tile(box, t, v, unit, cls) {
    var d = el("div", "tile" + (cls ? " " + cls : ""));
    d.appendChild(el("div", "t", t));
    var n = el("div", "v", v);
    if (unit) { var u = el("small", null, unit); n.appendChild(u); }
    d.appendChild(n);
    box.appendChild(d);
  }

  function renderTiles(rows) {
    var box = $("tiles");
    box.innerHTML = "";
    var hit = BKT.firstMastery(rows, S.params.mastery);
    tile(box, "숙련 도달", hit ? String(hit) : "미도달", hit ? "번째" : "", hit ? "hi" : "flag");
    tile(box, "마지막 P(L)", rows.length ? f3(rows[rows.length - 1].next) : f3(S.params.L0));
    var consec = BKT.attemptsToMastery(S.params, 30);
    tile(box, "연속 정답이라면", consec ? String(consec) : "30+", consec ? "문제" : "");
    var wrong = S.responses.filter(function (r) { return !r; }).length;
    tile(box, "오답", String(wrong), "개");
  }

  // ── 한 걸음씩 표 ─────────────────────────────────────────────
  function renderSteps(rows) {
    var t = $("steps");
    t.innerHTML =
      "<thead><tr><th style='text-align:right'>시도</th><th>응답</th><th style='text-align:right'>시도 전 P(L)</th>" +
      "<th style='text-align:right'>맞힐 확률</th><th style='text-align:right'>되돌아본 뒤</th>" +
      "<th style='text-align:right'>학습 반영 후</th><th>판정</th></tr></thead>";
    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      if (r.mastered) tr.className = "mastered";
      tr.innerHTML =
        "<td class='num'>" + r.index + "</td>" +
        "<td><span class='" + (r.correct ? "tago" : "tagx") + "'>" + (r.correct ? "O" : "X") + "</span></td>" +
        "<td class='num'>" + f3(r.prior) + "</td>" +
        "<td class='num'>" + f3(r.pCorrect) + "</td>" +
        "<td class='num'>" + f3(r.post) + "</td>" +
        "<td class='num'>" + f3(r.next) + "</td>" +
        "<td>" + (r.mastered ? "숙련" : "") + "</td>";
      tb.appendChild(tr);
    });
    t.appendChild(tb);

    var ec = BKT.evidence(true, S.params), ew = BKT.evidence(false, S.params);
    $("evidence").innerHTML =
      "<b>증거의 세기</b> — 정답 한 번은 승산을 " + Math.exp(ec).toFixed(1) + "배 올리고, " +
      "오답 한 번은 " + (1 / Math.exp(ew)).toFixed(1) + "배 내립니다. " +
      "지금 모수에서는 <b>오답이 정답보다 " + (Math.abs(ew) / Math.abs(ec)).toFixed(1) + "배 무겁습니다.</b> " +
      "확률의 변화폭만 보면 헷갈립니다 — 확률이 낮을 때는 정답이 더 크게 움직이고, 높을 때는 오답이 더 크게 움직이니까요. " +
      "승산으로 보면 지금 확률이 어디에 있든 같은 값입니다.";
  }

  // ── 차트 ─────────────────────────────────────────────────────
  function chartSvg(rows) {
    var W = 560, H = 300, mL = 64, mR = 14, mT = 16, mB = 36;
    var n = Math.max(rows.length, 1);
    var iw = W - mL - mR, ih = H - mT - mB;
    var x = function (i) { return mL + (n === 0 ? 0 : (i / n) * iw); };
    var y = function (v) { return mT + (1 - v) * ih; };

    var p = [];
    // width/height 를 명시합니다 — 없으면 PNG로 굽을 때 크기를 브라우저가 제멋대로 잡습니다.
    p.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
      '" class="chart" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="연습 기회에 따른 P(L) 변화">');
    p.push('<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>');
    // 가로 눈금
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      p.push('<line x1="' + mL + '" y1="' + y(v) + '" x2="' + (W - mR) + '" y2="' + y(v) +
        '" stroke="#E7EDF4" stroke-width="1"/>');
      p.push('<text x="' + (mL - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-family="monospace" font-size="10" fill="#6B7A8F">' + v.toFixed(2) + '</text>');
    });
    // 숙련 임계값
    p.push('<line x1="' + mL + '" y1="' + y(S.params.mastery) + '" x2="' + (W - mR) + '" y2="' + y(S.params.mastery) +
      '" stroke="#A8322D" stroke-width="1.4" stroke-dasharray="5 4"/>');
    p.push('<text x="' + (mL + 5) + '" y="' + (y(S.params.mastery) - 6) + '" font-family="monospace" font-size="10" font-weight="600" fill="#A8322D">숙련 ' + S.params.mastery.toFixed(2) + '</text>');

    // 전부 맞혔다면 (참조선)
    var ref = BKT.curve(S.params, n);
    var refPts = ref.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
    p.push('<polyline points="' + refPts + '" fill="none" stroke="#C06014" stroke-width="1.6" stroke-dasharray="4 3" opacity=".75"/>');

    // 실제 응답
    var pts = [{ i: 0, v: S.params.L0 }].concat(rows.map(function (r, i) { return { i: i + 1, v: r.next }; }));
    p.push('<polyline points="' + pts.map(function (q) { return x(q.i) + "," + y(q.v); }).join(" ") +
      '" fill="none" stroke="#2E6BB8" stroke-width="2.6" stroke-linejoin="round"/>');
    pts.forEach(function (q, i) {
      var correct = i === 0 ? null : rows[i - 1].correct;
      var fill = i === 0 ? "#6B7A8F" : (correct ? "#2E6BB8" : "#C06014");
      p.push('<circle cx="' + x(q.i) + '" cy="' + y(q.v) + '" r="4.2" fill="' + fill + '" stroke="#ffffff" stroke-width="1.4"/>');
      if (i > 0) {
        p.push('<text x="' + x(q.i) + '" y="' + (H - mB + 15) + '" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="' +
          (correct ? "#3A4E68" : "#C06014") + '">' + (correct ? "O" : "X") + '</text>');
      }
    });
    p.push('<line x1="' + mL + '" y1="' + y(0) + '" x2="' + (W - mR) + '" y2="' + y(0) + '" stroke="#D6DEE9" stroke-width="1"/>');
    p.push('<text x="' + (mL + iw / 2) + '" y="' + (H - 4) + '" text-anchor="middle" font-family="sans-serif" font-size="10.5" fill="#6B7A8F">연습 기회</text>');
    p.push('<text x="14" y="' + (mT + ih / 2) + '" text-anchor="middle" font-family="sans-serif" font-size="10.5" fill="#6B7A8F" transform="rotate(-90 14 ' + (mT + ih / 2) + ')">아는 것으로 추정되는 확률  P(L)</text>');
    p.push('</svg>');
    return { svg: p.join(""), W: W, H: H };
  }

  function renderChart(rows) {
    var c = chartSvg(rows);
    $("chart").innerHTML = c.svg;
    $("chart")._dims = c;
  }

  // ── 비교 ─────────────────────────────────────────────────────
  function renderCompare() {
    $("gA").value = S.params.G.toFixed(2);
    var pA = S.params;
    var pB = Object.assign({}, S.params, { G: S.gB });
    var nA = BKT.attemptsToMastery(pA, 20), nB = BKT.attemptsToMastery(pB, 20);

    var box = $("cmpTiles");
    box.innerHTML = "";
    tile(box, "조건 A · P(G) " + pA.G.toFixed(2), nA ? String(nA) : "20+", nA ? "문제" : "", "hi");
    tile(box, "조건 B · P(G) " + pB.G.toFixed(2), nB ? String(nB) : "20+", nB ? "문제" : "", "flag");
    tile(box, "차이", (nA && nB) ? String(nB - nA) : "—", (nA && nB) ? "문제" : "");

    var N = 12;
    var cA = BKT.curve(pA, N), cB = BKT.curve(pB, N);
    var t = $("cmpTable");
    t.innerHTML = "<thead><tr><th style='text-align:right'>시도</th>" +
      "<th style='text-align:right'>조건 A</th><th>판정</th>" +
      "<th style='text-align:right'>조건 B</th><th>판정</th></tr></thead>";
    var tb = el("tbody");
    for (var i = 1; i <= N; i++) {
      var tr = el("tr");
      var mA = cA[i] >= pA.mastery, mB = cB[i] >= pB.mastery;
      if (mA && mB) tr.className = "mastered";
      tr.innerHTML = "<td class='num'>" + i + "</td>" +
        "<td class='num'>" + f3(cA[i]) + "</td><td>" + (mA ? "숙련" : "") + "</td>" +
        "<td class='num'>" + f3(cB[i]) + "</td><td>" + (mB ? "숙련" : "") + "</td>";
      tb.appendChild(tr);
    }
    t.appendChild(tb);
  }

  // ── 민감도 막대 ──────────────────────────────────────────────
  function renderBars(hostId, key, values) {
    var host = $(hostId);
    host.innerHTML = "";
    var data = BKT.sensitivity(S.params, key, values, 15);
    var max = data.reduce(function (m, d) { return Math.max(m, d.attempts || 16); }, 1);
    data.forEach(function (d) {
      var row = el("div", "bar-row");
      if (Math.abs(d.value - S.params[key]) < 0.001) row.classList.add("hi");
      row.appendChild(el("div", "cap", d.value.toFixed(2)));
      var track = el("div", "bar-track");
      var fill = el("div", "bar-fill");
      fill.style.width = ((d.attempts || 16) / max * 100).toFixed(1) + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("div", "out", d.attempts ? d.attempts + "문제" : "15+"));
      host.appendChild(row);
    });
  }

  // ── 규칙표 ───────────────────────────────────────────────────
  function thresholds() {
    return { mastery: S.params.mastery, mid: S.th.mid, minObs: S.th.minObs, streak: S.th.streak };
  }

  function renderRules() {
    var th = thresholds();
    var cond = BKT.ruleConditions(th);
    var fired = BKT.ruleFor(S.probe, th);
    var t = $("rules");
    t.innerHTML = "<thead><tr><th class='no'>#</th><th style='width:20%'>진단 결과</th>" +
      "<th style='width:24%'>처방 — 다음에 무엇을</th><th style='width:15%'>피드백</th>" +
      "<th>근거 — 왜 그렇게 정했는가</th></tr></thead>";
    var tb = el("tbody");
    S.rules.forEach(function (r, i) {
      var tr = el("tr");
      if (fired === i + 1) tr.className = "fired";
      tr.innerHTML =
        "<td class='no'>" + (i + 1) + "</td>" +
        "<td class='cond'>" + esc(cond[i]) + "</td>" +
        "<td><div contenteditable data-f='presc' data-i='" + i + "' data-ph='처방을 적으십시오'>" + esc(r.presc) + "</div></td>" +
        "<td></td>" +
        "<td><div contenteditable data-f='why' data-i='" + i + "' data-ph='왜 그렇게 정했는지 한 줄'>" + esc(r.why) + "</div></td>";
      var sel = document.createElement("select");
      sel.className = "fbsel";
      FB_OPTIONS.forEach(function (o) {
        var op = document.createElement("option");
        op.value = o; op.textContent = o;
        if (o === r.fb) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener("change", function () { S.rules[i].fb = sel.value; save(); });
      tr.children[3].appendChild(sel);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    t.querySelectorAll("[contenteditable]").forEach(function (d) {
      d.addEventListener("blur", function () {
        S.rules[+d.dataset.i][d.dataset.f] = d.textContent.trim();
        save();
      });
    });
  }

  function renderVerdict() {
    var th = thresholds();
    var n = BKT.ruleFor(S.probe, th);
    var r = S.rules[n - 1];
    var why;
    if (n === 5) why = "확률이 낮아서가 아니라 판단할 데이터가 없어서입니다. 관측 " + S.probe.count +
      "회는 최소 " + th.minObs + "회에 못 미칩니다. 같은 개념에서 문항을 더 주어야 합니다.";
    else if (n === 4) why = "연속 오답 " + S.probe.streak + "회가 기준 " + th.streak +
      "회를 넘었습니다. 이 개념이 아니라 아래가 무너졌을 가능성이 큽니다.";
    else if (n === 1) why = "P(L) " + S.probe.pL.toFixed(2) + " 가 숙련 임계값 " + th.mastery.toFixed(2) + " 이상입니다.";
    else if (n === 2) why = "P(L) " + S.probe.pL.toFixed(2) + " 가 중간 구간(" + th.mid.toFixed(2) + " ~ " +
      th.mastery.toFixed(2) + ")입니다. 아직 판단이 안 섰습니다.";
    else why = "관측이 충분한데도 P(L) " + S.probe.pL.toFixed(2) + " 가 중간 임계값 " + th.mid.toFixed(2) +
      " 아래입니다. 이건 데이터 부족이 아니라 모른다는 뜻입니다.";

    var v = $("verdict");
    v.innerHTML = "";
    v.appendChild(el("div", "hd", n + "번 규칙"));
    v.appendChild(el("div", "bd", r.presc + "   ·   피드백 " + r.fb));
    v.appendChild(el("div", "why", why));
  }

  // ── 전체 다시 그리기 ─────────────────────────────────────────
  function render() {
    var p = BKT.normalize(S.params);
    S.params = p;
    syncParams();
    renderAlert();
    renderSeq();
    var rows = BKT.run(p, S.responses);
    renderTiles(rows);
    renderSteps(rows);
    renderChart(rows);
    renderCompare();
    renderBars("sensG", "G", [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6]);
    renderBars("sensS", "S", [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4]);
    renderRules();
    renderVerdict();
    save();
  }

  // ── 저장 · 공유 ──────────────────────────────────────────────
  var KEY = "bkt-calc-v1";
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* 저장이 막혀 있어도 계속 씁니다 */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* 무시 */ }
    return null;
  }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove("on"); }, 2600);
  }

  function download(name, blob) {
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function exportPng() {
    var d = $("chart")._dims;
    if (!d) return;
    var SCALE = 2;
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement("canvas");
      cv.width = d.W * SCALE; cv.height = d.H * SCALE;
      var ctx = cv.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
      ctx.drawImage(img, 0, 0, d.W, d.H);
      cv.toBlob(function (blob) {
        if (CAN_DOWNLOAD) {
          download("BKT_확률변화.png", blob);
          toast("BKT_확률변화.png 로 저장했습니다. 실습 제출물에 쓰시면 됩니다.");
        } else {
          showPngDialog(blob, cv.toDataURL("image/png"));
        }
      }, "image/png");
    };
    img.onerror = function () { toast("이미지를 만들지 못했습니다."); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(d.svg);
  }

  /** 내려받기가 막힌 환경용 — 그림을 보여 주고 복사할 수 있게 합니다. */
  var pngBlob = null;
  function showPngDialog(blob, dataUrl) {
    pngBlob = blob;
    var dlg = $("dlgPng");
    if (!dlg) { toast("그림을 만들었지만 보여 줄 곳이 없습니다."); return; }
    $("pngPreview").src = dataUrl;
    if (dlg.showModal) dlg.showModal();
    else toast("이 브라우저에서는 창을 열 수 없습니다.");
  }
  function copyPng() {
    if (!pngBlob) { toast("그림이 아직 준비되지 않았습니다."); return; }
    if (!navigator.clipboard || !window.ClipboardItem) {
      toast("이 브라우저는 그림 복사를 지원하지 않습니다. 그림을 오른쪽 버튼으로 눌러 저장하십시오.");
      return;
    }
    navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]).then(function () {
      toast("그림을 복사했습니다. 문서에 붙여 넣으십시오.");
      $("dlgPng").close();
    }, function () {
      toast("복사가 막혀 있습니다. 그림을 오른쪽 버튼으로 눌러 저장하십시오.");
    });
  }

  // ── 이벤트 연결 ──────────────────────────────────────────────
  function bind() {
    // 탭
    var tabs = [["tab-calc", "panel-calc"], ["tab-cmp", "panel-cmp"], ["tab-rule", "panel-rule"]];
    tabs.forEach(function (pair) {
      on(pair[0], "click", function () {
        tabs.forEach(function (q) {
          var on = q[0] === pair[0];
          $(q[0]).setAttribute("aria-selected", on ? "true" : "false");
          $(q[1]).classList.toggle("on", on);
        });
      });
    });

    on("btnAllO", "click", function () {
      S.responses = S.responses.map(function () { return true; }); render();
    });
    on("btnFirstX", "click", function () {
      S.responses = S.responses.map(function (_, i) { return i !== 0; }); render();
    });
    on("btnAdd", "click", function () {
      if (S.responses.length < 20) { S.responses.push(true); render(); }
    });
    on("btnDel", "click", function () {
      if (S.responses.length > 1) { S.responses.pop(); render(); }
    });

    on("gB", "input", function () {
      S.gB = Math.min(0.95, Math.max(0, parseFloat(this.value) || 0)); renderCompare(); save();
    });

    [["thM", "mastery"], ["thMid", "mid"], ["thObs", "minObs"], ["thStr", "streak"]].forEach(function (pair) {
      on(pair[0], "input", function () {
        var v = parseFloat(this.value);
        if (!isFinite(v)) return;
        if (pair[1] === "mastery") { S.params.mastery = v; render(); }
        else { S.th[pair[1]] = v; renderRules(); renderVerdict(); save(); }
      });
    });

    [["pbL", "pL"], ["pbC", "count"], ["pbS", "streak"]].forEach(function (pair) {
      on(pair[0], "input", function () {
        var v = parseFloat(this.value);
        if (!isFinite(v)) return;
        S.probe[pair[1]] = v; renderRules(); renderVerdict(); save();
      });
    });
    on("btnPbFlip", "click", function () {
      S.probe.count = S.probe.count === 2 ? 5 : 2;
      $("pbC").value = S.probe.count;
      renderRules(); renderVerdict(); save();
      toast("관측 수 " + S.probe.count + " — 확률은 그대로인데 걸리는 규칙이 바뀝니다.");
    });

    on("btnExample", "click", function () {
      S = exampleState(); syncInputs(); render();
      toast("분수 나눗셈 예시입니다. 3번 문항을 틀린 학생입니다.");
    });
    on("btnReset", "click", function () {
      S = defaultState(); syncInputs(); render(); toast("기본값으로 되돌렸습니다.");
    });

    on("btnShare", "click", function () {
      var url = location.origin + location.pathname + "#d=" + BKT.encodeState(S);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          toast("링크를 복사했습니다. 지금 입력한 내용이 그대로 담겨 있습니다.");
        }, function () { location.hash = "d=" + BKT.encodeState(S); toast("주소창의 링크를 복사하십시오."); });
      } else {
        location.hash = "d=" + BKT.encodeState(S);
        toast("주소창의 링크를 복사하십시오.");
      }
    });
    on("btnSave", "click", function () {
      download("BKT계산기.json", new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }));
      toast("BKT계산기.json 으로 저장했습니다.");
    });
    on("btnLoad", "click", function () { $("fileIn").click(); });
    on("fileIn", "change", function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var obj = JSON.parse(rd.result);
          S = Object.assign(defaultState(), obj);
          syncInputs(); render(); toast("불러왔습니다.");
        } catch (e) { toast("파일을 읽지 못했습니다."); }
      };
      rd.readAsText(f);
      this.value = "";
    });

    on("btnPng", "click", exportPng);
    on("btnPngCopy", "click", copyPng);
    on("btnPngClose", "click", function () { $("dlgPng").close(); });

    on("btnTheme", "click", function () {
      var cur = document.documentElement.getAttribute("data-theme");
      var next = cur === "dark" ? "light" : (cur === "light" ? "dark" : "dark");
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY + "-theme", next); } catch (e) { /* 무시 */ }
    });
  }

  /** 상태가 통째로 바뀌었을 때 입력 칸들을 맞춥니다. */
  function syncInputs() {
    $("gB").value = S.gB;
    $("thM").value = S.params.mastery;
    $("thMid").value = S.th.mid;
    $("thObs").value = S.th.minObs;
    $("thStr").value = S.th.streak;
    $("pbL").value = S.probe.pL;
    $("pbC").value = S.probe.count;
    $("pbS").value = S.probe.streak;
  }

  // ── 시작 ─────────────────────────────────────────────────────
  function boot() {
    try {
      var th = localStorage.getItem(KEY + "-theme");
      if (th) document.documentElement.setAttribute("data-theme", th);
    } catch (e) { /* 무시 */ }

    var hash = location.hash.match(/^#d=(.+)$/);
    if (hash) {
      try { S = Object.assign(defaultState(), BKT.decodeState(hash[1])); }
      catch (e) { /* 링크가 깨졌으면 기본값으로 */ }
    } else {
      var saved = load();
      if (saved) S = Object.assign(defaultState(), saved);
    }
    buildParams();
    bind();
    syncInputs();
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
