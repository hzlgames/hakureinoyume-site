import crypto from "node:crypto";
import { getZjuSecret } from "./account";
import { asRecord, decryptSecret, encryptSecret } from "./shared";
import { readToolState, withToolLock, writeToolState } from "./state";
import { calculateMetrics, changedScores, notificationMarkdown, scoreKey, simplifyScore, type Score } from "./grade-core";

export type GradeSettings = {
  enabled: boolean; startHour: number; endHour: number; intervalSeconds: number;
  notifyInitial: boolean; checkEvaluation: boolean; notifications: boolean;
  webhook?: ReturnType<typeof encryptSecret>; signingSecret?: ReturnType<typeof encryptSecret>;
};
const defaults: GradeSettings = { enabled: false, startHour: 8, endHour: 24, intervalSeconds: 3600, notifyInitial: false, checkEvaluation: true, notifications: false };
async function settingsFor(userId: string): Promise<GradeSettings> {
  return { ...defaults, ...await readToolState(userId, "grade-settings") } as GradeSettings;
}
export async function gradeOverview(userId: string) {
  const settings = await settingsFor(userId);
  const { webhook, signingSecret, ...publicSettings } = settings;
  return { settings: { ...publicSettings, hasWebhook: !!webhook, hasSigningSecret: !!signingSecret }, state: await readToolState(userId, "grades") };
}
export async function saveGradeSettings(userId: string, input: Record<string, unknown>) {
  const current = await settingsFor(userId);
  const settings = { ...current };
  for (const key of ["enabled", "notifyInitial", "checkEvaluation", "notifications"] as const) {
    if (typeof input[key] === "boolean") settings[key] = input[key];
  }
  for (const key of ["startHour", "endHour", "intervalSeconds"] as const) {
    if (input[key] !== undefined) settings[key] = Number(input[key]);
  }
  if (!Number.isInteger(settings.startHour) || !Number.isInteger(settings.endHour) || settings.startHour < 0 || settings.endHour > 24 || settings.startHour >= settings.endHour) throw new Error("监控时段必须在 0–24 时之间，开始时间小于结束时间。");
  if (!Number.isInteger(settings.intervalSeconds) || settings.intervalSeconds < 60 || settings.intervalSeconds > 86400) throw new Error("检查间隔须为 60–86400 秒。");
  if (input.clearWebhook === true) { delete settings.webhook; delete settings.signingSecret; settings.notifications = false; }
  if (typeof input.webhook === "string" && input.webhook.trim()) {
    const url = new URL(input.webhook.trim());
    if (url.origin !== "https://oapi.dingtalk.com" || url.pathname !== "/robot/send" || !url.searchParams.has("access_token")) throw new Error("请填写有效的钉钉机器人 Webhook。");
    settings.webhook = encryptSecret(url.href);
  }
  if (input.clearSigningSecret === true) delete settings.signingSecret;
  if (typeof input.signingSecret === "string" && input.signingSecret.trim()) settings.signingSecret = encryptSecret(input.signingSecret.trim());
  if (settings.notifications && !settings.webhook) throw new Error("启用钉钉通知前请保存 Webhook。");
  await writeToolState(userId, "grade-settings", settings);
  return gradeOverview(userId);
}
async function sendDing(settings: GradeSettings, text: string, title: string) {
  if (!settings.notifications || !settings.webhook) return;
  const url = new URL(decryptSecret(settings.webhook));
  if (settings.signingSecret) {
    const secret = decryptSecret(settings.signingSecret);
    const timestamp = String(Date.now());
    url.searchParams.set("timestamp", timestamp);
    url.searchParams.set("sign", crypto.createHmac("sha256", secret).update(`${timestamp}\n${secret}`).digest("base64"));
  }
  // Do not include request URLs (which contain the webhook secret) in errors.
  let response: Response;
  try { response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ msgtype: "markdown", markdown: { title, text } }), signal: AbortSignal.timeout(20000) }); }
  catch { throw new Error("钉钉通知请求失败，将在下次检查时重试。"); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.errcode) throw new Error(`钉钉通知未送达（${data.errcode || response.status}），将重试。`);
}
export async function testGradeNotification(userId: string) {
  const settings = await settingsFor(userId);
  if (!settings.notifications || !settings.webhook) throw new Error("请先保存并启用钉钉通知。");
  await sendDing(settings, "### 成绩监控测试\n- **状态** 钉钉通知配置正常", "成绩监控测试");
}
export function inGradeWindow(settings: Pick<GradeSettings, "startHour" | "endHour">, date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23" }).format(date));
  return hour >= settings.startHour && hour < settings.endHour;
}
export async function checkGrades(userId: string, scheduled = false) {
  return withToolLock(userId, "grades", async () => {
    const settings = await settingsFor(userId);
    const old = await readToolState(userId, "grades");
    if (scheduled && (!settings.enabled || !inGradeWindow(settings) || Date.now() - new Date(String(old.lastAttempt || 0)).getTime() < settings.intervalSeconds * 1000)) return;
    const lastAttempt = new Date().toISOString();
    try {
      const secret = await getZjuSecret(userId);
      const { ZDBK, ZJUAM } = await import("login-zju");
      const client = new ZDBK(new ZJUAM(secret.username, secret.password));
      let evaluationDone: boolean | null = null;
      if (settings.checkEvaluation) {
        const response = await client.fetch(`https://zdbk.zju.edu.cn/jwglxt/xtgl/index_cxMyCosJxpj.html?gnmkdm=N5083&su=${encodeURIComponent(secret.username)}`, { method: "POST", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error("评教状态查询失败。");
        evaluationDone = (await response.json()).result === "1";
      }
      let scores: Score[] | null = null;
      for (const gnmkdm of ["N508301", "N5083"]) {
        try {
          const url = new URL("https://zdbk.zju.edu.cn/jwglxt/cxdy/xscjcx_cxXscjIndex.html");
          url.search = new URLSearchParams({ doType: "query", gnmkdm, su: secret.username }).toString();
          const response = await client.fetch(url, { method: "POST", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ xn: "", xq: "", zscjl: "", zscjr: "", _search: "false", nd: String(Date.now()), "queryModel.showCount": "5000", "queryModel.currentPage": "1", "queryModel.sortName": "xkkh", "queryModel.sortOrder": "asc", time: "1" }) });
          if (!response.ok) continue;
          const data = await response.json();
          if (Array.isArray(data.items)) { scores = data.items.map((item: Score) => ({ ...simplifyScore(item), xkkh: scoreKey(item) })); break; }
        } catch { /* Upstream retries the alternate gnmkdm. */ }
      }
      if (!scores) throw new Error("正式成绩查询失败，登录可能已失效。");
      const previous = asRecord(old.scores) as Record<string, Score>;
      const firstRun = Object.keys(previous).length === 0;
      const changes = firstRun && !settings.notifyInitial ? [] : changedScores(previous, scores);
      const metrics = calculateMetrics(scores);
      const oldMetrics = calculateMetrics(Object.values(previous));
      for (const change of changes) await sendDing(settings, notificationMarkdown(change.current, change.previous, oldMetrics, metrics), "考试成绩通知");
      const history = Array.isArray(old.history) ? old.history : [];
      await writeToolState(userId, "grades", { scores: Object.fromEntries(scores.filter(scoreKey).map((item) => [scoreKey(item), item])), metrics, evaluationDone, lastAttempt, lastSync: new Date().toISOString(), error: null, history: [...changes.map((change) => ({ ...change, at: lastAttempt })), ...history].slice(0, 200) });
    } catch (error) {
      await writeToolState(userId, "grades", { ...old, lastAttempt, error: error instanceof Error ? error.message : "成绩检查失败。" });
      throw error;
    }
    return gradeOverview(userId);
  });
}
