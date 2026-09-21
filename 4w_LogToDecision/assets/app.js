/*
 * app.js — 화면 그리기와 사용자 조작
 * 계산은 전부 la-core.js(LA)에 있고, 이 파일은 그 결과를 화면에 옮기기만 합니다.
 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function f2(p) { return p == null || isNaN(p) ? "–" : Number(p).toFixed(2); }
  function cellP(p) { return p >= 0.995 ? "1.0" : Number(p).toFixed(2).replace(/^0/, ""); }
  function pct(x) { return Math.round(x * 100) + "%"; }

  // 2주 지식 구조 — 배포 로그를 쓸 때만 이름과 선수 관계를 붙입니다
  var CONCEPT = { A: "분수의 크기 비교", B: "분수 × 자연수", C: "분수 ÷ 자연수", D: "역수", E: "분수 ÷ 분수", F: "포함제 해석" };
  var PRE = { B: ["A"], C: ["A"], D: ["A"], E: ["B", "C", "D"], F: ["E"] };

  // 강의 M1 ③ 표의 지표 다섯 개 — 결정 칸은 일부러 가져오지 않습니다
  var REF_METRICS = [
    { name: "개념별 숙련 확률", calc: "학습자·개념별 p_known_after의 마지막 값 (BKT P(L))" },
    { name: "관측 수", calc: "학습자·개념별 n_obs의 마지막 값 (시도 횟수)" },
    { name: "최근 3회 추세", calc: "같은 개념 최근 3회 응답의 정답률 (이동 정답률)" },
    { name: "규칙별 발동 횟수", calc: "지금 상태(마지막 줄)의 rule_fired를 번호별로 셈" },
    { name: "판단 보류 비율", calc: "5번 규칙 칸 수 ÷ 전체 칸 수" }
  ];

  // 교수자 시범 예시 — 강의 슬라이드의 두 화면 그림과 같은 내용
  function example() {
    return {
      isExample: true,
      learner: [
        { name: "개념 E 숙련 — 지금 여기와 목표", kind: "progress", decision: "목표까지 두 문제 남았음을 보고 이어서 풀지 정함" },
        { name: "다음 문제 풀기", kind: "action", decision: "다음에 무엇을 풀지 — 규칙표가 고른 문항으로 바로 감" },
        { name: "지난번 오류 한 줄 — 통분을 빠뜨렸습니다", kind: "text", decision: "이번 풀이에서 무엇을 조심할지" }
      ],
      teacher: [
        { name: "먼저 가야 할 학생", kind: "queue", decision: "누구에게 먼저 갈지 — 연속 오답은 진단, 관측 부족은 문항 배정" },
        { name: "개념 × 학생 격자 (관측 수 포함)", kind: "grid", decision: "다음 수업에서 어느 개념을 다시 가르칠지" },
        { name: "규칙별 발동 횟수", kind: "bar", decision: "규칙표 임계값을 고칠지" },
        { name: "전체 진도율", kind: "number", decision: "" }
      ]
    };
  }
  function blankMetric() { return { name: "", calc: "", decision: "" }; }

  var FRAMES = [
    { v: "none", t: "비교 없음", c: "지금 0.62만" },
    { v: "past", t: "내 과거", c: "2주 전보다 올라감" },
    { v: "goal", t: "목표", c: "목표까지 0.18 남음" },
    { v: "peer", t: "또래", c: "또래보다 조금 위" }
  ];
  var THIN = [
    { v: "hatch", t: "빗금 + 관측 수", pv: '<i class="a">.78</i><i class="h">n2</i><i class="b">.31</i>' },
    { v: "grey", t: "회색 칸", pv: '<i class="a">.78</i><i class="g">n2</i><i class="b">.31</i>' },
    { v: "text", t: "숫자 숨기고 ‘판단 보류’", pv: '<i class="a">.78</i><i class="x">보류</i><i class="b">.31</i>' },
    { v: "other", t: "기타 (직접 적기)", pv: "" }
  ];

  // ── 상태 ──────────────────────────────────────────────────────
  var KEY = "la4-draft-v1";
  var S = {
    tab: "calc",
    gview: "both", dskill: null, rmode: "final", sel: null,
    metrics: [blankMetric(), blankMetric(), blankMetric()],
    sketch: example(),
    frame: { choice: "", peer: "", why: "" },
    drop: { w: "", why: "", mode: "", how: "" },
    q1: "", q2: ""
  };
  var D = null;  // 지금 쓰는 로그 {source, name, rows, notes, ov, g}

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        tab: S.tab, metrics: S.metrics, sketch: S.sketch, frame: S.frame, drop: S.drop, q1: S.q1, q2: S.q2
      }));
    } catch (e) { /* 저장이 막힌 브라우저에서는 조용히 넘어갑니다 */ }
  }
  function restore() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (Array.isArray(o.metrics) && o.metrics.length) S.metrics = o.metrics;
      if (o.sketch && Array.isArray(o.sketch.learner)) S.sketch = o.sketch;
      if (o.frame) S.frame = Object.assign(S.frame, o.frame);
      if (o.drop) S.drop = Object.assign(S.drop, o.drop);
      if (typeof o.q1 === "string") S.q1 = o.q1;
      if (typeof o.q2 === "string") S.q2 = o.q2;
      if (o.tab) S.tab = o.tab;
    } catch (e) { /* 비어 있거나 막혀 있으면 처음 상태로 */ }
  }

  var toastT;
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("on"); }, 2600);
  }

  // ── 데이터 ────────────────────────────────────────────────────
  function useLog(text, source, name) {
    var L = LA.loadLog(text);
    if (L.errors.length && !L.rows.length) return L;
    var ov = LA.overview(L.rows);
    D = { source: source, name: name, rows: L.rows, notes: L.notes, errors: L.errors, ov: ov, g: LA.grid(L.rows) };
    if (!S.dskill || ov.skills.indexOf(S.dskill) < 0) S.dskill = ov.skills[0] || null;
    S.sel = null;
    renderCalc();
    return L;
  }

  function prereqPairs(skills) {
    var out = [];
    function ancestors(k, seen) {
      (PRE[k] || []).forEach(function (p) { if (!seen[p]) { seen[p] = 1; ancestors(p, seen); } });
      return seen;
    }
    skills.forEach(function (k) {
      Object.keys(ancestors(k, {})).forEach(function (a) { if (skills.indexOf(a) >= 0) out.push([a, k]); });
    });
    return out;
  }
  function kname(k) { return D && D.source === "sample" && CONCEPT[k] ? CONCEPT[k] : ""; }

  // ── 지표 계산 탭 ──────────────────────────────────────────────
  function renderCalc() {
    if (!D) return;
    var ov = D.ov, g = D.g, gc = LA.gridCounts(g);
    var chip = $("srcChip");
    chip.className = "src-chip" + (D.source === "mine" ? " mine" : "");
    chip.innerHTML = (D.source === "mine" ? "불러온 로그 · " + esc(D.name || "CSV") : "가상 로그") +
      " · <b>" + ov.nRows + "</b>줄 · 학습자 <b>" + ov.learners.length + "</b>";

    var total = ov.learners.length * ov.skills.length;
    $("pipe").innerHTML = [
      ["로그", ov.nRows, "줄", ""], ["학습자", ov.learners.length, "명", ""], ["개념", ov.skills.length, "개", ""],
      ["판단 가능", gc.ok, "칸", "okc"], ["관측 부족", gc.thin, "칸", "thinc"], ["시도 없음", gc.none, "칸", "nonec"]
    ].map(function (x) {
      return '<div class="st ' + x[3] + '"><div class="k">' + x[0] + '</div><div class="v">' + x[1] + "<small>" + x[2] + "</small></div></div>";
    }).join("");
    $("pipe").setAttribute("aria-label", "격자 " + total + "칸 중 판단 가능 " + gc.ok + ", 관측 부족 " + gc.thin + ", 시도 없음 " + gc.none);

    renderGrid(); renderDist(); renderRules(); renderPriority(); renderInv();
  }

  function renderGrid() {
    var g = D.g, v = S.gview;
    document.querySelectorAll("#gview button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === v)); });
    var h = "<thead><tr><th></th>" + g.learners.map(function (l) { return "<th scope='col'>" + esc(l) + "</th>"; }).join("") + "</tr></thead><tbody>";
    g.skills.forEach(function (k) {
      var nm = kname(k);
      h += "<tr><th class='rh' scope='row'>" + esc(k) + (nm ? " <span>" + esc(nm) + "</span>" : "") + "</th>";
      g.learners.forEach(function (l) {
        var c = g.cell(l, k), cls = "mc", txt = "", lab;
        var sel = S.sel && S.sel.l === l && S.sel.k === k;
        if (c.state === "none") { cls += " none"; txt = "–"; lab = l + " 개념 " + k + " 시도 없음"; }
        else if (v === "n") { cls += " nview" + (c.n < g.minObs ? " lo" : ""); txt = String(c.n); lab = l + " 개념 " + k + " 관측 " + c.n + "회"; }
        else if (v === "p" || c.state === "ok") { cls += " b" + c.bin; txt = cellP(c.p); lab = l + " 개념 " + k + " 숙련 확률 " + f2(c.p); }
        else { cls += " thin"; txt = "n" + c.n; lab = l + " 개념 " + k + " 관측 부족 " + c.n + "회, 판단 보류"; }
        if (sel) cls += " sel";
        h += "<td><button type='button' class='" + cls + "' data-l='" + esc(l) + "' data-k='" + esc(k) + "' aria-label='" + esc(lab) + "'" +
          (c.state === "none" ? " tabindex='-1'" : "") + ">" + txt + "</button></td>";
      });
      h += "</tr>";
    });
    $("mgrid").innerHTML = h + "</tbody>";

    var ramp = "<span class='ramp'><i style='background:var(--r0)'></i><i style='background:var(--r1)'></i><i style='background:var(--r2)'></i><i style='background:var(--r3)'></i><i style='background:var(--r4)'></i></span>";
    var lg;
    if (v === "both") lg = "<span>" + ramp + "숙련 확률 0 → 1 (0.2 간격)</span>" +
      "<span><i class='sw' style='border:1.5px solid var(--warn);background:repeating-linear-gradient(135deg,var(--warn-soft) 0 3px,var(--surface) 3px 7px)'></i>관측 " + g.minObs + "회 미만 — 판단 보류 (n = 관측 수)</span>" +
      "<span><i class='sw' style='border:1px dashed var(--line);background:var(--surface)'></i>시도 없음</span>";
    else if (v === "p") lg = "<span>" + ramp + "숙련 확률 — p_known_after의 마지막 값만 본 표</span>";
    else lg = "<span><i class='sw' style='background:var(--sunken);border:1px solid var(--line-soft)'></i>관측 수 — n_obs의 마지막 값</span>" +
      "<span><i class='sw' style='background:var(--sunken);border:1px solid var(--warn)'></i>" + g.minObs + "회 미만</span>";
    $("glegend").innerHTML = lg;
    renderDetail();
  }

  function renderDetail() {
    var g = D.g, el = $("gdetail");
    if (!S.sel) {
      if (S.gview === "p") {
        // 피벗 1만 보면 무엇을 잘못 읽게 되는지 — 관측이 가장 적은 칸을 하나 골라 보여 줍니다
        var worst = null;
        g.skills.forEach(function (k) { g.learners.forEach(function (l) {
          var c = g.cell(l, k);
          if (c.state === "thin" && (!worst || c.n < worst.c.n || (c.n === worst.c.n && c.p < worst.c.p))) worst = { l: l, k: k, c: c };
        }); });
        el.innerHTML = worst
          ? "<b>피벗 1만 보면 이렇게 읽힙니다.</b> " + esc(worst.l) + "의 개념 " + esc(worst.k) + "는 " + f2(worst.c.p) +
            " — 모르는 학생 같습니다. 그런데 관측은 <b>" + worst.c.n + "회</b>뿐입니다. 피벗 2와 겹쳐 읽어야 하는 이유입니다."
          : "관측이 부족한 칸이 없습니다. 이 로그에서는 피벗 1만으로도 읽힙니다.";
      } else if (S.gview === "n") {
        el.innerHTML = "관측 수만 보면 <b>얼마나 봤는지</b>는 알지만 <b>무엇을 봤는지</b>는 모릅니다. 두 표를 겹쳐 읽은 것이 ‘겹쳐 읽기’입니다.";
      } else {
        el.innerHTML = "칸을 누르면 그 값이 로그의 어느 줄에서 왔는지 보여 줍니다.";
      }
      return;
    }
    var l = S.sel.l, k = S.sel.k, c = g.cell(l, k), R = LA.RULES;
    if (c.state === "none") { el.innerHTML = "<b>" + esc(l) + " · 개념 " + esc(k) + "</b> — 아직 이 개념이 대표인 문항을 풀지 않았습니다. 판단할 것이 없고, 진도 문제로 따로 봅니다."; return; }
    var src = "스프레드시트 <span class='mono'>" + c.line + "</span>행" + (c.item ? " (" + esc(c.item) + ")" : "") + "의 값";
    var tail = " → 규칙 " + c.rule + " <b>" + esc(R[c.rule] ? R[c.rule].presc : "") + "</b>";
    if (c.state === "thin") {
      el.innerHTML = "<b>" + esc(l) + " · 개념 " + esc(k) + "</b> — " + src + " · 관측 <b>" + c.n + "회</b>. 확률 " + f2(c.p) +
        "이 계산돼 있지만 판단하지 않습니다." + tail;
    } else {
      el.innerHTML = "<b>" + esc(l) + " · 개념 " + esc(k) + "</b> — " + src + " · P(L) <b>" + f2(c.p) + "</b> · 관측 " + c.n +
        "회 · 연속 오답 " + c.streak + "회" + tail;
    }
  }

  function renderDist() {
    var g = D.g, k = S.dskill;
    $("dskill").innerHTML = g.skills.map(function (s) {
      return "<button type='button' data-v='" + esc(s) + "' aria-pressed='" + (s === k) + "'>개념 " + esc(s) + "</button>";
    }).join("");
    var d = LA.distribution(g, k);
    var near = d.mean == null ? 0 : d.values.filter(function (x) { return Math.abs(x.p - d.mean) <= 0.15; }).length;
    $("dmean").textContent = d.mean == null ? "–" : d.mean.toFixed(2);
    $("dmeank").textContent = "개념 " + k + " 반 평균 (" + d.n + "명)";
    $("dhist").innerHTML = histSVG(d);
    var parts = [];
    if (d.mean != null) {
      parts.push(d.low >= 3 && d.high >= 3
        ? "평균 <b>" + d.mean.toFixed(2) + "</b> 뒤에 두 무리가 있습니다 — <b style='color:var(--bad)'>0.5 미만 " + d.low + "명</b>, <b style='color:var(--good)'>0.9 이상 " + d.high + "명</b>." +
          (near <= Math.max(2, d.n * 0.2) ? " 평균 ±0.15 안에 든 학생은 <b>" + near + "명</b>뿐입니다." : "")
        : "평균 <b>" + d.mean.toFixed(2) + "</b> · 0.5 미만 " + d.low + "명 · 0.9 이상 " + d.high + "명.");
    }
    if (d.thin.length) parts.push("관측 부족 " + d.thin.length + "명(" + d.thin.map(esc).join(" ") + ")은 분포에서 뺐습니다.");
    if (d.none.length) parts.push("시도 없음 " + d.none.length + "명도 뺐습니다.");
    $("dnote").innerHTML = parts.join(" ");
  }

  function histSVG(d) {
    var W = 380, H = 150, L = 26, R = 8, T = 14, B = 26, pw = W - L - R, ph = H - T - B;
    var max = Math.max.apply(null, d.bins.concat([1]));
    var step = max > 8 ? 4 : (max > 4 ? 2 : 1), top = Math.ceil(max / step) * step;
    var y = function (v) { return T + ph - v / top * ph; }, x = function (v) { return L + v * pw; };
    var s = "<svg class='chart' viewBox='0 0 " + W + " " + H + "' role='img' aria-label='숙련 확률 분포, 0.1 간격 막대'>";
    for (var t = 0; t <= top; t += step) {
      s += "<line class='gl' x1='" + L + "' x2='" + (W - R) + "' y1='" + y(t) + "' y2='" + y(t) + "'/>";
      s += "<text x='" + (L - 6) + "' y='" + (y(t) + 3.5) + "' text-anchor='end'>" + t + "</text>";
    }
    d.bins.forEach(function (c, i) {
      if (!c) return;
      var cls = i < 5 ? "lo" : (i === 9 ? "hi" : "mid");
      var bx = x(i / 10) + 2, bw = pw / 10 - 4;
      s += "<rect class='" + cls + "' x='" + bx + "' y='" + y(c) + "' width='" + bw + "' height='" + (y(0) - y(c)) + "' rx='2'/>";
      s += "<text class='cnt' x='" + (bx + bw / 2) + "' y='" + (y(c) - 4) + "' text-anchor='middle'>" + c + "</text>";
    });
    s += "<line class='ax' x1='" + L + "' x2='" + (W - R) + "' y1='" + y(0) + "' y2='" + y(0) + "'/>";
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
      s += "<text x='" + x(v) + "' y='" + (H - B + 15) + "' text-anchor='middle'>" + (v === 0 ? "0" : v === 1 ? "1.0" : v.toFixed(1)) + "</text>";
    });
    if (d.mean != null) {
      s += "<line class='meanl' x1='" + x(d.mean) + "' x2='" + x(d.mean) + "' y1='" + (T - 4) + "' y2='" + y(0) + "'/>";
      s += "<text class='meant' x='" + (x(d.mean) + (d.mean > 0.8 ? -5 : 5)) + "' y='" + (T + 4) + "' text-anchor='" + (d.mean > 0.8 ? "end" : "start") + "'>평균</text>";
    }
    return s + "</svg>";
  }

  function renderRules() {
    var m = S.rmode;
    document.querySelectorAll("#rmode button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === m)); });
    var rc = LA.ruleCounts(D.rows, m), R = LA.RULES;
    var max = Math.max.apply(null, [1, 2, 3, 4, 5].map(function (k) { return rc.counts[k]; }).concat([1]));
    $("rbars").innerHTML = [1, 2, 3, 4, 5].map(function (k) {
      var c = rc.counts[k];
      return "<div class='rbar r" + k + "'><div class='lab'><span class='no'>" + k + "</span><span class='nm'>" + R[k].short +
        "</span><span class='ps'>" + R[k].presc + "</span></div><div class='tr'><div class='fl' style='width:" + (c / max * 100) + "%'></div></div>" +
        "<div class='ct'>" + c + "</div></div>";
    }).join("");
    var share5 = rc.total ? rc.counts[5] / rc.total : 0;
    if (m === "final") {
      $("rnote").innerHTML = "학습자·개념 칸마다 <b>지금 상태 하나씩</b>, 모두 " + rc.total + "칸. 판단 보류는 " + rc.counts[5] + "칸(" + pct(share5) + ")입니다." +
        " 한 줄만 계속 걸린다면 그 규칙의 기준값부터 의심하십시오.";
    } else {
      $("rnote").innerHTML = "로그 <b>전체 " + rc.total + "줄</b>을 세면 5번이 " + rc.counts[5] + "줄(" + pct(share5) + ")입니다." +
        (share5 > 0.4 ? " 누구나 처음 두 문항은 관측이 3회 미만이라 5번을 지나가기 때문입니다. <b>무엇을 분모로 삼느냐가 지표를 바꿉니다.</b>" : "");
    }
  }

  function renderPriority() {
    var pr = LA.priority(D.g), R = LA.RULES;
    $("plist").innerHTML = pr.list.length ? pr.list.map(function (x) {
      var why = x.cells.map(function (c) {
        return c.rule === 4
          ? "개념 " + esc(c.skill) + " <b>연속 " + c.streak + "회 오답</b> · P(L) " + f2(c.p)
          : "개념 " + esc(c.skill) + " <b>관측 " + c.n + "회</b>";
      }).join("<br>");
      return "<li class='pitem " + x.kind + "'><span class='sv'></span><span class='id'>" + esc(x.learner) + "</span><span class='why'>" + why +
        "</span><span class='act'>" + esc(x.action) + "</span></li>";
    }).join("") : "<li class='notice'>지금 4번·5번 규칙에 걸린 학습자가 없습니다.</li>";
    var f = [];
    if (pr.notStarted.length) {
      var ks = {}; pr.notStarted.forEach(function (x) { x.skills.forEach(function (k) { ks[k] = 1; }); });
      f.push("<span><b>시도 없음 " + pr.notStarted.length + "명</b> — " + pr.notStarted.map(function (x) { return esc(x.learner); }).join(" ") +
        " (개념 " + Object.keys(ks).join("·") + "). 진도 문제이지 판단 대상이 아닙니다.</span>");
    }
    f.push("<span class='ok'>나머지 " + pr.steady + "명은 규칙대로 돌고 있습니다.</span>");
    f.push("<span>순위표가 아니라 <b>행동 목록</b>입니다. 이름이 아니라 가명 ID로 표시합니다.</span>");
    $("pfoot").innerHTML = f.join("");
  }

  function renderInv() {
    var pairs = prereqPairs(D.g.skills);
    if (!pairs.length) {
      $("inv").innerHTML = "";
      $("invnote").innerHTML = "이 로그의 개념 이름으로는 선수 관계를 알 수 없어 점검을 건너뜁니다. (배포 로그는 2주 분수 나눗셈 지식 구조 A~F를 씁니다.)";
      return;
    }
    var inv = LA.inversions(D.g, pairs), by = {};
    inv.forEach(function (x) { (by[x.learner] = by[x.learner] || []).push(x); });
    var ids = Object.keys(by).sort(LA.natCmp);
    $("inv").innerHTML = ids.length ? ids.map(function (l) {
      return "<li><span class='id'>" + esc(l) + "</span><span class='pp'>" + by[l].map(function (x) {
        return esc(x.pre) + " " + f2(x.pPre) + " → <b>" + esc(x.post) + " " + f2(x.pPost) + "</b>";
      }).join(" · ") + "</span></li>";
    }).join("") : "<li>역전된 칸이 없습니다.</li>";
    $("invnote").innerHTML = (ids.length ? "선수 개념을 모르는데 뒤 개념을 안다면, 학생보다 <b>지식 구조나 문항 태그</b>를 먼저 의심합니다. " : "") +
      "<b>읽을 때 주의</b> — 이 로그에는 문항마다 <b>대표 개념 하나의 확률만</b> 남습니다. 격자의 C 값은 C가 대표인 마지막 문항 직후 값이라, 그 뒤 E·F 문항에서 C가 함께 쓰인 결과는 로그에 없습니다. 무엇을 기록할지부터 정하라는 M1의 말이 이 자리입니다.";
  }

  // ── 실습 1 · 지표 표 ──────────────────────────────────────────
  function renderMetrics() {
    var box = $("mrows");
    box.innerHTML = S.metrics.map(function (m, i) {
      var li = LA.lintDecision(m.decision), named = String(m.name || "").trim();
      var msg = !named && !String(m.decision || "").trim() ? "" : (li.level === "ok" ? "✓ 결정이 있습니다" : li.msg);
      return "<div class='mrow' data-i='" + i + "'><div class='no'>" + (i + 1) + "</div><div class='body'>" +
        "<div class='fld full'><label for='md" + i + "'><b>① 이 지표가 바꾸는 결정</b> — 먼저 적으십시오</label>" +
        "<input class='in" + (named && li.level !== "ok" ? " need" : "") + "' id='md" + i + "' data-f='decision' value='" + esc(m.decision) + "' placeholder='누가 무엇을 바꾸는가 — 예: 누구에게 먼저 갈지'></div>" +
        "<div class='fld'><label for='mn" + i + "'>② 지표</label><input class='in' id='mn" + i + "' data-f='name' value='" + esc(m.name) + "' placeholder='예: 개념별 관측 수'></div>" +
        "<div class='fld'><label for='mc" + i + "'>③ 어떻게 계산</label><input class='in' id='mc" + i + "' data-f='calc' value='" + esc(m.calc) + "' placeholder='예: 학습자·개념별 n_obs의 마지막 값'></div>" +
        "</div><div class='foot'><span class='lint " + (msg ? li.level : "") + "' id='ml" + i + "'>" + esc(msg) + "</span>" +
        (S.metrics.length > 1 ? "<button class='btn tiny ghost danger' data-del='" + i + "' type='button'>이 줄 빼기</button>" : "") + "</div></div>";
    }).join("");
    $("refl").innerHTML = REF_METRICS.map(function (r, i) {
      return "<li><div><div class='nm'>" + esc(r.name) + "</div><div class='cl'>" + esc(r.calc) + "</div></div>" +
        "<button class='btn tiny' type='button' data-ref='" + i + "'>가져오기</button></li>";
    }).join("");
    renderMetricTable();
  }
  function renderMetricTable() {
    var rows = S.metrics.filter(function (m) { return String(m.name || "").trim() || String(m.decision || "").trim(); });
    var cm = LA.checkMetrics(S.metrics);
    $("mstat").textContent = cm.count ? "결정이 있는 지표 " + cm.withDecision + " / " + cm.count : "아직 적은 지표가 없습니다";
    $("mtable").innerHTML = "<thead><tr><th>지표</th><th>어떻게 계산</th><th>이 지표가 바꾸는 결정</th><th></th></tr></thead><tbody>" +
      (rows.length ? rows.map(function (m) {
        var li = LA.lintDecision(m.decision);
        return "<tr><td>" + (esc(m.name) || "<span class='em'>(지표 이름 없음)</span>") + "</td><td>" + (esc(m.calc) || "<span class='em'>—</span>") +
          "</td><td>" + (esc(m.decision) || "<span class='em'>비어 있음</span>") + "</td><td class='st " + (li.level === "ok" ? "ok'>✓" : "no'>" + (li.level === "empty" ? "빼거나 채우기" : "모호함")) + "</td></tr>";
      }).join("") : "<tr><td colspan='4' class='em'>왼쪽에 적으면 여기에 제출 형식으로 모입니다.</td></tr>") + "</tbody>";
    dots();
  }
  function lintRow(i) {
    var m = S.metrics[i], li = LA.lintDecision(m.decision), named = String(m.name || "").trim();
    var el = $("ml" + i), msg = !named && !String(m.decision || "").trim() ? "" : (li.level === "ok" ? "✓ 결정이 있습니다" : li.msg);
    if (el) { el.className = "lint " + (msg ? li.level : ""); el.textContent = msg; }
    var inp = $("md" + i); if (inp) inp.classList.toggle("need", !!named && li.level !== "ok");
  }

  // ── 실습 2 · 화면 스케치 ──────────────────────────────────────
  var MK = "①②③④⑤⑥⑦⑧⑨⑩";
  function glyph(w) {
    switch (w.kind) {
      case "action": return "<div class='g-btn'>" + (esc(w.name) || "다음 행동") + "  →</div>";
      case "progress": return "<div class='g-prog'><i></i><b></b><span style='left:62%'>지금</span><span style='left:84%'>목표</span></div>";
      case "text": return "<div class='g-lines'><i></i><i></i></div>";
      case "number": return "<div class='g-num'>0.62<small>숫자 하나</small></div>";
      case "spark": return "<svg class='g-spark' viewBox='0 0 100 28' preserveAspectRatio='none'><polyline points='2,20 20,22 38,14 56,17 74,9 96,6'/><circle cx='96' cy='6' r='2.6'/></svg>";
      case "queue": return "<div class='g-q'><i></i><i></i><i></i><i></i></div>";
      case "grid": return "<div class='g-mos'>" + new Array(37).join("<i></i>") + "</div>";
      case "hist": return "<div class='g-hist'>" + [60, 20, 30, 30, 25, 8, 8, 12, 70, 95].map(function (h) { return "<i style='height:" + h + "%'></i>"; }).join("") + "</div>";
      case "bar": return "<div class='g-hbar'><i style='width:40%'></i><i style='width:95%'></i><i style='width:62%'></i><i style='width:18%;background:var(--bad)'></i><i style='width:14%;background:var(--warn)'></i></div>";
      case "table": return "<div class='g-tbl'>" + new Array(17).join("<i></i>") + "</div>";
      case "rank": return "<div class='g-rank'><span>1</span><span>2</span><span>3</span></div>";
      default: return "<div class='g-lines'><i></i><i></i></div>";
    }
  }
  function renderSketch(skipEditor) {
    var sk = S.sketch;
    $("exBadge").hidden = !sk.isExample;
    $("exHint").hidden = !sk.isExample;
    ["learner", "teacher"].forEach(function (scr) {
      var sfx = scr === "learner" ? "L" : "T", ws = sk[scr];
      var chk = LA.checkSketch(scr, ws);
      $("chk" + sfx).innerHTML = chk.checks.map(function (c) {
        return "<li class='" + (c.ok ? "ok" : "no") + "'><span class='m'>" + (c.ok ? "✓" : "!") + "</span><span>" + esc(c.msg) + "</span></li>";
      }).join("");
      var live = ws.map(function (w, i) { return { w: w, i: i }; }).filter(function (x) { return String(x.w.name || "").trim() || x.w.kind; });
      $("frame" + sfx).innerHTML = "<div class='fbar'><span>" + (scr === "learner" ? "학습자" : "교사") + "</span><span>" + (scr === "learner" ? "나 하나 · 지금" : "학급 전체 · 이번 주") + "</span></div>" +
        (live.length ? live.map(function (x, n) {
          var li = LA.lintDecision(x.w.decision), fl = li.level !== "ok";
          return "<div class='wf" + (fl ? " flag" : "") + "'><span class='mk'>" + (MK[n] || n + 1) + "</span>" +
            (fl ? "<span class='tag'>" + (li.level === "empty" ? "결정 없음" : "결정 모호") + "</span>" : "") +
            (x.w.kind === "action" ? "" : "<div class='wt'>" + (esc(x.w.name) || "<span style='color:var(--muted)'>(이름 없음)</span>") + "</div>") +
            glyph(x.w) + "</div>";
        }).join("") : "<div class='empty'>아래에서 위젯을 넣으면 여기에 그려집니다.</div>");
      $("annot" + sfx).innerHTML = live.map(function (x, n) {
        var li = LA.lintDecision(x.w.decision);
        if (li.level === "ok") return "<li><span class='mk'>" + (MK[n] || n + 1) + "</span><span class='d'><span class='k'>결정</span>" + esc(x.w.decision) + "</span></li>";
        return "<li class='flag'><span class='mk'>" + (MK[n] || n + 1) + "</span><span class='d'>" +
          (li.level === "empty" ? "결정 없음 — 뺄 후보입니다. 결정을 적거나 빼십시오." : esc(li.msg)) + "</span></li>";
      }).join("");
      if (!skipEditor) renderWed(scr);
    });
    dots();
  }
  function kindOptions(sel) {
    return Object.keys(LA.KINDS).map(function (k) {
      return "<option value='" + k + "'" + (k === sel ? " selected" : "") + ">" + esc(LA.KINDS[k].label) + "</option>";
    }).join("");
  }
  function renderWed(scr) {
    var sfx = scr === "learner" ? "L" : "T", ws = S.sketch[scr];
    $("wed" + sfx).innerHTML = ws.map(function (w, i) {
      return "<div class='wrow' data-scr='" + scr + "' data-i='" + i + "'><span class='mk'>" + (MK[i] || i + 1) + "</span>" +
        "<input class='in' data-f='name' value='" + esc(w.name) + "' placeholder='위젯 이름' aria-label='" + (i + 1) + "번 위젯 이름'>" +
        "<select class='in' data-f='kind' aria-label='" + (i + 1) + "번 위젯 형태'>" + kindOptions(w.kind) + "</select>" +
        "<button class='del' type='button' data-delw='" + i + "' aria-label='" + (i + 1) + "번 위젯 빼기' title='이 위젯 빼기'>×</button>" +
        "<input class='in dec' data-f='decision' value='" + esc(w.decision) + "' placeholder='이 위젯이 바꾸는 결정' aria-label='" + (i + 1) + "번 위젯이 바꾸는 결정'>" +
        "</div>";
    }).join("") + "<button class='btn addw' type='button' data-addw='" + scr + "'>+ 위젯 추가</button>";
  }

  // ── 실습 3·4 ─────────────────────────────────────────────────
  function frameSVG(v) {
    var me = 0.62, base = 62, hgt = 52, bh = me * hgt;
    var s = "<svg viewBox='0 0 140 78' aria-hidden='true'>";
    s += "<rect class='me' x='16' y='" + (base - bh) + "' width='26' height='" + bh + "' rx='2'/>";
    s += "<text class='v' x='29' y='74' text-anchor='middle'>0.62</text>";
    if (v === "past") {
      [[0.31, "2주 전"], [0.45, "1주 전"]].forEach(function (p, i) {
        var bx = 56 + i * 38;
        s += "<rect class='ref' x='" + bx + "' y='" + (base - p[0] * hgt) + "' width='18' height='" + (p[0] * hgt) + "' rx='2'/>";
        s += "<text x='" + (bx + 9) + "' y='74' text-anchor='middle'>" + p[1] + "</text>";
      });
    } else if (v === "goal") {
      var yg = base - 0.8 * hgt; s += "<line class='ln' x1='10' x2='82' y1='" + yg + "' y2='" + yg + "'/><text x='86' y='" + (yg + 3) + "'>목표 .80</text>";
    } else if (v === "peer") {
      var yp = base - 0.58 * hgt; s += "<line class='ln peer' x1='10' x2='82' y1='" + yp + "' y2='" + yp + "'/><text x='86' y='" + (yp + 3) + "'>또래 .58</text>";
    }
    return s + "</svg>";
  }
  function renderFrame() {
    $("fchoices").innerHTML = FRAMES.map(function (f) {
      return "<button type='button' class='fch' data-v='" + f.v + "' aria-pressed='" + (S.frame.choice === f.v) + "'><span class='t'>" + f.t + "</span>" +
        frameSVG(f.v) + "<span class='c'>" + f.c + "</span></button>";
    }).join("");
    $("peerBox").hidden = S.frame.choice !== "peer";
    $("fPeer").value = S.frame.peer; $("fWhy").value = S.frame.why;
    lintPeer();
    $("thinopt").innerHTML = THIN.map(function (t) {
      return "<button type='button' class='topt' data-v='" + t.v + "' aria-pressed='" + (S.drop.mode === t.v) + "'>" +
        (t.pv ? "<span class='pv'>" + t.pv + "</span>" : "") + "<span>" + t.t + "</span></button>";
    }).join("");
    $("fDrop").value = S.drop.w; $("fDropWhy").value = S.drop.why; $("fThin").value = S.drop.how;
    dots();
  }
  function lintPeer() {
    var t = S.frame.peer.trim(), el = $("peerLint");
    if (S.frame.choice !== "peer") { el.textContent = ""; return; }
    if (!t) { el.className = "lint empty"; el.textContent = "또래를 고르면 누구를 또래로 뽑을지까지 적어야 합니다."; }
    else if (/(반|학급|전체|학년)\s*(전체\s*)?평균/.test(t)) { el.className = "lint vague"; el.textContent = "반 전체 평균은 강의에서 본 조건(목표가 비슷한 또래, 약간의 상향 비교)을 만족하지 않습니다."; }
    else { el.className = "lint ok"; el.textContent = "✓ 또래 선정 기준이 있습니다"; }
  }

  // ── 진행 표시 · 제출 정리 ────────────────────────────────────
  function status() {
    var cm = LA.checkMetrics(S.metrics);
    var m = cm.count >= 3 && cm.withDecision === cm.count ? "ok" : (cm.count ? "part" : "");
    var cl = LA.checkSketch("learner", S.sketch.learner), ct = LA.checkSketch("teacher", S.sketch.teacher);
    var allOk = cl.checks.every(function (c) { return c.ok; }) && ct.checks.every(function (c) { return c.ok; });
    var sk = S.sketch.isExample ? "part" : (allOk ? "ok" : (cl.count + ct.count ? "part" : ""));
    var f = S.frame, dp = S.drop;
    var fOk = f.choice && f.why.trim() && (f.choice !== "peer" || f.peer.trim());
    var dOk = dp.w.trim() && dp.why.trim() && (dp.mode || dp.how.trim());
    var fr = fOk && dOk ? "ok" : (f.choice || f.why || dp.w || dp.why || dp.mode || dp.how ? "part" : "");
    return { m: m, sk: sk, fr: fr, fOk: !!fOk, dOk: !!dOk, cm: cm, cl: cl, ct: ct };
  }
  function dots() {
    var st = status();
    $("dot1").className = "dot " + st.m; $("dot2").className = "dot " + st.sk; $("dot3").className = "dot " + st.fr;
  }
  function kindLabel(k) { return LA.KINDS[k] ? LA.KINDS[k].label : ""; }
  function summaryText() {
    var L = [], f = S.frame, dp = S.drop;
    L.push("[4주 실습] 학습 분석과 대시보드");
    L.push("");
    L.push("■ 1. 지표 세 개");
    var ms = S.metrics.filter(function (m) { return String(m.name || "").trim(); });
    if (!ms.length) L.push("  (아직 없음)");
    ms.forEach(function (m, i) {
      L.push("  " + (MK[i] || i + 1) + " 지표: " + m.name.trim());
      L.push("     계산: " + (String(m.calc || "").trim() || "(비어 있음)"));
      L.push("     바꾸는 결정: " + (String(m.decision || "").trim() || "(비어 있음 — 빼거나 채울 것)"));
    });
    L.push("");
    L.push("■ 2. 화면 스케치 두 장 (그림은 따로 첨부)" + (S.sketch.isExample ? "  ※ 아직 교수자 예시 그대로입니다" : ""));
    [["learner", "학습자 화면"], ["teacher", "교사 화면"]].forEach(function (p) {
      L.push("  " + p[1]);
      var ws = S.sketch[p[0]].filter(function (w) { return String(w.name || "").trim() || w.kind; });
      if (!ws.length) L.push("    (위젯 없음)");
      ws.forEach(function (w, i) {
        L.push("    " + (MK[i] || i + 1) + " " + (String(w.name || "").trim() || "(이름 없음)") + " [" + kindLabel(w.kind) + "]");
        L.push("       결정: " + (String(w.decision || "").trim() || "(없음 — 뺄 후보)"));
      });
    });
    L.push("");
    L.push("■ 3. 준거틀");
    var fc = FRAMES.filter(function (x) { return x.v === f.choice; })[0];
    L.push("  선택: " + (fc ? fc.t : "(고르지 않음)"));
    if (f.choice === "peer") L.push("  또래 선정: " + (f.peer.trim() || "(비어 있음)"));
    L.push("  근거: " + (f.why.trim() || "(비어 있음)"));
    L.push("");
    L.push("■ 4. 뺀 것");
    L.push("  뺀 위젯: " + (dp.w.trim() || "(비어 있음)"));
    L.push("  이유: " + (dp.why.trim() || "(비어 있음)"));
    var tm = THIN.filter(function (x) { return x.v === dp.mode; })[0];
    L.push("  관측 부족 표시: " + (tm ? tm.t : "(고르지 않음)") + (dp.how.trim() ? " — " + dp.how.trim() : ""));
    L.push("");
    L.push("■ 한 줄 답");
    L.push("  ① 가장 어려웠던 판단: " + (S.q1.trim() || "(비어 있음)"));
    L.push("  ② 가장 뜻밖이었던 것: " + (S.q2.trim() || "(비어 있음)"));
    return L.join("\n");
  }
  function renderSummary() {
    renderSummaryLight();
    $("fQ1").value = S.q1; $("fQ2").value = S.q2;
  }
  // 입력 칸은 건드리지 않고 점검표와 미리보기만 다시 그립니다
  function renderSummaryLight() {
    var st = status();
    var items = [
      [st.m, "지표 세 개 — 결정 칸 포함", st.cm.count ? "결정 " + st.cm.withDecision + "/" + st.cm.count : "0/3"],
      [st.sk, "화면 스케치 두 장 — 위젯별 결정 주석", S.sketch.isExample ? "예시 그대로" : (st.sk === "ok" ? "두 장 통과" : "확인 필요")],
      [st.fOk ? "ok" : (S.frame.choice || S.frame.why ? "part" : ""), "준거틀 결정과 근거", ""],
      [st.dOk ? "ok" : (S.drop.w || S.drop.why || S.drop.mode ? "part" : ""), "뺀 위젯 하나 + 관측 부족 표시", ""],
      [S.q1.trim() && S.q2.trim() ? "ok" : (S.q1.trim() || S.q2.trim() ? "part" : ""), "한 줄 답 두 개", ""]
    ];
    $("clist").innerHTML = items.map(function (x) {
      var cls = x[0] || "no";
      return "<li class='" + cls + "'><span class='m'>" + (cls === "ok" ? "✓" : cls === "part" ? "…" : "·") + "</span><span>" + esc(x[1]) + "</span><span class='w'>" + esc(x[2]) + "</span></li>";
    }).join("") + "<li class='no'><span class='m'>+</span><span>다른 사람 스케치 하나에 한 줄 코멘트 — “이 위젯은 무슨 결정을 바꾸나요?”</span><span></span></li>";
    $("outText").textContent = summaryText();
  }

  // ── 탭 ───────────────────────────────────────────────────────
  var TABS = ["calc", "metric", "sketch", "frame", "sum"];
  function showTab(t, focus) {
    if (TABS.indexOf(t) < 0) t = "calc";
    S.tab = t;
    TABS.forEach(function (x) {
      var on = x === t, b = $("tab-" + x);
      b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1;
      $("p-" + x).hidden = !on;
      if (on && focus) b.focus();
    });
    if (t === "metric") renderMetrics();
    if (t === "sketch") renderSketch();
    if (t === "frame") renderFrame();
    if (t === "sum") renderSummary();
    save();
  }

  // ── 사건 연결 ────────────────────────────────────────────────
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  function wire() {
    TABS.forEach(function (x, i) {
      on($("tab-" + x), "click", function () { showTab(x); });
      on($("tab-" + x), "keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          showTab(TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length], true);
        }
      });
    });

    on($("gview"), "click", function (e) { var b = e.target.closest("button"); if (!b) return; S.gview = b.dataset.v; renderGrid(); });
    on($("mgrid"), "click", function (e) {
      var b = e.target.closest("button.mc"); if (!b || b.classList.contains("none")) return;
      var l = b.dataset.l, k = b.dataset.k;
      S.sel = S.sel && S.sel.l === l && S.sel.k === k ? null : { l: l, k: k };
      renderGrid();
    });
    on($("dskill"), "click", function (e) { var b = e.target.closest("button"); if (!b) return; S.dskill = b.dataset.v; renderDist(); });
    on($("rmode"), "click", function (e) { var b = e.target.closest("button"); if (!b) return; S.rmode = b.dataset.v; renderRules(); });

    // 실습 1
    on($("mrows"), "input", function (e) {
      var inp = e.target, row = inp.closest(".mrow"); if (!row || !inp.dataset.f) return;
      var i = +row.dataset.i; S.metrics[i][inp.dataset.f] = inp.value;
      lintRow(i); renderMetricTable(); save();
    });
    on($("mrows"), "click", function (e) {
      var b = e.target.closest("[data-del]"); if (!b) return;
      S.metrics.splice(+b.dataset.del, 1); renderMetrics(); save();
    });
    on($("btnAddM"), "click", function () {
      S.metrics.push(blankMetric()); renderMetrics(); save();
      var el = $("md" + (S.metrics.length - 1)); if (el) el.focus();
    });
    on($("refl"), "click", function (e) {
      var b = e.target.closest("[data-ref]"); if (!b) return;
      var r = REF_METRICS[+b.dataset.ref];
      var i = S.metrics.findIndex(function (m) { return !String(m.name || "").trim() && !String(m.calc || "").trim(); });
      if (i < 0) { S.metrics.push(blankMetric()); i = S.metrics.length - 1; }
      S.metrics[i].name = r.name; S.metrics[i].calc = r.calc;
      renderMetrics(); save();
      var el = $("md" + i); if (el) el.focus();
      toast("지표와 계산을 " + (i + 1) + "번 줄에 넣었습니다. 결정 칸은 직접 채우십시오.");
    });

    // 실습 2
    ["L", "T"].forEach(function (sfx) {
      var scr = sfx === "L" ? "learner" : "teacher";
      on($("wed" + sfx), "input", function (e) {
        var inp = e.target, row = inp.closest(".wrow"); if (!row || !inp.dataset.f) return;
        S.sketch[scr][+row.dataset.i][inp.dataset.f] = inp.value;
        S.sketch.isExample = false;
        renderSketch(true);  // 입력 중인 칸이 포커스를 잃지 않도록 편집기는 두고 미리보기만 갱신
        save();
      });
      on($("wed" + sfx), "change", function (e) {
        if (e.target.tagName !== "SELECT") return;
        var row = e.target.closest(".wrow"); S.sketch[scr][+row.dataset.i].kind = e.target.value;
        S.sketch.isExample = false; renderSketch(true); save();
      });
      on($("wed" + sfx), "click", function (e) {
        var d = e.target.closest("[data-delw]");
        if (d) { S.sketch[scr].splice(+d.dataset.delw, 1); S.sketch.isExample = false; renderSketch(); save(); return; }
        var a = e.target.closest("[data-addw]");
        if (a) {
          S.sketch[scr].push({ name: "", kind: scr === "learner" ? "text" : "table", decision: "" });
          S.sketch.isExample = false; renderSketch(); save();
          var rows = $("wed" + sfx).querySelectorAll(".wrow"); var last = rows[rows.length - 1];
          if (last) last.querySelector("input").focus();
        }
      });
    });
    on($("btnClearSk"), "click", function () {
      S.sketch = { isExample: false,
        learner: [{ name: "", kind: "action", decision: "" }],
        teacher: [{ name: "", kind: "queue", decision: "" }] };
      renderSketch(); save();
      toast("비웠습니다. 학습자 화면은 버튼부터, 교사 화면은 목록부터 넣어 두었습니다.");
    });
    armed($("btnExample"), function () { return !S.sketch.isExample && (S.sketch.learner.length + S.sketch.teacher.length > 2); },
      "한 번 더 누르면 내 스케치가 예시로 바뀝니다", function () { S.sketch = example(); renderSketch(); save(); });

    // 실습 3·4
    on($("fchoices"), "click", function (e) { var b = e.target.closest(".fch"); if (!b) return; S.frame.choice = b.dataset.v; renderFrame(); save(); });
    on($("fPeer"), "input", function (e) { S.frame.peer = e.target.value; lintPeer(); dots(); save(); });
    on($("fWhy"), "input", function (e) { S.frame.why = e.target.value; dots(); save(); });
    on($("thinopt"), "click", function (e) { var b = e.target.closest(".topt"); if (!b) return; S.drop.mode = b.dataset.v; renderFrame(); save(); });
    on($("fDrop"), "input", function (e) { S.drop.w = e.target.value; dots(); save(); });
    on($("fDropWhy"), "input", function (e) { S.drop.why = e.target.value; dots(); save(); });
    on($("fThin"), "input", function (e) { S.drop.how = e.target.value; dots(); save(); });

    // 정리
    on($("fQ1"), "input", function (e) { S.q1 = e.target.value; renderSummaryLight(); save(); });
    on($("fQ2"), "input", function (e) { S.q2 = e.target.value; renderSummaryLight(); save(); });
    on($("btnCopy"), "click", copyAll);
    armed($("btnReset"), function () { return true; }, "한 번 더 누르면 적은 내용이 모두 지워집니다", function () {
      S.metrics = [blankMetric(), blankMetric(), blankMetric()]; S.sketch = example();
      S.frame = { choice: "", peer: "", why: "" }; S.drop = { w: "", why: "", mode: "", how: "" }; S.q1 = ""; S.q2 = "";
      save(); renderSummary(); dots(); toast("지웠습니다.");
    });

    // 로그 바꾸기
    var dlg = $("dlgData");
    on($("btnData"), "click", function () { $("dataMsg").textContent = ""; if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); });
    on($("btnDataClose"), "click", function () { dlg.close ? dlg.close() : dlg.removeAttribute("open"); });
    on($("btnSample"), "click", function () {
      useLog(window.LA_SAMPLE_CSV, "sample", ""); dlg.close ? dlg.close() : dlg.removeAttribute("open"); toast("배포한 가상 로그로 되돌렸습니다.");
    });
    on($("btnPaste"), "click", function () { tryLoad($("pasteIn").value, "붙여 넣은 로그"); });
    on($("fileIn"), "change", function (e) { readFile(e.target.files && e.target.files[0]); e.target.value = ""; });
    var drop = $("drop");
    on(drop, "dragover", function (e) { e.preventDefault(); drop.classList.add("over"); });
    on(drop, "dragleave", function () { drop.classList.remove("over"); });
    on(drop, "drop", function (e) { e.preventDefault(); drop.classList.remove("over"); readFile(e.dataTransfer.files && e.dataTransfer.files[0]); });
  }


  // 두 번 눌러야 실행되는 버튼 (확인 창 대신)
  function armed(btn, needs, warn, act) {
    if (!btn) return;
    var t, label = btn.textContent;
    btn.addEventListener("click", function () {
      if (!needs() || btn.classList.contains("armed")) {
        clearTimeout(t); btn.classList.remove("armed"); btn.textContent = label; act(); return;
      }
      btn.classList.add("armed"); btn.textContent = "정말요? 한 번 더"; toast(warn);
      t = setTimeout(function () { btn.classList.remove("armed"); btn.textContent = label; }, 3500);
    });
  }

  function readFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { $("dataMsg").className = "lint empty"; $("dataMsg").textContent = "파일이 5MB를 넘습니다. 필요한 칸만 남겨 다시 저장하십시오."; return; }
    var r = new FileReader();
    r.onload = function () { tryLoad(String(r.result || ""), file.name); };
    r.onerror = function () { $("dataMsg").className = "lint empty"; $("dataMsg").textContent = "파일을 읽지 못했습니다. CSV(UTF-8)로 저장했는지 확인하십시오."; };
    r.readAsText(file, "utf-8");
  }
  function tryLoad(text, name) {
    var msg = $("dataMsg");
    if (!String(text || "").trim()) { msg.className = "lint empty"; msg.textContent = "내용이 비어 있습니다."; return; }
    var L = useLog(text, "mine", name);
    if (!L.rows.length) { msg.className = "lint empty"; msg.textContent = L.errors.join(" "); return; }
    var dlg = $("dlgData"); dlg.close ? dlg.close() : dlg.removeAttribute("open");
    showTab("calc");
    var extra = (L.errors.length ? " 읽지 못한 줄이 있습니다 — " + L.errors[0] : "") + (L.notes.length ? " " + L.notes[0] : "");
    toast(L.rows.length + "줄을 불러왔습니다." + extra);
  }

  function copyAll() {
    var text = summaryText();
    function fallback() {
      var pre = $("outText"), range = document.createRange(), sel = window.getSelection();
      range.selectNodeContents(pre); sel.removeAllRanges(); sel.addRange(range);
      var ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      toast(ok ? "복사했습니다. LMS 게시판에 붙여 넣으십시오." : "복사가 막혀 있습니다. 선택된 글을 Ctrl+C(⌘+C)로 복사하십시오.");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("복사했습니다. LMS 게시판에 붙여 넣으십시오."); }, fallback);
    } else fallback();
  }

  // ── 시작 ─────────────────────────────────────────────────────
  restore();
  wire();
  useLog(window.LA_SAMPLE_CSV, "sample", "");
  showTab(S.tab);
  dots();
})();
