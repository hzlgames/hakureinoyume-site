// 后端任务的进行中登记表、日志写入器与统一取消逻辑。
import prisma from "../prisma";

type ActiveJob = {
  abort: AbortController;
  userId: string;
};

const activeJobs = new Map<string, ActiveJob>();

function createJobLogger(jobId: string) {
  const lines: string[] = [];
  let dirty = false;
  let scheduled = false;

  const flush = async () => {
    scheduled = false;
    if (!dirty) return;
    dirty = false;
    await prisma.zjuToolJob
      .update({ where: { id: jobId }, data: { logs: `${lines.join("\n")}\n` } })
      .catch(() => undefined);
  };

  return {
    log(message: string) {
      lines.push(message);
      dirty = true;
      if (!scheduled) {
        scheduled = true;
        setTimeout(() => void flush(), 360);
      }
    },
    flush
  };
}

export async function cancelZjuJob(userId: string, jobId: string) {
  const job = await prisma.zjuToolJob.findFirst({
    where: { id: jobId, userId }
  });

  if (!job) return false;
  activeJobs.get(jobId)?.abort.abort();

  if (!["succeeded", "failed", "cancelled"].includes(job.status)) {
    await prisma.zjuToolJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        finishedAt: new Date()
      }
    });
  }

  return true;
}

// ===========================================================================
// 智云课堂（classroom.zju / CLASSROOM）—— 课程回放链接 + 课堂转录导出
// 移植自 zju_automation/ZJU-live-better classroom.zju/{getVideoURL,generateCourseMd}.js

export { activeJobs, createJobLogger };
