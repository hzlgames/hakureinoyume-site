/* zdbk 成绩监控
 *
 * Portions of this file are based on zju-learning-assistant:
 * https://github.com/PeiPei233/zju-learning-assistant
 *
 * MIT License
 *
 * Copyright (c) 2023 PeiPei233
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * Adapted for hakureinoyume-site from ZJU-live-better.
 */
export type Score = Record<string, string>;
const WATCHED_FIELDS = ["cj", "bkcj", "jd", "xf"];
const SCORE_FIELDS = ["xkkh", "kcmc", ...WATCHED_FIELDS];
const NON_NUMERIC_GRADES = new Set(["合格", "不合格", "弃修"]);
export function scoreKey(item: Score) {
  return String(item.xkkh || item.kch_id || item.kcmc || "");
}

export function simplifyScore(item: Score) {
  return Object.fromEntries(
    SCORE_FIELDS.map((field) => [field, String(item[field] ?? "")]),
  );
}

export function changedScores(oldScores: Record<string, Score>, newScores: Score[]) {
  const changes = [];
  for (const item of newScores) {
    const key = scoreKey(item);
    if (!key) continue;
    const current = simplifyScore(item);
    const previous = oldScores[key];
    if (!previous) {
      if (current.cj || current.bkcj || current.jd) {
        changes.push({ key, previous: null, current });
      }
    } else if (
      WATCHED_FIELDS.some((field) => (previous[field] ?? "") !== current[field])
    ) {
      changes.push({ key, previous, current });
    }
  }
  return changes;
}

function numeric(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "")
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateMetrics(items: Score[]) {
  let totalGradePoints = 0;
  let gpaCredits = 0;
  let totalPercentScore = 0;
  let percentCredits = 0;

  for (const item of items) {
    const credit = numeric(item.xf);
    if (credit === null) continue;

    const grade = String(item.cj ?? "");
    const point = numeric(item.jd);
    if (!NON_NUMERIC_GRADES.has(grade) && point !== null) {
      totalGradePoints += point * credit;
      gpaCredits += credit;
    }

    const score = numeric(item.cj);
    if (score !== null) {
      totalPercentScore += score * credit;
      percentCredits += credit;
    }
  }

  return {
    totalCredits: gpaCredits,
    gpa: gpaCredits ? totalGradePoints / gpaCredits : 0,
    percentAverage: percentCredits ? totalPercentScore / percentCredits : 0,
  };
}

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

export function notificationMarkdown(item: Score, previous: Score | null, oldMetrics: ReturnType<typeof calculateMetrics>, newMetrics: ReturnType<typeof calculateMetrics>) {
  return [
    "### 考试成绩通知",
    `- **选课课号**\t${item.xkkh}`,
    `- **课程名称**\t${item.kcmc}`,
    `- **成绩**\t${item.cj}`,
    `- **原成绩**\t${previous?.cj || "无"}`,
    `- **补考成绩**\t${item.bkcj}`,
    `- **学分**\t${item.xf}`,
    `- **总学分**\t${newMetrics.totalCredits.toFixed(1)}`,
    `- **绩点**\t${item.jd}`,
    `- **成绩变化**\t${newMetrics.gpa.toFixed(2)}(${signed(newMetrics.gpa - oldMetrics.gpa)}) / ${newMetrics.percentAverage.toFixed(2)}(${signed(newMetrics.percentAverage - oldMetrics.percentAverage)})`,
  ].join("\n");
}
