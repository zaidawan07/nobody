import { parsePkrAmount } from "../src/lib/pkr-parser";

const cases: Array<[string, number | null]> = [
  ["50 hazaar", 50_000],
  ["50 hazar", 50_000],
  ["50 thousand", 50_000],
  ["5 lakh", 500_000],
  ["5 lac", 500_000],
  ["50 lakh", 5_000_000],
  ["1 crore", 10_000_000],
  ["1 karor", 10_000_000],
  ["2 crore 50 lakh", 25_000_000],
  ["2.5 crore", 25_000_000],
  ["80,000/month", 80_000],
  ["80,000", 80_000],
  ["50000", 50_000],
  ["Rs 80,000", 80_000],
  ["pkr 1.5 crore", 15_000_000],
  ["1 crore 5 lakh 50 thousand", 10_550_000],
  ["lac", null],
  ["", null],
  ["abc", null],
  ["5 bananas", null],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = parsePkrAmount(input);
  if (got !== expected) {
    console.error(`FAIL: ${JSON.stringify(input)} => ${got}, expected ${expected}`);
    failed++;
  } else {
    console.log(`PASS: ${JSON.stringify(input)} => ${got}`);
  }
}
if (failed > 0) process.exit(1);
console.log(`All ${cases.length} parser cases pass.`);
