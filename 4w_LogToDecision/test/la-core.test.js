/*
 * la-core.test.js — 지표 계산이 맞는지 확인합니다.
 * 실행:  node test/la-core.test.js
 *
 * 기대값은 로그를 만든 스크립트(gen_log4.py)와 별도로 파이썬에서 다시 계산해 둔 값이며,
 * 4주 강의 슬라이드 14번(평균 함정)·17~18번(격자)과 4주_수치출처.md 5절의 값과 같습니다.
 */
var LA = require("../assets/la-core.js");
var CSV = require("../assets/sample-log.js");

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (got !== undefined ? "   → 나온 값: " + JSON.stringify(got) : "")); }
}
function near(a, b, eps) { return Math.abs(a - b) < (eps || 0.0006); }
function section(t) { console.log("\n" + t); }

section("로그 읽기");
var L = LA.loadLog(CSV);
ok("오류 없음", L.errors.length === 0, L.errors);
ok("안내 없음 (칸이 다 있음)", L.notes.length === 0, L.notes);
ok("269줄", L.rows.length === 269, L.rows.length);
var ov = LA.overview(L.rows);
ok("학습자 25명", ov.learners.length === 25, ov.learners.length);
ok("개념 C·E·F", ov.skills.join("") === "CEF", ov.skills);
ok("문항 12개", ov.items.length === 12, ov.items.length);
ok("학습자 순서 s01 … s25", ov.learners[0] === "s01" && ov.learners[24] === "s25");
ok("전체 정답률 0.621", near(ov.accuracy, 0.6208, 0.0005), ov.accuracy);
ok("개념별 정답률 C .640 · E .596 · F .625",
  near(ov.accBySkill.C, 0.640) && near(ov.accBySkill.E, 0.5955) && near(ov.accBySkill.F, 0.625), ov.accBySkill);

section("피벗 — 격자 세 상태");
var g = LA.grid(L.rows);
var gc = LA.gridCounts(g);
ok("판단 가능 66 · 관측 부족 4 · 시도 없음 5", gc.ok === 66 && gc.thin === 4 && gc.none === 5, gc);
ok("s18 C 0.119 (마지막 값, 평균 아님)", near(g.cell("s18", "C").p, 0.119));
ok("s18 F 0.931", near(g.cell("s18", "F").p, 0.931));
ok("s18 C의 기준 문항은 q04", g.cell("s18", "C").item === "q04", g.cell("s18", "C").item);
ok("s01 C 0.531 — 평균(4회)이 아니라 마지막 줄", near(g.cell("s01", "C").p, 0.531));
var thinE = g.learners.filter(function (l) { return g.cell(l, "E").state === "thin"; });
ok("E 관측 부족 = s21 s22 s24 s25", thinE.join(" ") === "s21 s22 s24 s25", thinE);
ok("관측 수 s21 2 · s22 1 · s24 1 · s25 2",
  [2, 1, 1, 2].every(function (n, i) { return g.cell(thinE[i], "E").n === n; }));
var noneF = g.learners.filter(function (l) { return g.cell(l, "F").state === "none"; });
ok("F 시도 없음 = s21~s25", noneF.join(" ") === "s21 s22 s23 s24 s25", noneF);
ok("관측 부족 칸도 확률 값은 들고 있음 (s25 E 0.458)", near(g.cell("s25", "E").p, 0.458));
ok("색 단계: 0.119→0, 0.458→2, 0.931→4, 0.6→3", LA.bin(0.119) === 0 && LA.bin(0.458) === 2 && LA.bin(0.931) === 4 && LA.bin(0.6) === 3);
ok("색 단계: 1.0 → 4 (넘치지 않음)", LA.bin(1) === 4);

section("평균 함정 — 개념 C");
var dC = LA.distribution(g, "C");
ok("25명 모두 판단 가능", dC.n === 25 && dC.thin.length === 0, dC.n);
ok("평균 0.65 (0.648)", near(dC.mean, 0.6478, 0.0005), dC.mean);
ok("0.5 미만 9명", dC.low === 9, dC.low);
ok("0.9 이상 8명", dC.high === 8, dC.high);
ok("구간 합 = 25", dC.bins.reduce(function (a, b) { return a + b; }, 0) === 25);
ok("0.9~1.0 구간 8명 · 0.1~0.2 구간 4명", dC.bins[9] === 8 && dC.bins[1] === 4, dC.bins);
var dE = LA.distribution(g, "E");
ok("E: 관측 부족 4명을 분포에서 뺌 → 21명", dE.n === 21 && dE.thin.length === 4, dE.n);
var dF = LA.distribution(g, "F");
ok("F: 시도 없음 5명 빼고 20명", dF.n === 20 && dF.none.length === 5, dF.n);

section("규칙별 발동 — 시스템 자신을 보는 지표");
var rf = LA.ruleCounts(L.rows, "final");
ok("최종 상태 70칸", rf.total === 70, rf.total);
ok("1번 12 · 2번 30 · 3번 19 · 4번 5 · 5번 4",
  rf.counts[1] === 12 && rf.counts[2] === 30 && rf.counts[3] === 19 && rf.counts[4] === 5 && rf.counts[5] === 4, rf.counts);
ok("판단 보류 비율 4/70", near(rf.holdRate, 4 / 70));
var rr = LA.ruleCounts(L.rows, "rows");
ok("줄 기준 269", rr.total === 269);
ok("줄 기준 1번 28 · 2번 59 · 3번 36 · 4번 8 · 5번 138",
  rr.counts[1] === 28 && rr.counts[2] === 59 && rr.counts[3] === 36 && rr.counts[4] === 8 && rr.counts[5] === 138, rr.counts);

section("먼저 가야 할 학생");
var pr = LA.priority(g);
var ids = pr.list.map(function (x) { return x.learner; });
ok("여덟 명", pr.list.length === 8, ids);
ok("연속 오답 먼저: s15 s18 s16 s20", ids.slice(0, 4).join(" ") === "s15 s18 s16 s20", ids);
ok("그다음 관측 부족: s22 s24 s21 s25", ids.slice(4).join(" ") === "s22 s24 s21 s25", ids);
var s16 = pr.list.filter(function (x) { return x.learner === "s16"; })[0];
ok("s16은 C와 F 둘 다 연속 3회", s16.cells.length === 2 && s16.cells.every(function (c) { return c.rule === 4 && c.streak === 3; }), s16.cells);
ok("연속 오답의 처방 = 선수 개념 진단 문항", pr.list[0].action === "선수 개념 진단 문항");
ok("관측 부족의 처방 = 판단 보류 · 문항 추가", pr.list[7].action === "판단 보류 · 문항 추가");
ok("시도 없는 학습자 5명 (F)", pr.notStarted.length === 5 && pr.notStarted.every(function (x) { return x.skills.join("") === "F"; }));
ok("나머지 17명은 규칙대로", pr.steady === 17, pr.steady);

section("선수 개념 역전 — 지식 구조를 의심할 신호");
var inv = LA.inversions(g, [["C", "E"], ["C", "F"], ["E", "F"]]);
var invIds = LA.overview(inv.map(function (x) { return { learner_id: x.learner, skill: "x" }; })).learners;
ok("s08 · s11 · s18", invIds.join(" ") === "s08 s11 s18", invIds);
ok("다섯 쌍", inv.length === 5, inv.length);
ok("s18: C 0.119 → F 0.931 포함", inv.some(function (x) { return x.learner === "s18" && x.pre === "C" && x.post === "F" && near(x.pPre, 0.119) && near(x.pPost, 0.931); }));
ok("없는 개념 쌍은 조용히 건너뜀", LA.inversions(g, [["A", "B"]]).length === 0);

section("칸이 빠진 로그 — 규칙표로 다시 계산");
var lines = CSV.split("\n");
var head = lines[0].split(",");
var keep = head.map(function (h, i) { return (h === "streak" || h === "rule_fired") ? -1 : i; }).filter(function (i) { return i >= 0; });
var stripped = lines.map(function (ln) { var c = ln.split(","); return keep.map(function (i) { return c[i]; }).join(","); }).join("\n");
var L2 = LA.loadLog(stripped);
ok("안내 두 줄 (streak · rule_fired 계산함)", L2.notes.length === 2, L2.notes);
var rr2 = LA.ruleCounts(L2.rows, "rows");
ok("다시 계산한 줄 기준 발동이 원래와 같음", [1, 2, 3, 4, 5].every(function (k) { return rr2.counts[k] === rr.counts[k]; }), rr2.counts);
var rf2 = LA.ruleCounts(L2.rows, "final");
ok("최종 상태 발동도 같음", [1, 2, 3, 4, 5].every(function (k) { return rf2.counts[k] === rf.counts[k]; }), rf2.counts);

section("잘못된 입력");
var e1 = LA.loadLog("learner_id,skill\ns01,C");
ok("필수 칸 없음 → 칸 이름을 알려 줌", e1.errors.length === 1 && /p_known_after/.test(e1.errors[0]) && /n_obs/.test(e1.errors[0]), e1.errors);
var e2 = LA.loadLog("learner_id,skill,p_known_after,n_obs\ns01,C,1.4,2\ns02,C,0.5,1.5\ns03,C,0.5,2");
ok("범위 밖 확률·소수 관측 → 그 줄만 빼고 줄 번호를 알려 줌", e2.rows.length === 1 && e2.errors.length === 2 && /^2번째/.test(e2.errors[0]) && /^3번째/.test(e2.errors[1]), e2.errors);
ok("빈 입력 → 안내", LA.loadLog("").errors.length === 1);
var q = LA.parseCSV('﻿a,b\r\n"x, y","say ""hi"""\r\n');
ok("BOM · 따옴표 · 쉼표 · CRLF", q.header.join("|") === "a|b" && q.records[0][0] === "x, y" && q.records[0][1] === 'say "hi"', q);
ok("머리글 대소문자·공백 무시", LA.loadLog(" Learner_ID ,SKILL,p_known_after,N_OBS\ns1,C,.5,3").rows.length === 1);
ok("학습자 순서는 자연 정렬 (s2 < s10)", LA.natCmp("s2", "s10") < 0 && LA.natCmp("s10", "s9") > 0);

section("실습 1 — 결정 칸 점검");
ok("빈칸 → empty", LA.lintDecision("  ").level === "empty");
ok("'학생 수준 파악' → vague", LA.lintDecision("학생들의 수준을 파악한다").level === "vague");
ok("'학습 현황 확인' → vague", LA.lintDecision("학습 현황 확인").level === "vague");
ok("'다음 수업에서 어느 개념을 다시 가르칠지' → ok", LA.lintDecision("다음 수업에서 어느 개념을 다시 가르칠지").level === "ok");
ok("'누구에게 먼저 갈지' → ok", LA.lintDecision("누구에게 먼저 갈지").level === "ok");
ok("'규칙표가 의도대로 도는가' (강의 예시) → ok", LA.lintDecision("규칙표가 의도대로 도는가").level === "ok");
ok("'확인해서 문항을 추가할지 정함' → ok (행동이 있으면 통과)", LA.lintDecision("관측 수를 확인해서 문항을 추가할지 정함").level === "ok");
var cm = LA.checkMetrics([{ name: "숙련 확률", calc: "BKT", decision: "다음 개념을 줄지" }, { name: "접속 시간", calc: "", decision: "" }, { name: "", calc: "", decision: "" }]);
ok("표 점검: 이름 있는 줄 2 · 결정 1 · 빈 결정 1 · 계산 빈칸 1", cm.count === 2 && cm.withDecision === 1 && cm.empty === 1 && cm.noCalc === 1, cm);

section("실습 2 — 스케치 점검");
var s1 = LA.checkSketch("learner", [{ name: "진행", kind: "progress", decision: "목표까지 몇 문제 남았는지 보고 계속할지 정함" }]);
ok("학습자 화면에 버튼 없으면 실패", s1.checks[0].ok === false);
var s2 = LA.checkSketch("learner", [{ name: "다음 문제", kind: "action", decision: "다음에 무엇을 풀지" }, { name: "반 순위", kind: "rank", decision: "" }]);
ok("버튼 있으면 통과", s2.checks[0].ok === true);
ok("학습자 화면 순위표 → 경고", s2.checks[1].ok === false);
ok("결정 없는 위젯 번호를 돌려줌", s2.flagged.length === 1 && s2.flagged[0] === 1, s2.flagged);
var s3 = LA.checkSketch("teacher", [{ name: "먼저 갈 학생", kind: "queue", decision: "누구에게 먼저 갈지" }]);
ok("교사 화면: 목록 있고 주석 다 있으면 모두 통과", s3.checks.every(function (c) { return c.ok; }), s3.checks);
ok("빈 화면 → 위젯을 넣으라는 안내", LA.checkSketch("teacher", []).checks[2].ok === false);

console.log("\n" + (fail ? "✗ " + fail + "개 실패, " : "") + pass + "개 통과");
process.exit(fail ? 1 : 0);
