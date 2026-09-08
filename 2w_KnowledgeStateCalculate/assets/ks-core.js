/*
 * ks-core.js — 지식공간이론 계산 핵심 로직
 * ------------------------------------------------------------------
 * 이 파일에는 화면(DOM)과 관련된 코드가 하나도 없습니다.
 * 순수한 계산만 들어 있어서 어디서든 가져다 쓸 수 있고, 시험해 보기도 쉽습니다.
 *
 * 핵심 발상 한 줄:
 *   지식 구성요소가 n개면 "안다/모른다"의 조합은 2ⁿ가지이지만,
 *   선수관계를 넣으면 실제로 가능한 상태는 그보다 훨씬 적다.
 *
 * 표현 방식:
 *   지식 상태를 "비트마스크"라는 정수 하나로 나타냅니다.
 *   A=1(2⁰), B=2(2¹), C=4(2²), D=8(2³), E=16(2⁴) …
 *   예) {A, C} 는 1 + 4 = 5
 *   이렇게 하면 집합 연산이 정수 연산 한 번으로 끝납니다.
 *     s >> j & 1   → j번째 구성요소가 s에 들어 있는가
 *     s | (1<<j)   → s에 j를 넣은 집합
 *     s & ~(1<<j)  → s에서 j를 뺀 집합
 *
 * 참고: Doignon & Falmagne (1985). Spaces for the assessment of knowledge.
 *      International Journal of Man-Machine Studies, 23.
 */
(function (root) {
  "use strict";

  /** 구성요소 코드 — 최대 8개까지 다룹니다. */
  var CODES = "ABCDEFGH".split("");

  /** 비트마스크에 들어 있는 1의 개수 = 아는 구성요소의 수 */
  function popcount(x) {
    var c = 0;
    while (x) { c += x & 1; x >>= 1; }
    return c;
  }

  /** 5 → "{A,C}" 처럼 사람이 읽는 문자열로 */
  function setLabel(mask) {
    if (mask === 0) return "{ }";
    return "{" + CODES.filter(function (_, i) { return mask >> i & 1; }).join(",") + "}";
  }

  /** 5 → "A, C" */
  function codeList(mask) {
    return CODES.filter(function (_, i) { return mask >> i & 1; }).join(", ");
  }

  /**
   * 모델 하나를 계산합니다.
   *
   * @param {string[]} kcs   구성요소 이름 배열. 빈 문자열이면 "쓰지 않는 자리"로 봅니다.
   * @param {number[]} pre   pre[j] = j번째 구성요소의 선수 조건을 담은 비트마스크
   *                         예) E를 배우려면 B·C·D가 필요하면 pre[4] = 0b01110
   * @returns 계산 결과 묶음
   */
  function compute(kcs, pre) {
    var n = kcs.length;

    // 실제로 쓰는 자리만 추립니다 (이름이 비어 있으면 제외)
    var active = [];
    for (var i = 0; i < n; i++) if (String(kcs[i] || "").trim() !== "") active.push(i);
    var amask = active.reduce(function (a, i) { return a | (1 << i); }, 0);

    // 쓰지 않는 자리를 선수 조건에서도 지웁니다
    var P = pre.map(function (p) { return (p || 0) & amask; });

    // ── 1. 가능한 지식 상태를 모두 찾습니다 ──────────────────────
    // 어떤 집합 s가 "지식 상태"가 되려면:
    //   s에 들어 있는 모든 j에 대해, j의 선수 조건이 전부 s 안에 있어야 합니다.
    // 조건을 어기는 j가 하나라도 있으면 그 조합은 현실에 존재할 수 없습니다.
    var states = [];
    for (var s = 0; s < (1 << n); s++) {
      if ((s & ~amask) !== 0) continue;            // 쓰지 않는 자리가 켜진 조합은 건너뜀
      var ok = true;
      for (var j = 0; j < n; j++) {
        if (s >> j & 1) {
          if ((P[j] & ~s) !== 0) { ok = false; break; }  // 선수 조건 중 빠진 것이 있음
        }
      }
      if (ok) states.push(s);
    }
    var stateSet = new Set(states);

    // ── 2. outer fringe — 지금 배울 수 있는 것 ────────────────────
    // s에 아직 없으면서, 선수 조건이 이미 s 안에 다 갖춰진 구성요소들.
    // ALEKS가 학습자에게 매번 보여 주는 목록이 정확히 이것입니다.
    function outerFringe(s) {
      var out = [];
      for (var k = 0; k < active.length; k++) {
        var j = active[k];
        if (!(s >> j & 1) && (P[j] & ~s) === 0) out.push(j);
      }
      return out;
    }

    // ── 3. inner fringe — 가장 최근에 익힌 것 ────────────────────
    // s에서 빼도 여전히 지식 상태가 되는 구성요소들. 복습 대상을 고를 때 씁니다.
    function innerFringe(s) {
      var out = [];
      for (var k = 0; k < active.length; k++) {
        var j = active[k];
        if ((s >> j & 1) && stateSet.has(s & ~(1 << j))) out.push(j);
      }
      return out;
    }

    // ── 4. 학습 경로의 수 ─────────────────────────────────────────
    // { } 에서 그 상태까지 한 번에 하나씩 배워 도달하는 순서가 몇 가지인지.
    // 아는 것이 적은 상태부터 차례로 계산하면(동적 계획법) 한 번에 구해집니다.
    //   경로수(s) = Σ  경로수(s에서 마지막 하나를 뺀 상태)
    var ordered = states.slice().sort(function (a, b) {
      return popcount(a) - popcount(b) || a - b;
    });
    var paths = {};
    ordered.forEach(function (s) {
      if (s === 0) { paths[s] = 1; return; }
      paths[s] = innerFringe(s).reduce(function (acc, j) {
        return acc + (paths[s & ~(1 << j)] || 0);
      }, 0);
    });

    // ── 5. 실제로 도달할 수 없는 구성요소 찾기 ────────────────────
    // "어떤 상태에 들어 있는가"만 보면 상호 순환(A↔B)을 놓칩니다.
    // A를 배우려면 B가, B를 배우려면 A가 필요한 경우 {A,B}는 조건을 만족하지만
    // 하나씩 배워서는 결코 도달할 수 없습니다 — 경로 수가 0입니다.
    // 그래서 "경로가 하나라도 있는 상태"에 등장하는지를 봅니다.
    var reachable = states.filter(function (s) { return paths[s] > 0; });
    var reachableSet = new Set(reachable);
    var unreachable = active.filter(function (j) {
      return !reachable.some(function (s) { return s >> j & 1; });
    });

    return {
      n: n,
      active: active,
      activeMask: amask,
      pre: P,
      states: ordered,
      stateSet: stateSet,
      outerFringe: outerFringe,
      innerFringe: innerFringe,
      paths: paths,
      reachable: reachable,
      reachableSet: reachableSet,
      full: amask,
      totalPaths: stateSet.has(amask) ? paths[amask] : 0,
      totalCombinations: Math.pow(2, active.length),
      unreachable: unreachable
    };
  }

  /**
   * Q-matrix 진단 — 어떤 구성요소가 의심되는가.
   *
   * 판정 규칙 (집합 논리만 사용):
   *   yes  ✓  그 구성요소 하나만 요구하는 문항을 맞혔음 → 알고 있다고 봄
   *   sus  ◎  모든 오답이 이 구성요소를 요구하고, 이것을 요구하는 정답 문항이 없음
   *   wob  △  모든 오답이 요구하지만, 이것을 요구하는 정답 문항도 있음 → 판정이 흔들림
   *   no   ·  오답 중에 이 구성요소를 요구하지 않는 문항이 있음 → 이것 때문은 아님
   *   none —  오답이 하나도 없음
   *
   * 주의: 이 방법은 "찍어서 맞힘"과 "알면서 실수"를 구분하지 못합니다.
   *      그 둘을 확률로 다루는 것이 베이즈 지식 추적(BKT)입니다.
   */
  function diagnose(model, itemMasks, responses) {
    var am = model.activeMask;
    var wrong = [], right = [];
    itemMasks.forEach(function (m, i) {
      var v = responses[i];
      if (v === "X") wrong.push(m & am);
      else if (v === "O") right.push(m & am);
    });

    var result = {};
    model.active.forEach(function (j) {
      var bit = 1 << j;
      var w = wrong.filter(function (m) { return m & bit; }).length;
      var g = right.filter(function (m) { return m & bit; }).length;
      var solo = right.some(function (m) { return m === bit; });  // 단독 문항을 맞혔는가
      var v;
      if (!wrong.length) v = "none";
      else if (solo) v = "yes";
      else if (w < wrong.length) v = "no";
      else if (g === 0) v = "sus";
      else v = "wob";
      result[j] = { wrongCount: w, rightCount: g, solo: solo, verdict: v };
    });
    return { result: result, wrongTotal: wrong.length, rightTotal: right.length };
  }

  // ── 저장·공유용 직렬화 ────────────────────────────────────────
  function toB64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64(b64) {
    var s = b64.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
    return new TextDecoder().decode(bytes);
  }
  /** 모델 전체를 URL에 담을 수 있는 짧은 문자열로 */
  function encodeState(state) { return toB64(JSON.stringify(state)); }
  function decodeState(str) { return JSON.parse(fromB64(str)); }

  root.KS = {
    CODES: CODES,
    popcount: popcount,
    setLabel: setLabel,
    codeList: codeList,
    compute: compute,
    diagnose: diagnose,
    encodeState: encodeState,
    decodeState: decodeState
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) module.exports = globalThis.KS;
