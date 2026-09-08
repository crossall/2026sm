/*
 * ks-core 검증 — 터미널에서  node test/ks-core.test.js
 * 강의에서 손으로 계산한 값과 코드의 결과가 같은지 확인합니다.
 */
global.window = global;
require("../assets/ks-core.js");
var KS = global.KS;

var pass = 0, fail = 0;
function check(label, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? "  통과  " : "  실패  ") + label + (ok ? "" : "\n        받은 값: " + JSON.stringify(got) + "\n        기대 값: " + JSON.stringify(want)));
  ok ? pass++ : fail++;
}

// 강의에서 쓴 분수 나눗셈 예시
var kc = ["A", "B", "C", "D", "E", "F"];
var pre = [0, 0b1, 0b1, 0b1, 0b1110, 0b10000];   // B·C·D←A, E←B·C·D, F←E
var M = KS.compute(kc, pre);

console.log("\n분수 나눗셈 (구성요소 6개)");
check("2⁶ = 64가지", M.totalCombinations, 64);
check("실제 가능한 상태는 11가지", M.states.length, 11);
check("학습 경로는 6가지 (B·C·D의 순서)", M.totalPaths, 6);
check("상태 목록", M.states.map(KS.setLabel),
  ["{ }", "{A}", "{A,B}", "{A,C}", "{A,D}", "{A,B,C}", "{A,B,D}", "{A,C,D}", "{A,B,C,D}", "{A,B,C,D,E}", "{A,B,C,D,E,F}"]);
check("{ } 에서 배울 수 있는 것은 A", M.outerFringe(0), [0]);
check("{A} 에서 배울 수 있는 것은 B·C·D", M.outerFringe(0b1), [1, 2, 3]);
check("{A,B,C,D} 에서 배울 수 있는 것은 E", M.outerFringe(0b1111), [4]);
check("{B,E} 는 지식 상태가 아님", M.stateSet.has(0b10010), false);

console.log("\nQ-matrix 진단 (3번·5번만 오답)");
var items = [0b1, 0b11, 0b101, 0b1001, 0b11111, 0b110001, 0b111000, 0b101];
var D = KS.diagnose(M, items, ["O", "O", "X", "O", "X", "O", "O", "O"]);
check("A는 단독 문항(1번)을 맞혀 '알고 있음'", D.result[0].verdict, "yes");
check("C는 의심되나 8번 정답 때문에 흔들림", D.result[2].verdict, "wob");
check("B는 3번이 B를 요구하지 않아 해당 없음", D.result[1].verdict, "no");

console.log("\n순환을 만든 경우");
var C = KS.compute(["A", "B"], [0b10, 0b1]);      // A←B, B←A
check("순환에 걸린 구성요소는 도달할 수 없음", C.unreachable, [0, 1]);
check("형식상 유효한 상태는 { } 와 {A,B} 둘", C.states.length, 2);
check("그러나 실제로 도달 가능한 것은 { } 하나뿐", C.reachable.length, 1);
check("{A,B} 까지 가는 경로는 0가지", C.paths[0b11], 0);

console.log("\n저장·공유용 직렬화");
var round = KS.decodeState(KS.encodeState({ kc: kc, pre: pre }));
check("인코딩 후 디코딩하면 그대로", round.pre, pre);

console.log("\n" + pass + "개 통과, " + fail + "개 실패\n");
process.exit(fail ? 1 : 0);
