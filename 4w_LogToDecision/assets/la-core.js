/*
 * la-core.js — 학습 로그를 지표로 바꾸는 계산 로직
 * ------------------------------------------------------------------
 * 이 파일에는 화면(DOM)과 관련된 코드가 하나도 없습니다.
 * 로그(CSV) 한 덩어리를 받아 강의에서 본 지표들을 계산해 돌려줄 뿐입니다.
 *
 * 흐름 한 줄:
 *   로그 → (피벗) → 개념 × 학습자 격자 → 지표 → 화면 → 결정
 *
 * 격자의 한 칸은 반드시 셋 중 하나입니다. 이 셋을 섞으면 3주 규칙표 5번 줄이 화면에서 죽습니다.
 *   ok    판단 가능 — 관측이 기준 이상. 숙련 확률을 색으로 칠함
 *   thin  관측 부족 — 확률 값이 있어도 색으로 칠하지 않음 (판단 보류)
 *   none  시도 없음 — 아직 한 문항도 풀지 않음
 *
 * "마지막 값"을 쓰는 이유: 숙련 확률은 누적되는 값이라 평균을 내면 의미가 없습니다.
 * 한 학습자·한 개념에 대해 로그의 가장 아래 줄이 그 개념의 현재 상태입니다.
 */
(function (root) {
  "use strict";

  // 3주 규칙표의 기준값 (배포 로그를 만들 때 쓴 값과 같습니다)
  var RULE_DEFAULTS = { mastery: 0.95, mid: 0.50, minObs: 3, streak: 3 };

  // 3주 규칙표 — 번호별 처방
  var RULES = {
    1: { short: "숙련", presc: "다음 개념으로" },
    2: { short: "중간", presc: "같은 개념 한 문제 더" },
    3: { short: "낮음", presc: "선수 개념으로 내려감" },
    4: { short: "연속 오답", presc: "선수 개념 진단 문항" },
    5: { short: "관측 부족", presc: "판단 보류 · 문항 추가" }
  };

  var REQUIRED = ["learner_id", "skill", "p_known_after", "n_obs"];
  var SEP = "\u0001";

  // ── CSV 읽기 ─────────────────────────────────────────────────
  /** 따옴표·쉼표·줄바꿈이 섞인 CSV도 읽습니다. 첫 줄은 머리글. */
  function parseCSV(text) {
    text = String(text || "").replace(/^﻿/, "");
    var out = [], row = [], cell = "", q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = "";
        if (row.length > 1 || row[0] !== "") out.push(row);
        row = [];
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); if (row.length > 1 || row[0] !== "") out.push(row); }
    var header = (out.shift() || []).map(function (h) { return h.trim().toLowerCase(); });
    return { header: header, records: out };
  }

  function num(x) {
    if (x === null || x === undefined) return NaN;
    var s = String(x).trim();
    if (s === "") return NaN;
    return Number(s);
  }

  /** 학습자 ID를 사람이 기대하는 순서로 (s2 < s10) */
  function natCmp(a, b) {
    var ax = String(a).match(/(\d+|\D+)/g) || [], bx = String(b).match(/(\d+|\D+)/g) || [];
    for (var i = 0; i < Math.min(ax.length, bx.length); i++) {
      var x = ax[i], y = bx[i];
      if (/^\d/.test(x) && /^\d/.test(y)) { if (+x !== +y) return +x - +y; }
      else if (x !== y) return x < y ? -1 : 1;
    }
    return ax.length - bx.length;
  }

  /** 3주 규칙표. 순서가 중요합니다 — 관측 부족 → 연속 오답 → 확률. */
  function ruleFor(pL, nObs, streak, th) {
    th = Object.assign({}, RULE_DEFAULTS, th || {});
    if (nObs < th.minObs) return 5;
    if (streak >= th.streak) return 4;
    if (pL >= th.mastery) return 1;
    if (pL >= th.mid) return 2;
    return 3;
  }

  /**
   * CSV 문자열 → 로그 행 배열.
   * 필수 칸: learner_id, skill, p_known_after, n_obs
   * 선택 칸: item_id, correct, streak, rule_fired (없으면 계산해서 채우고 알려 줍니다)
   * @returns {{rows, columns, errors:string[], notes:string[]}}
   */
  function loadLog(text, th) {
    var parsed = parseCSV(text);
    var H = parsed.header, errors = [], notes = [];
    var missing = REQUIRED.filter(function (k) { return H.indexOf(k) < 0; });
    if (!H.length) return { rows: [], columns: [], errors: ["내용이 비어 있습니다. 첫 줄에 칸 이름이 있는 CSV를 넣으십시오."], notes: [] };
    if (missing.length) {
      return { rows: [], columns: H, notes: [],
        errors: ["꼭 있어야 할 칸이 없습니다: " + missing.join(", ") + ". 첫 줄의 칸 이름을 확인하십시오."] };
    }
    var col = {}; H.forEach(function (h, i) { col[h] = i; });
    var has = function (k) { return col[k] !== undefined; };
    var rows = [];
    parsed.records.forEach(function (rec, idx) {
      var line = idx + 2;
      var get = function (k) { return has(k) ? rec[col[k]] : undefined; };
      var r = {
        line: line,
        learner_id: String(get("learner_id") || "").trim(),
        item_id: has("item_id") ? String(get("item_id")).trim() : "",
        skill: String(get("skill") || "").trim(),
        correct: has("correct") ? num(get("correct")) : NaN,
        p: num(get("p_known_after")),
        n: num(get("n_obs")),
        streak: has("streak") ? num(get("streak")) : NaN,
        rule: has("rule_fired") ? num(get("rule_fired")) : NaN
      };
      var bad = [];
      if (!r.learner_id) bad.push("learner_id 비어 있음");
      if (!r.skill) bad.push("skill 비어 있음");
      if (!(r.p >= 0 && r.p <= 1)) bad.push("p_known_after가 0~1 밖");
      if (!(r.n >= 0) || Math.floor(r.n) !== r.n) bad.push("n_obs가 0 이상의 정수가 아님");
      if (bad.length) { if (errors.length < 8) errors.push(line + "번째 줄: " + bad.join(", ")); else if (errors.length === 8) errors.push("… 더 있음"); return; }
      rows.push(r);
    });

    // streak가 없으면 correct로 계산 (같은 학습자·같은 개념의 연속 오답 수)
    if (!has("streak")) {
      if (has("correct")) {
        var run = {};
        rows.forEach(function (r) {
          var key = r.learner_id + SEP + r.skill;
          run[key] = r.correct === 0 ? (run[key] || 0) + 1 : 0;
          r.streak = run[key];
        });
        notes.push("streak 칸이 없어 correct 칸으로 연속 오답 수를 계산했습니다.");
      } else {
        rows.forEach(function (r) { r.streak = 0; });
        notes.push("streak·correct 칸이 모두 없어 연속 오답을 0으로 두었습니다. 4번 규칙은 걸리지 않습니다.");
      }
    }
    rows.forEach(function (r) { if (!(r.streak >= 0)) r.streak = 0; });
    // rule_fired가 없으면 3주 규칙표로 계산
    if (!has("rule_fired")) {
      rows.forEach(function (r) { r.rule = ruleFor(r.p, r.n, r.streak, th); });
      notes.push("rule_fired 칸이 없어 3주 규칙표 기본값(숙련 0.95 · 중간 0.50 · 관측 3회 · 연속 오답 3회)으로 계산했습니다.");
    } else {
      rows.forEach(function (r) { if (!(r.rule >= 1 && r.rule <= 5)) r.rule = ruleFor(r.p, r.n, r.streak, th); });
    }
    return { rows: rows, columns: H, errors: errors, notes: notes };
  }

  // ── 개요 ─────────────────────────────────────────────────────
  function uniq(arr) { var s = {}, o = []; arr.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  function overview(rows) {
    var learners = uniq(rows.map(function (r) { return r.learner_id; })).sort(natCmp);
    var skills = uniq(rows.map(function (r) { return r.skill; })).sort(natCmp);
    var items = uniq(rows.map(function (r) { return r.item_id; }).filter(Boolean));
    var withC = rows.filter(function (r) { return r.correct === 0 || r.correct === 1; });
    var acc = withC.length ? withC.filter(function (r) { return r.correct === 1; }).length / withC.length : null;
    var accBySkill = {};
    skills.forEach(function (k) {
      var xs = withC.filter(function (r) { return r.skill === k; });
      accBySkill[k] = xs.length ? xs.filter(function (r) { return r.correct === 1; }).length / xs.length : null;
    });
    return { nRows: rows.length, learners: learners, skills: skills, items: items, accuracy: acc, accBySkill: accBySkill };
  }

  // ── 피벗: 개념 × 학습자 격자 ─────────────────────────────────
  /** 한 학습자·한 개념의 마지막 줄 (피벗에서 "마지막 값") */
  function lastRows(rows) {
    var last = {};
    rows.forEach(function (r) { last[r.learner_id + SEP + r.skill] = r; });
    return last;
  }

  /** 색 램프 다섯 단계 (0.2 간격) */
  function bin(p) { return Math.max(0, Math.min(4, Math.floor(p * 5))); }

  /**
   * @returns {{learners, skills, minObs, cell:function(learner,skill)}}
   *   cell → {state:'ok'|'thin'|'none', p, n, streak, rule, item, bin}
   */
  function grid(rows, opt) {
    opt = opt || {};
    var minObs = opt.minObs != null ? opt.minObs : RULE_DEFAULTS.minObs;
    var ov = overview(rows), last = lastRows(rows), cells = {};
    ov.skills.forEach(function (k) {
      cells[k] = {};
      ov.learners.forEach(function (l) {
        var r = last[l + SEP + k];
        if (!r) { cells[k][l] = { state: "none" }; return; }
        cells[k][l] = {
          state: r.n < minObs ? "thin" : "ok",
          p: r.p, n: r.n, streak: r.streak, rule: r.rule, item: r.item_id, line: r.line,
          bin: bin(r.p)
        };
      });
    });
    return {
      learners: ov.learners, skills: ov.skills, minObs: minObs,
      cell: function (l, k) { return (cells[k] && cells[k][l]) || { state: "none" }; }
    };
  }

  /** 격자 상태 개수 — 화면 위 요약용 */
  function gridCounts(g) {
    var c = { ok: 0, thin: 0, none: 0 };
    g.skills.forEach(function (k) { g.learners.forEach(function (l) { c[g.cell(l, k).state]++; }); });
    return c;
  }

  // ── 평균 함정: 평균 하나 vs 분포 ─────────────────────────────
  /**
   * 관측 부족과 시도 없음은 분포에서 뺍니다. 빼고 나서 뺀 사람 수를 함께 보여 줍니다.
   * @returns {{values, mean, bins:number[10], low, high, thin:string[], none:string[], n}}
   */
  function distribution(g, skill, cut) {
    cut = Object.assign({ low: 0.5, high: 0.9 }, cut || {});
    var vals = [], thin = [], none = [];
    g.learners.forEach(function (l) {
      var c = g.cell(l, skill);
      if (c.state === "ok") vals.push({ learner: l, p: c.p });
      else if (c.state === "thin") thin.push(l);
      else none.push(l);
    });
    var bins = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    vals.forEach(function (v) { bins[Math.min(9, Math.floor(v.p * 10))]++; });
    var mean = vals.length ? vals.reduce(function (s, v) { return s + v.p; }, 0) / vals.length : null;
    return {
      values: vals, n: vals.length, mean: mean, bins: bins,
      low: vals.filter(function (v) { return v.p < cut.low; }).length,
      high: vals.filter(function (v) { return v.p >= cut.high; }).length,
      sd: vals.length ? Math.sqrt(vals.reduce(function (s, v) { return s + Math.pow(v.p - mean, 2); }, 0) / vals.length) : null,
      thin: thin, none: none
    };
  }

  // ── 시스템 자신을 보는 지표: 규칙별 발동 ─────────────────────
  /**
   * mode 'final' — 학습자·개념 칸마다 마지막 상태 하나씩 (지금 이 순간 규칙표가 내리는 처방)
   * mode 'rows'  — 로그 전체 줄 (지금까지 규칙표가 몇 번 불렸나)
   */
  function ruleCounts(rows, mode) {
    var src = mode === "rows" ? rows : (function () {
      var last = lastRows(rows), out = [];
      Object.keys(last).forEach(function (k) { out.push(last[k]); });
      return out;
    })();
    var c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    src.forEach(function (r) { if (c[r.rule] !== undefined) c[r.rule]++; });
    return { counts: c, total: src.length, holdRate: src.length ? c[5] / src.length : 0 };
  }

  // ── 교사 화면: 먼저 가야 할 학생 ─────────────────────────────
  /**
   * 지금 상태(마지막 줄)의 규칙이 4(연속 오답)나 5(관측 부족)인 학습자.
   * 연속 오답이 먼저 — 잘못된 방향으로 계속 가고 있기 때문입니다.
   * @returns {{list, notStarted, steady}}
   */
  function priority(g) {
    var by = {};
    g.learners.forEach(function (l) {
      g.skills.forEach(function (k) {
        var c = g.cell(l, k);
        if (c.state === "none") return;
        if (c.rule === 4 || c.rule === 5) {
          (by[l] = by[l] || []).push({ skill: k, rule: c.rule, streak: c.streak, n: c.n, p: c.p });
        }
      });
    });
    var list = Object.keys(by).map(function (l) {
      var cs = by[l].sort(function (a, b) { return a.rule - b.rule || b.streak - a.streak || a.n - b.n; });
      var hasStreak = cs.some(function (c) { return c.rule === 4; });
      return {
        learner: l, cells: cs,
        kind: hasStreak ? "streak" : "thin",
        maxStreak: Math.max.apply(null, cs.map(function (c) { return c.rule === 4 ? c.streak : 0; })),
        minN: Math.min.apply(null, cs.map(function (c) { return c.n; })),
        minP: Math.min.apply(null, cs.map(function (c) { return c.p; })),
        action: RULES[cs[0].rule].presc
      };
    });
    list.sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === "streak" ? -1 : 1;
      if (a.kind === "streak") return b.maxStreak - a.maxStreak || a.minP - b.minP || natCmp(a.learner, b.learner);
      return a.minN - b.minN || natCmp(a.learner, b.learner);
    });
    var notStarted = [];
    g.learners.forEach(function (l) {
      var ks = g.skills.filter(function (k) { return g.cell(l, k).state === "none"; });
      if (ks.length) notStarted.push({ learner: l, skills: ks });
    });
    var flagged = {}; list.forEach(function (x) { flagged[x.learner] = 1; });
    return { list: list, notStarted: notStarted, steady: g.learners.filter(function (l) { return !flagged[l]; }).length };
  }

  // ── 시스템 점검: 선수 개념 역전 ──────────────────────────────
  /**
   * 선수 개념은 낮은데 뒤 개념은 숙련인 칸. 학생 문제가 아니라
   * 지식 구조나 문항 설계(Q-matrix)를 의심할 신호입니다. 관측이 충분한 칸만 봅니다.
   * @param pairs [[선수, 뒤], ...]
   */
  function inversions(g, pairs, cut) {
    cut = Object.assign({ low: 0.5, high: 0.9 }, cut || {});
    var out = [];
    (pairs || []).forEach(function (pr) {
      if (g.skills.indexOf(pr[0]) < 0 || g.skills.indexOf(pr[1]) < 0) return;
      g.learners.forEach(function (l) {
        var a = g.cell(l, pr[0]), b = g.cell(l, pr[1]);
        if (a.state === "ok" && b.state === "ok" && a.p < cut.low && b.p >= cut.high)
          out.push({ learner: l, pre: pr[0], post: pr[1], pPre: a.p, pPost: b.p });
      });
    });
    return out.sort(function (x, y) { return natCmp(x.learner, y.learner) || natCmp(x.pre + x.post, y.pre + y.post); });
  }

  // ── 실습 1: 지표 표 점검 ─────────────────────────────────────
  // "파악한다"는 결정이 아닙니다. 누가 무엇을 바꾸는지가 있어야 합니다.
  var VAGUE = /(파악|확인|모니터링|현황|알\s?수\s?있|볼\s?수\s?있|보여\s?(줌|준다|주기)|살펴|참고|관찰|인식|이해하)/;
  var ACT = /(다시|먼저|추가|더\s?주|줄지|줄이|늘리|바꾸|바뀌|보내|내려|올리|넘어|넘길|배정|고르|멈추|중단|가르|재교수|복습|개입|찾아|연락|면담|수정|조정|결정|정한|정할|뺄|빼|제공|권하|안내|호출|선택|부를|갈지|갈까|할지|할까|줄까|줄지)/;

  /** @returns {{level:'empty'|'vague'|'ok', msg}} */
  function lintDecision(text) {
    var t = String(text || "").trim();
    if (!t) return { level: "empty", msg: "결정 칸이 비어 있습니다. 채우지 못하면 이 지표는 빼십시오." };
    if (VAGUE.test(t) && !ACT.test(t))
      return { level: "vague", msg: "'파악·확인·모니터링'은 결정이 아닙니다. 누가 무엇을 바꾸는지 적으십시오." };
    if (t.length < 5) return { level: "vague", msg: "너무 짧습니다. 누가, 무엇을 바꾸는지 한 줄로 적으십시오." };
    return { level: "ok", msg: "" };
  }

  /** 지표 표 전체 점검 */
  function checkMetrics(list) {
    var named = list.filter(function (m) { return String(m.name || "").trim(); });
    var res = named.map(function (m) { return lintDecision(m.decision); });
    return {
      count: named.length,
      withDecision: res.filter(function (r) { return r.level === "ok"; }).length,
      empty: res.filter(function (r) { return r.level === "empty"; }).length,
      vague: res.filter(function (r) { return r.level === "vague"; }).length,
      noCalc: named.filter(function (m) { return !String(m.calc || "").trim(); }).length
    };
  }

  // ── 실습 2: 화면 스케치 점검 ─────────────────────────────────
  var KINDS = {
    action:   { label: "다음 행동 버튼" },
    progress: { label: "진행 막대 (목표와 함께)" },
    text:     { label: "문장 (피드백·안내)" },
    number:   { label: "숫자 하나" },
    spark:    { label: "추세선 (최근 몇 회)" },
    queue:    { label: "먼저 갈 학생 목록" },
    grid:     { label: "격자 (개념 × 학생)" },
    hist:     { label: "분포 (히스토그램)" },
    bar:      { label: "막대그래프" },
    table:    { label: "표" },
    rank:     { label: "순위표" }
  };

  /**
   * @param screen 'learner' | 'teacher'
   * @param widgets [{name, kind, decision}]
   * @returns {{checks:[{ok,msg}], flagged:number[]}}
   */
  function checkSketch(screen, widgets) {
    var ws = (widgets || []).filter(function (w) { return String(w.name || "").trim() || w.kind; });
    var checks = [];
    if (screen === "learner") {
      checks.push({ ok: ws.some(function (w) { return w.kind === "action"; }),
        msg: "다음에 할 일이 보인다 (다음 행동 버튼)" });
      var rank = ws.some(function (w) { return w.kind === "rank"; });
      checks.push({ ok: !rank, msg: rank ? "순위표가 있습니다 — 학습자 화면에 다른 학생의 개별 점수는 두지 않습니다" : "다른 학생의 개별 점수가 없다" });
    } else {
      checks.push({ ok: ws.some(function (w) { return w.kind === "queue"; }),
        msg: "누구에게 먼저 갈지가 보인다 (먼저 갈 학생 목록)" });
      var rk = ws.some(function (w) { return w.kind === "rank"; });
      checks.push({ ok: !rk, msg: rk ? "순위표가 있습니다 — 순위는 서열이지 행동 목록이 아닙니다" : "순위표 대신 행동 목록을 쓴다" });
    }
    var flagged = [];
    ws.forEach(function (w, i) { if (lintDecision(w.decision).level !== "ok") flagged.push(i); });
    checks.push({ ok: ws.length > 0 && flagged.length === 0,
      msg: ws.length ? (flagged.length ? "결정 주석이 없거나 모호한 위젯 " + flagged.length + "개 — 채우거나 빼십시오" : "위젯마다 결정 주석이 있다 (" + ws.length + "개)") : "위젯을 하나 이상 넣으십시오" });
    return { checks: checks, flagged: flagged, count: ws.length };
  }

  var api = {
    RULE_DEFAULTS: RULE_DEFAULTS, RULES: RULES, KINDS: KINDS, REQUIRED: REQUIRED,
    parseCSV: parseCSV, loadLog: loadLog, natCmp: natCmp, ruleFor: ruleFor,
    overview: overview, lastRows: lastRows, bin: bin, grid: grid, gridCounts: gridCounts,
    distribution: distribution, ruleCounts: ruleCounts, priority: priority, inversions: inversions,
    lintDecision: lintDecision, checkMetrics: checkMetrics, checkSketch: checkSketch
  };
  root.LA = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
