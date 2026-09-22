import { asRecord, readNumber, readString, requestJson } from "./shared";
import type { CoursesClient } from "./shared";
import type { ZjuTodo } from "./types";

type RecordValue = Record<string, unknown>;

// Date-only semester boundaries are inclusive campus dates, not UTC midnights.
export function activeSemesterIds(semesters: RecordValue[], now = new Date()): number[] {
  const today = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateOnly = (value: unknown) => {
    const date = readString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
  };
  const ids = new Set<number>();
  for (const semester of semesters) {
    const id = readNumber(semester.id);
    const start = dateOnly(semester.start_date);
    const end = dateOnly(semester.end_date);
    if (id === null || !start || !end || start > end) {
      throw new Error("学在浙大学期起止日期缺失或异常，无法可靠判断当前学期。");
    }
    if (start <= today && today <= end) ids.add(id);
  }
  return [...ids];
}

async function readList(client: CoursesClient, path: string, key: string): Promise<RecordValue[]> {
  const payload = await requestJson<RecordValue>(client, `https://courses.zju.edu.cn${path}`);
  if (!Array.isArray(payload[key])) throw new Error(`学在浙大返回的 ${key} 数据格式异常。`);
  return payload[key].map(asRecord);
}

export async function getCoursesActivityTodos(client: CoursesClient, now = new Date()): Promise<ZjuTodo[]> {
  const semesters = await readList(client,
    "/api/my-semesters?fields=id,name,start_date,end_date,is_active", "semesters");
  const semesterIds = activeSemesterIds(semesters, now);
  if (!semesterIds.length) return [];

  const courses = new Map<number, RecordValue>();
  for (let page = 1; ; page++) {
    const params = new URLSearchParams({
      page: String(page), page_size: "100", fields: "id,name",
      conditions: JSON.stringify({ semester_id: semesterIds, status: ["ongoing", "notStarted"], display_studio_list: false })
    });
    const payload = await requestJson<RecordValue>(client, `https://courses.zju.edu.cn/api/my-courses?${params}`);
    if (!Array.isArray(payload.courses)) throw new Error("学在浙大课程列表格式异常。");
    for (const value of payload.courses) {
      const course = asRecord(value);
      const id = readNumber(course.id);
      if (id === null) throw new Error("学在浙大课程编号缺失。");
      courses.set(id, course);
    }
    const pages = readNumber(payload.pages);
    if (pages !== null ? page >= pages : payload.courses.length < 100) break;
    if (page >= 100) throw new Error("学在浙大课程分页异常。");
  }

  const todos: ZjuTodo[] = [];
  // Keep requests bounded; do not hide failed course reads as empty results.
  for (const [courseId, course] of courses) {
    const [activities, exams, classrooms] = await Promise.all([
      readList(client, `/api/courses/${courseId}/activities`, "activities"),
      readList(client, `/api/courses/${courseId}/exams`, "exams"),
      readList(client, `/api/courses/${courseId}/classroom-list`, "classrooms")
    ]);
    const tasks: RecordValue[] = [
      ...activities.filter(item => ["homework", "exam", "questionnaire", "evaluation"].includes(readString(item.type))),
      ...exams.map(exam => ({ ...exam, type: "exam" }))
    ];
    // Empty courses can return 404 for my-completeness: only ask for task state
    // when there are actual tasks to classify.
    const [submissions, examPayload, completeness] = await Promise.all([
      tasks.some(item => item.type === "homework")
        ? readList(client, `/api/course/${courseId}/homework/submission-status?no-intercept=true`, "homework_activities") : [],
      tasks.some(item => item.type === "exam")
        ? requestJson<RecordValue>(client, `https://courses.zju.edu.cn/api/courses/${courseId}/submitted-exams?no-intercept=true`) : { exam_ids: [] },
      tasks.length
        ? requestJson<RecordValue>(client, `https://courses.zju.edu.cn/api/course/${courseId}/my-completeness`)
        : { completed_result: { completed: {} } }
    ]);
    if (!Array.isArray(examPayload.exam_ids)) throw new Error("学在浙大测验提交状态格式异常。");
    const submittedHomework = new Set(submissions.filter(item => item.status_code === "submitted").map(item => String(item.id)));
    const submittedExams = new Set(examPayload.exam_ids.map(String));
    const completedValue = asRecord(completeness.completed_result).completed;
    if (!completedValue || typeof completedValue !== "object" || Array.isArray(completedValue)) {
      throw new Error("学在浙大学习活动完成状态格式异常。");
    }
    const completed = asRecord(completedValue);
    const completedIds = (key: string) => {
      const values = completed[key] ?? [];
      if (!Array.isArray(values)) throw new Error("学在浙大学习活动完成状态格式异常。");
      return new Set(values.map(String));
    };
    const completedActivities = completedIds("learning_activity");
    const completedExams = completedIds("exam_activity");
    const inWindow = (start: unknown, end: unknown) => {
      const startText = readString(start), endText = readString(end);
      if (startText && !(new Date(startText).getTime() <= now.getTime())) return false;
      if (endText && !(new Date(endText).getTime() > now.getTime())) return false;
      return true;
    };
    const add = (item: RecordValue, type: string, dueAt: string | null, interaction = false) => {
      const id = readNumber(item.id) ?? readString(item.id);
      if (!id) throw new Error("学在浙大学习活动编号缺失。");
      todos.push({ id, courseId, courseName: readString(course.name) || "未命名课程",
        dueAt, source: "courses.zju", title: readString(item.title) || "未命名事项", type,
        url: interaction ? `https://courses.zju.edu.cn/course/${courseId}/content#/`
          : `https://courses.zju.edu.cn/course/${courseId}/learning-activity#/${id}` });
    };
    // Reading materials/videos is not a pending submission. Keep task types only.
    for (const item of tasks) {
      const type = readString(item.type);
      if (item.published !== true || item.is_closed === true || item.is_started === false) continue;
      if (!inWindow(item.start_time, item.end_time)) continue;
      if (type === "homework" && submittedHomework.has(String(item.id))) continue;
      if (type === "exam" && submittedExams.has(String(item.id))) continue;
      if ((type === "exam" ? completedExams : completedActivities).has(String(item.id))) continue;
      add(item, type === "exam" ? "quiz" : type, readString(item.end_time) || null);
    }
    for (const item of classrooms) {
      if (item.status === "start" && inWindow(item.start_at, item.end_at)) {
        add(item, "interaction", readString(item.end_at) || null, true);
      }
    }
  }
  return [...new Map(todos.map(todo => [`${todo.courseId}:${todo.type}:${todo.id}`, todo])).values()];
}
