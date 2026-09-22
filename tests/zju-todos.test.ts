import test from "node:test";
import assert from "node:assert/strict";
import { activeSemesterIds, getCoursesActivityTodos } from "../src/lib/zju/courses-todos";
import type { CoursesClient } from "../src/lib/zju/shared";

const now = new Date("2026-09-17T08:00:00Z");
const semesters = [
  { id: 85, is_active: true, start_date: "2026-09-14", end_date: "2027-01-05" },
  { id: 83, is_active: false, start_date: "2026-09-14", end_date: "2026-11-08" },
  { id: 84, is_active: false, start_date: "2026-11-09", end_date: "2027-01-05" },
  { id: 86, is_active: false, start_date: "2026-07-05", end_date: "2026-09-13" }
];

test("semester dates override opaque IDs and inactive flags", () => {
  assert.deepEqual(activeSemesterIds(semesters, now), [85, 83]);
  assert.deepEqual(activeSemesterIds(semesters.map(s => ({ ...s, is_active: false })), now), [85, 83]);
});

test("switches on inclusive Shanghai dates, including winter across New Year", () => {
  assert.deepEqual(activeSemesterIds(semesters, new Date("2026-09-13T15:59:59Z")), [86]);
  assert.deepEqual(activeSemesterIds(semesters, new Date("2026-09-13T16:00:00Z")), [85, 83]);
  assert.deepEqual(activeSemesterIds(semesters, new Date("2026-11-08T15:59:59Z")), [85, 83]);
  assert.deepEqual(activeSemesterIds(semesters, new Date("2026-11-08T16:00:00Z")), [85, 84]);
  assert.deepEqual(activeSemesterIds(semesters, new Date("2027-01-01T00:00:00Z")), [85, 84]);
  assert.deepEqual(activeSemesterIds(semesters, new Date("2027-01-05T16:00:00Z")), []);
});

test("future spring, summer and short semesters depend only on API dates", () => {
  const future = [
    { id: 900, start_date: "2032-02-23", end_date: "2032-07-04" },
    { id: 12, start_date: "2032-02-23", end_date: "2032-04-25" },
    { id: 501, start_date: "2032-04-26", end_date: "2032-07-04" },
    { id: 3, start_date: "2032-07-05", end_date: "2032-09-12" }
  ];
  assert.deepEqual(activeSemesterIds(future, new Date("2032-02-29T00:00:00Z")), [900, 12]);
  assert.deepEqual(activeSemesterIds(future, new Date("2032-04-25T16:00:00Z")), [900, 501]);
  assert.deepEqual(activeSemesterIds(future, new Date("2032-07-04T16:00:00Z")), [3]);
});

test("missing or invalid semester dates fail clearly instead of guessing", () => {
  for (const values of [
    [{ id: 1, is_active: true }],
    [{ id: 1, start_date: "2026-02-30", end_date: "2026-06-01" }],
    [{ id: 1, start_date: "2026-06-01", end_date: "2026-01-01" }]
  ]) assert.throws(() => activeSemesterIds(values, now), /学期起止日期/);
});

function fixture(failPath?: string) {
  const paths: string[] = [];
  const task = (id: number, extra = {}) => ({ id, type: "homework", title: "作业", published: true,
    start_time: "2026-09-14T02:00:00Z", end_time: "2026-09-20T15:59:00Z", ...extra });
  const client = { async fetch(input: string) {
    const url = new URL(input), path = url.pathname;
    paths.push(path);
    assert.notEqual(path, "/api/todos", "must not rely on homepage todos");
    if (path === failPath) return new Response("failure", { status: 503 });
    if (path === "/api/my-semesters") {
      assert.match(url.searchParams.get("fields")!, /start_date,end_date/);
      return Response.json({ semesters });
    }
    if (path === "/api/my-courses") {
      assert.deepEqual(JSON.parse(url.searchParams.get("conditions")!).semester_id, [85, 83]);
      const page = Number(url.searchParams.get("page"));
      return Response.json({ courses: [{ id: page, name: `课程${page}` }], pages: 2 });
    }
    const second = /\/2\//.test(path);
    if (path.endsWith("/activities")) return Response.json({ activities: second ? [] : [
      task(1179184, { title: "第一周作业" }), task(2), task(3),
      task(4, { type: "material" }), task(5, { end_time: "2026-09-16T00:00:00Z" }),
      task(6, { published: false }), task(7, { start_time: "2026-09-18T00:00:00Z" }),
      task(8, { end_time: null }), task(9, { type: "questionnaire" }), task(10, { is_closed: true })
    ] });
    if (path.endsWith("/exams")) return Response.json({ exams: second ? [] : [task(21), task(22), task(23)] });
    if (path.endsWith("/submission-status")) return Response.json({ homework_activities: [{ id: "2", status_code: "submitted" }] });
    if (path.endsWith("/submitted-exams")) return Response.json({ exam_ids: ["22"] });
    if (path.endsWith("/my-completeness")) return Response.json({ completed_result: { completed: { learning_activity: [3, 9], exam_activity: [23] } } });
    if (path.endsWith("/classroom-list")) return Response.json({ classrooms: second ? [{ id: 31, status: "start", title: "课堂互动" }] : [] });
    throw new Error(`Unmocked request: ${path}`);
  } } as unknown as CoursesClient;
  return { client, paths };
}

test("paginates current courses, excludes materials/completed tasks, keeps pending work and interactions", async () => {
  const { client, paths } = fixture();
  const todos = await getCoursesActivityTodos(client, now);
  assert.deepEqual(todos.map(t => t.id), [1179184, 8, 21, 31]);
  assert.equal(todos[0].dueAt, "2026-09-20T15:59:00Z");
  assert.equal(todos[1].dueAt, null);
  assert.equal(todos[2].type, "quiz");
  assert.equal(todos[3].courseId, 2);
  assert.equal(paths.filter(p => p === "/api/my-courses").length, 2);
});

test("failed submission-state reads are surfaced, never turned into false pending tasks", async () => {
  await assert.rejects(getCoursesActivityTodos(fixture("/api/course/1/homework/submission-status").client, now), /503/);
});

test("empty completion maps are valid and empty courses need no completion endpoint", async () => {
  const { client, paths } = fixture();
  const original = client.fetch.bind(client);
  client.fetch = async (url, init) => {
    if (String(url).endsWith("/my-completeness")) {
      return Response.json({ completed_result: { completed: {} } });
    }
    return original(url, init);
  };
  const todos = await getCoursesActivityTodos(client, now);
  assert.ok(todos.some(todo => todo.id === 1179184));
  assert.ok(!paths.includes("/api/course/2/my-completeness"));
});

test("semester gaps return no current-semester tasks without querying all courses", async () => {
  const { client, paths } = fixture();
  assert.deepEqual(await getCoursesActivityTodos(client, new Date("2027-01-06T00:00:00Z")), []);
  assert.deepEqual(paths, ["/api/my-semesters"]);
});
