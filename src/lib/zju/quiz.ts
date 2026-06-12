// 互动测验答案（courses.zju/quizanswer）：获取互动测验（不计平时分）的答案
import prisma from "../prisma";
import { getZjuSecret } from "./account";
import { activeJobs, createJobLogger } from "./jobs";
import { buildCoursesClient, readNumber, readString, requestJson, stripHtmlTags, toJsonValue } from "./shared";
import type { CoursesClient } from "./shared";
import type { ZjuQuizAnswer, ZjuQuizClassroom, ZjuQuizCourse, ZjuQuizOption, ZjuQuizSubject } from "./types";

async function quizFetchJson(client: CoursesClient, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  return await requestJson<Record<string, unknown>>(client, url, init);
}

function quizOptionLabel(sort: unknown) {
  return String.fromCharCode(65 + (readNumber(sort) ?? 0));
}

export async function getQuizCourses(userId: string): Promise<ZjuQuizCourse[]> {
  const client = await buildCoursesClient(await getZjuSecret(userId));
  const semestersPayload = await quizFetchJson(client, `https://courses.zju.edu.cn/api/my-semesters?fields=id,name,sort,is_active,code`);
  const semesters = Array.isArray(semestersPayload.semesters) ? semestersPayload.semesters as Array<Record<string, unknown>> : [];
  const activeSemesterIds = semesters.filter((semester) => Boolean(semester.is_active)).map((semester) => readNumber(semester.id) ?? readString(semester.id));

  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("page_size", "1000");
  params.set("sort", "all");
  params.set("normal", '{"version":7,"apiVersion":"1.1.0"}');
  params.set("conditions", JSON.stringify({
    role: [],
    semester_id: activeSemesterIds,
    academic_year_id: [],
    status: ["ongoing", "notStarted"],
    course_type: [],
    effectiveness: [],
    published: [],
    display_studio_list: false
  }));
  params.set("fields", "id,org_id,name,second_name,department(id,name),instructors(name),grade(name),klass(name),cover,learning_mode,course_attributes(teaching_class_name,data),public_scope,course_type,course_code,compulsory,credit,second_name");

  const coursesPayload = await quizFetchJson(client, `https://courses.zju.edu.cn/api/my-courses?${params.toString()}`);
  const courseList = Array.isArray(coursesPayload.courses) ? coursesPayload.courses as Array<Record<string, unknown>> : [];

  return courseList
    .map((course) => ({
      id: String(readNumber(course.id) ?? readString(course.id)),
      name: readString(course.name) || "未命名课程"
    }))
    .filter((course) => course.id && course.id !== "null");
}

export async function getQuizClassrooms(userId: string, courseId: string): Promise<ZjuQuizClassroom[]> {
  const client = await buildCoursesClient(await getZjuSecret(userId));
  const payload = await quizFetchJson(client, `https://courses.zju.edu.cn/api/courses/${encodeURIComponent(courseId)}/classroom-list`);
  const classrooms = Array.isArray(payload.classrooms) ? payload.classrooms as Array<Record<string, unknown>> : [];

  return classrooms
    .filter((classroom) => readString(classroom.status) === "start")
    .map((classroom) => ({
      id: String(readNumber(classroom.id) ?? readString(classroom.id)),
      title: readString(classroom.title) || "未命名互动"
    }))
    .filter((classroom) => classroom.id && classroom.id !== "null");
}

export async function getQuizAnswers(userId: string, classroomId: string, init?: RequestInit): Promise<ZjuQuizSubject[]> {
  const client = await buildCoursesClient(await getZjuSecret(userId));
  const payload = await quizFetchJson(client, `https://courses.zju.edu.cn/api/classroom/${encodeURIComponent(classroomId)}/subject`, init);
  const subjects = Array.isArray(payload.subjects) ? payload.subjects as Array<Record<string, unknown>> : [];

  return subjects.map((subject) => {
    const type = readString(subject.type);
    const options: ZjuQuizOption[] = (Array.isArray(subject.options) ? subject.options as Array<Record<string, unknown>> : []).map((option) => ({
      label: quizOptionLabel(option.sort),
      content: stripHtmlTags(readString(option.content)),
      isAnswer: Boolean(option.is_answer)
    }));

    const answers: ZjuQuizAnswer[] = type !== "fill_in_blank"
      ? options.filter((option) => option.isAnswer).map((option) => ({ label: option.label, content: option.content }))
      : (Array.isArray(subject.correct_answers) ? subject.correct_answers as Array<Record<string, unknown>> : []).map((answer, index) => ({
        label: `填空 ${index + 1}`,
        content: stripHtmlTags(readString(answer.content))
      }));

    return {
      id: String(readNumber(subject.id) ?? readString(subject.id)),
      type,
      point: readString(subject.point),
      description: stripHtmlTags(readString(subject.description)),
      options,
      answers
    };
  });
}

export async function createQuizAnswersJob(input: {
  classroomId: string;
  title?: string;
  userId: string;
}) {
  const job = await prisma.zjuToolJob.create({
    data: {
      userId: input.userId,
      tool: "courses.zju/quiz",
      status: "queued",
      input: toJsonValue({
        classroomId: input.classroomId,
        title: input.title ?? ""
      })
    }
  });

  void runQuizAnswersJob(job.id, input.userId, input.classroomId, input.title ?? "");
  return job;
}

async function runQuizAnswersJob(jobId: string, userId: string, classroomId: string, title: string) {
  const abort = new AbortController();
  activeJobs.set(jobId, { abort, userId });
  const logger = createJobLogger(jobId);

  try {
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: "running",
        startedAt: new Date()
      }
    });

    logger.log(`读取互动测验答案：${title || classroomId}`);
    const subjects = await getQuizAnswers(userId, classroomId, { signal: abort.signal });
    logger.log(`读取完成，共 ${subjects.length} 题。`);
    await logger.flush();

    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: "succeeded",
        exitCode: 0,
        finishedAt: new Date(),
        output: toJsonValue({ subjects })
      }
    });
  } catch (error) {
    const cancelled = abort.signal.aborted;
    logger.log(cancelled ? "任务已取消。" : `任务失败：${error instanceof Error ? error.message : "未知错误"}`);
    await logger.flush();
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: cancelled ? "cancelled" : "failed",
        exitCode: cancelled ? null : 1,
        error: cancelled ? null : error instanceof Error ? error.message : "任务执行失败。",
        finishedAt: new Date()
      }
    });
  } finally {
    activeJobs.delete(jobId);
  }
}
