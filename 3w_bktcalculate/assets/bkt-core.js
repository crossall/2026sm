/*
 * bkt-core.js — 베이즈 지식 추적(BKT) 계산 핵심 로직
 * ------------------------------------------------------------------
 * 이 파일에는 화면(DOM)과 관련된 코드가 하나도 없습니다.
 * 순수한 계산만 들어 있어서 어디서든 가져다 쓸 수 있고, 시험해 보기도 쉽습니다.
 *
 * 핵심 발상 한 줄:
 *   "이 학생이 지금 이 개념을 아는가"를 0과 1이 아니라 확률 하나로 들고 있으면서,
 *   응답이 하나 들어올 때마다 그 확률을 갱신한다.
 *
 * 네 모수:
 *   L0  사전 지식  — 배우기 전부터 알고 있을 확률
 *   T   학습률    — 한 번 시도하면 새로 알게 될 확률
 *   G   추측      — 모르는데 맞힐 확률
 *   S   실수      — 아는데 틀릴 확률
 *
 * 갱신은 두 단계입니다.
 *   1단계 되돌아보기 — 응답을 보고 "아까 아는 상태였을 확률"을 다시 계산 (베이즈)
 *   2단계 학습 반영  — 아직 모르는 몫에 T를 곱해 더함 (시도 자체가 배울 기회였으므로)
 *
 * 참고: Corbett, A. T., & Anderson, J. R. (1995). Knowledge tracing. UMUAI, 4(4).
 */
(function (root) {
  "use strict";

  var DEFAULTS = { L0: 0.30, T: 0.10, G: 0.20, S: 0.10, mastery: 0.95 };
  var RULE_DEFAULTS = { mastery: 0.95, mid: 0.50, minObs: 3, streak: 3 };

  function clamp(x, lo, hi) {
    x = Number(x);
    if (!isFinite(x)) return lo;
    return x < lo ? lo : (x > hi ? hi : x);
  }

  /** 모수를 안전한 범위로 다듬습니다. 화면 입력을 그대로 믿지 않기 위한 것입니다. */
  function normalize(p) {
    p = p || {};
    return {
      L0: clamp(p.L0 != null ? p.L0 : DEFAULTS.L0, 0, 0.999),
      T: clamp(p.T != null ? p.T : DEFAULTS.T, 0, 1),
      G: clamp(p.G != null ? p.G : DEFAULTS.G, 0, 0.999),
      S: clamp(p.S != null ? p.S : DEFAULTS.S, 0, 0.999),
      mastery: clamp(p.mastery != null ? p.mastery : DEFAULTS.mastery, 0.5, 0.999)
    };
  }

  /**
   * 응답 하나를 반영해 확률을 갱신합니다.
   * @param {number}  L        갱신 전 P(L)
   * @param {boolean} correct  맞혔으면 true
   * @param {object}  p        모수 {T,G,S}
   * @returns {{prior,pCorrect,post,next}}
   *   prior    갱신 전 확률
   *   pCorrect 이 문항을 맞힐 것으로 예측되는 확률
   *   post     응답을 보고 되돌아본 확률 (1단계)
   *   next     학습을 반영한 확률 (2단계) — 다음 시도의 prior가 됩니다
   */
  function step(L, correct, p) {
    var pc = L * (1 - p.S) + (1 - L) * p.G;
    var post;
    if (correct) {
      post = pc > 0 ? (L * (1 - p.S)) / pc : L;
    } else {
      var pw = 1 - pc;
      post = pw > 0 ? (L * p.S) / pw : L;
    }
    var next = post + (1 - post) * p.T;
    return { prior: L, pCorrect: pc, post: post, next: next };
  }

  /**
   * 응답 배열을 처음부터 끝까지 돌립니다.
   * @param {object} params    모수
   * @param {boolean[]} responses  true=정답, false=오답
   * @returns {object[]} 시도별 계산 결과
   */
  function run(params, responses) {
    var p = normalize(params);
    var L = p.L0, out = [];
    for (var i = 0; i < responses.length; i++) {
      var s = step(L, !!responses[i], p);
      s.index = i + 1;
      s.correct = !!responses[i];
      s.mastered = s.next >= p.mastery;
      s.delta = s.next - s.prior;
      out.push(s);
      L = s.next;
    }
    return out;
  }

  /**
   * 이 응답이 담고 있는 증거의 세기. 로그 승산(log-odds) 단위입니다.
   *
   * 확률의 변화폭만 보면 헷갈립니다. 같은 응답이라도 지금 확률이 어디에 있느냐에 따라
   * 움직이는 폭이 달라지기 때문입니다. (P(L)=0.3에서는 정답이 더 크게 움직이고,
   * P(L)=0.6 이상에서는 오답이 더 크게 움직입니다.)
   * 이 값은 P(L)과 무관하게 "응답 하나가 실어 나르는 정보의 양"을 나타냅니다.
   *
   * 기본 모수(G=0.2, S=0.1)에서 정답은 1.50, 오답은 -2.08입니다.
   * 오답 쪽이 1.4배쯤 무겁습니다. P(S)가 작을수록 그 차이가 커집니다.
   */
  function evidence(correct, params) {
    var p = normalize(params);
    return correct ? Math.log((1 - p.S) / p.G) : Math.log(p.S / (1 - p.G));
  }

  /** 숙련에 처음 도달한 시도 번호. 도달하지 못하면 null. */
  function firstMastery(rows, mastery) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].next >= mastery) return i + 1;
    }
    return null;
  }

  /**
   * 연속 정답만 넣었을 때 숙련까지 몇 문제가 걸리는지.
   * @returns {number|null} 문제 수. max 안에 도달 못 하면 null.
   */
  function attemptsToMastery(params, max) {
    var p = normalize(params);
    max = max || 30;
    var L = p.L0;
    for (var i = 1; i <= max; i++) {
      L = step(L, true, p).next;
      if (L >= p.mastery) return i;
    }
    return null;
  }

  /** 연속 정답일 때의 확률 곡선. 그래프용. */
  function curve(params, n) {
    var p = normalize(params);
    n = n || 12;
    var L = p.L0, out = [L];
    for (var i = 0; i < n; i++) { L = step(L, true, p).next; out.push(L); }
    return out;
  }

  /**
   * 모수가 해석 불가능한 상태인지 봅니다.
   * G + S >= 1 이면 "모르는 쪽이 더 잘 맞힌다"는 뜻이 되어 모형이 뒤집힙니다.
   * @returns {{level,text}|null}  level: "bad" | "warn"
   */
  function degenerate(params) {
    var p = normalize(params);
    if (p.G + p.S >= 1) {
      return {
        level: "bad",
        text: "퇴화 모델입니다. P(G) + P(S) = " + (p.G + p.S).toFixed(2) +
          " 로 1 이상이어서, 모르는 학생이 아는 학생보다 잘 맞힌다는 뜻이 됩니다."
      };
    }
    if (p.G > 0.5) {
      return { level: "warn", text: "P(G)가 0.5를 넘습니다. 모르는 학생이 절반 넘게 맞힌다는 뜻이니 선택지 수를 다시 확인하십시오." };
    }
    if (p.S > 0.5) {
      return { level: "warn", text: "P(S)가 0.5를 넘습니다. 아는 학생이 절반 넘게 틀린다는 뜻입니다." };
    }
    if (p.T === 0) {
      return { level: "warn", text: "P(T)가 0이면 학습이 일어나지 않는 모형입니다. 틀리면 확률이 회복되지 않습니다." };
    }
    return null;
  }

  /**
   * 모수 하나만 바꿔 가며 숙련 도달 문제 수를 냅니다.
   * @param {object} params 기준 모수
   * @param {string} key    "G" 또는 "S" 또는 "T" 또는 "L0"
   * @param {number[]} values 바꿔 볼 값들
   */
  function sensitivity(params, key, values, max) {
    var base = normalize(params);
    return values.map(function (v) {
      var p = Object.assign({}, base);
      p[key] = v;
      return {
        value: v,
        attempts: attemptsToMastery(p, max || 15),
        final: curve(p, max || 15).pop()
      };
    });
  }

  // ── 규칙표 ────────────────────────────────────────────────────
  // 순서가 중요합니다. 관측 부족과 연속 오답을 먼저 보고, 그다음에 확률을 봅니다.
  // 확률부터 보면 데이터가 적은 학생이 계속 "선수 개념으로" 규칙에 걸립니다.
  /**
   * 지금 상태에 걸리는 규칙 번호(1~5).
   * @param {{pL,count,streak}} obs  현재 확률 · 그 개념의 관측 수 · 연속 오답 수
   * @param {object} th  기준값 {mastery,mid,minObs,streak}
   */
  function ruleFor(obs, th) {
    th = Object.assign({}, RULE_DEFAULTS, th || {});
    var count = Number(obs.count) || 0;
    var streak = Number(obs.streak) || 0;
    var pL = Number(obs.pL) || 0;
    if (count < th.minObs) return 5;
    if (streak >= th.streak) return 4;
    if (pL >= th.mastery) return 1;
    if (pL >= th.mid) return 2;
    return 3;
  }

  /** 규칙 조건을 사람이 읽을 문장으로. 기준값이 바뀌면 문장도 바뀝니다. */
  function ruleConditions(th) {
    th = Object.assign({}, RULE_DEFAULTS, th || {});
    return [
      "P(L) ≥ " + th.mastery.toFixed(2),
      th.mid.toFixed(2) + " ≤ P(L) < " + th.mastery.toFixed(2),
      "P(L) < " + th.mid.toFixed(2),
      "같은 개념 " + th.streak + "회 연속 오답",
      "관측 수 < " + th.minObs
    ];
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
  function encodeState(state) { return toB64(JSON.stringify(state)); }
  function decodeState(str) { return JSON.parse(fromB64(str)); }

  root.BKT = {
    DEFAULTS: DEFAULTS,
    RULE_DEFAULTS: RULE_DEFAULTS,
    normalize: normalize,
    step: step,
    run: run,
    evidence: evidence,
    firstMastery: firstMastery,
    attemptsToMastery: attemptsToMastery,
    curve: curve,
    degenerate: degenerate,
    sensitivity: sensitivity,
    ruleFor: ruleFor,
    ruleConditions: ruleConditions,
    encodeState: encodeState,
    decodeState: decodeState
  };
})(typeof window !== "undefined" ? window : globalThis);

if (typeof module !== "undefined" && module.exports) module.exports = globalThis.BKT;
