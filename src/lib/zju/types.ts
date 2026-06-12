// 所有 ZJU 工具的对外类型定义。

export type ZjuTodo = {
  courseId?: number | string | null;
  courseName: string;
  dueAt: string | null;
  id: number | string;
  source: "courses.zju" | "pintia";
  title: string;
  type: string;
  url: string;
};

export type ZjuCourse = {
  id: number;
  name: string;
  code: string;
  status: string;
  instructors: string[];
};

export type ZjuMaterial = {
  activityId: number | string;
  activityTitle: string;
  createdAt: string | null;
  id: number | string;
  key: string | null;
  name: string;
  size: number;
};

export type ZjuActivityKind = "material" | "video" | "view";

export type ZjuActivity = {
  done: boolean;
  duration: number;
  id: number | string;
  kind: ZjuActivityKind;
  title: string;
  type: string;
};

export type ZjuClassroomCourse = {
  id: string;
  teacher: string;
  title: string;
};

export type ZjuClassroomVideo = {
  courseId: string;
  playbackUrl: string | null;
  startAt: number;
  subId: string;
  title: string;
};

export type ZjuLibraryLoan = {
  author: string;
  barcode: string;
  dueDate: string;
  loanDate: string;
  remainingDays: number | null;
  renewable: boolean;
  status: "borrowed" | "due-soon" | "overdue" | "unknown";
  title: string;
};

export type ZjuQuizCourse = {
  id: string;
  name: string;
};

export type ZjuQuizClassroom = {
  id: string;
  title: string;
};

export type ZjuQuizAnswer = {
  content: string;
  label: string;
};

export type ZjuQuizOption = {
  content: string;
  isAnswer: boolean;
  label: string;
};

export type ZjuQuizSubject = {
  answers: ZjuQuizAnswer[];
  description: string;
  id: string;
  options: ZjuQuizOption[];
  point: string;
  type: string;
};
