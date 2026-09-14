/*
 * bkt-core.test.js — 계산이 맞는지 확인합니다.
 * 실행:  node test/bkt-core.test.js
 *
 * 기대값은 손으로 따로 계산해 둔 것입니다. 강의 슬라이드 26·27번,
 * 그리고 배포한 3주_BKT계산기.xlsx 의 [정답확인] 시트와 같은 값입니다.
 */
var BKT = require("../assets/bkt-core.js");

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (got !== undefined ? "   → 나온 값: " + got : "")); }
}
function near(a, b, eps) { return Math.abs(a - b) < (eps || 0.0006); }
function section(t) { console.log("\n" + t); }

var P = { L0: 0.30, T: 0.10, G: 0.20, S: 0.10, mastery: 0.95 };

section("기본 갱신 — 연속 정답");
var r1 = BKT.run(P, [true, true, true, true, true]);
ok("1회 후 0.693", near(r1[0].next, 0.693), r1[0].next.toFixed(4));
ok("2회 후 0.919", near(r1[1].next, 0.919), r1[1].next.toFixed(4));
ok("3회 후 0.983", near(r1[2].next, 0.983), r1[2].next.toFixed(4));
ok("3회에서 숙련 판정", r1[2].mastered === true && r1[1].mastered === false);
ok("firstMastery = 3", BKT.firstMastery(r1, P.mastery) === 3, BKT.firstMastery(r1, P.mastery));

section("두 단계가 나뉘어 있는지");
ok("1회 post(되돌아보기) 0.6585", near(r1[0].post, 0.6585));
ok("1회 next(학습 반영) 이 post 보다 큼", r1[0].next > r1[0].post);
ok("학습 반영 폭 = (1-post)*T", near(r1[0].next - r1[0].post, (1 - r1[0].post) * P.T));
ok("맞힐 확률 0.41", near(r1[0].pCorrect, 0.41), r1[0].pCorrect.toFixed(4));

section("첫 문제를 틀린 경우");
var r2 = BKT.run(P, [false, true, true, true, true]);
ok("1회 오답 후 0.146", near(r2[0].next, 0.146), r2[0].next.toFixed(4));
ok("그다음 정답 후 0.491", near(r2[1].next, 0.491), r2[1].next.toFixed(4));
ok("4회에 숙련 (연속 정답보다 1문제 늦음)", BKT.firstMastery(r2, P.mastery) === 4, BKT.firstMastery(r2, P.mastery));
ok("P(L)=0.3 에서는 정답 쪽이 확률을 더 크게 움직임 (아래 증거 항목과 함께 볼 것)",
   Math.abs(r1[0].delta) > Math.abs(r2[0].delta));
var hi = BKT.run(P, [true, true]);                       // P(L) = 0.919 까지 올린 뒤
var hiC = BKT.step(hi[1].next, true, BKT.normalize(P));
var hiW = BKT.step(hi[1].next, false, BKT.normalize(P));
ok("P(L)이 높아지면 오답 쪽이 확률을 더 크게 움직임",
   Math.abs(hiW.next - hi[1].next) > Math.abs(hiC.next - hi[1].next));

section("증거의 세기 — 확률 변화폭이 아니라 로그 승산으로 봐야 하는 이유");
ok("정답의 증거 1.504", near(BKT.evidence(true, P), 1.504, 0.001), BKT.evidence(true, P).toFixed(4));
ok("오답의 증거 -2.079", near(BKT.evidence(false, P), -2.079, 0.001), BKT.evidence(false, P).toFixed(4));
ok("오답이 정답보다 무거움 (P(L)과 무관하게)",
   Math.abs(BKT.evidence(false, P)) > Math.abs(BKT.evidence(true, P)));
ok("P(S)를 키우면 오답이 가벼워짐",
   Math.abs(BKT.evidence(false, Object.assign({}, P, { S: 0.3 }))) < Math.abs(BKT.evidence(false, P)));
ok("P(G)를 키우면 정답이 가벼워짐",
   Math.abs(BKT.evidence(true, Object.assign({}, P, { G: 0.5 }))) < Math.abs(BKT.evidence(true, P)));

section("추측 확률을 올리면");
ok("P(G)=0.2 → 3문제", BKT.attemptsToMastery(P) === 3, BKT.attemptsToMastery(P));
ok("P(G)=0.5 → 6문제", BKT.attemptsToMastery(Object.assign({}, P, { G: 0.5 })) === 6,
   BKT.attemptsToMastery(Object.assign({}, P, { G: 0.5 })));
ok("P(G)=0.0 → 1문제", BKT.attemptsToMastery(Object.assign({}, P, { G: 0 })) === 1);
var c5 = BKT.curve(Object.assign({}, P, { G: 0.5 }), 3);
ok("P(G)=0.5 에서 3회 후 0.808", near(c5[3], 0.808), c5[3].toFixed(4));

section("숙련 임계값");
ok("0.95 와 0.98 이 P(G)=0.2 에서는 똑같이 3문제",
   BKT.attemptsToMastery(Object.assign({}, P, { mastery: 0.98 })) === 3);
ok("P(G)=0.5 에서는 0.95→6, 0.98→7 로 갈림",
   BKT.attemptsToMastery(Object.assign({}, P, { G: 0.5, mastery: 0.98 })) === 7);

section("퇴화 모델 감지");
ok("정상 범위에서는 경고 없음", BKT.degenerate(P) === null);
ok("G+S ≥ 1 이면 bad", (BKT.degenerate(Object.assign({}, P, { G: 0.6, S: 0.5 })) || {}).level === "bad");
ok("G > 0.5 만이면 warn", (BKT.degenerate(Object.assign({}, P, { G: 0.6 })) || {}).level === "warn");
ok("T = 0 이면 warn", (BKT.degenerate(Object.assign({}, P, { T: 0 })) || {}).level === "warn");

section("규칙표 — 순서가 중요합니다");
var TH = { mastery: 0.95, mid: 0.5, minObs: 3, streak: 3 };
ok("관측 부족이 확률보다 먼저", BKT.ruleFor({ pL: 0.42, count: 2, streak: 0 }, TH) === 5);
ok("관측이 차면 확률로 판단", BKT.ruleFor({ pL: 0.42, count: 5, streak: 0 }, TH) === 3);
ok("연속 오답이 확률보다 먼저", BKT.ruleFor({ pL: 0.60, count: 8, streak: 3 }, TH) === 4);
ok("숙련", BKT.ruleFor({ pL: 0.97, count: 5, streak: 0 }, TH) === 1);
ok("중간 구간", BKT.ruleFor({ pL: 0.70, count: 5, streak: 0 }, TH) === 2);
ok("관측이 아무리 많아도 확률이 높으면 1번", BKT.ruleFor({ pL: 0.99, count: 99, streak: 0 }, TH) === 1);

section("규칙 조건 문장이 기준값을 따라감");
var cond = BKT.ruleConditions({ mastery: 0.98, mid: 0.4, minObs: 5, streak: 2 });
ok("숙련 임계값 반영", cond[0].indexOf("0.98") >= 0, cond[0]);
ok("중간 임계값 반영", cond[2].indexOf("0.40") >= 0, cond[2]);
ok("연속 오답 기준 반영", cond[3].indexOf("2회") >= 0, cond[3]);
ok("최소 관측 수 반영", cond[4].indexOf("5") >= 0, cond[4]);

section("모수 범위 다듬기");
ok("음수 P(G)는 0으로", BKT.normalize({ G: -1 }).G === 0);
ok("1 이상 P(S)는 0.999로", BKT.normalize({ S: 3 }).S === 0.999);
ok("빈 입력은 기본값", BKT.normalize({}).L0 === BKT.DEFAULTS.L0);

section("민감도");
var sens = BKT.sensitivity(P, "G", [0, 0.2, 0.25, 0.5]);
ok("P(G) 0 → 1문제", sens[0].attempts === 1);
ok("P(G) 0.25 → 3문제", sens[2].attempts === 3, sens[2].attempts);
ok("P(G)가 커질수록 문제 수가 늘어남", sens[3].attempts > sens[1].attempts);

section("저장·공유 직렬화");
var st = { params: P, responses: [true, false, true], rules: ["가", "나"] };
ok("왕복해도 같음", JSON.stringify(BKT.decodeState(BKT.encodeState(st))) === JSON.stringify(st));
ok("URL에 넣어도 안전한 글자만", /^[A-Za-z0-9_-]+$/.test(BKT.encodeState(st)));

console.log("\n" + (fail === 0 ? "모두 통과" : fail + "개 실패") + " — " + pass + " / " + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
