// 图书馆（lib.zju）：在借图书查询与续借。
import { getZjuSecret } from "./account";
import { asRecord, buildLibClient, readString } from "./shared";
import type { LibClient } from "./shared";
import type { ZjuLibraryLoan } from "./types";

// ===========================================================================
// 图书馆（lib.zju / APILIB）—— 借阅查询与续借
// 移植自 zju_automation/ZJU-live-better lib.zju/bookList.js
// ===========================================================================
const LIBRARY_CODE = "ZJU50";

function libDateFormat(value: string) {
  if (!value) return "";
  if (value.length === 8) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return value;
}

function libDayDiff(value: string) {
  if (!value) return null;
  const formatted = libDateFormat(value);
  const target = new Date(`${formatted}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - midnight.getTime()) / (1000 * 60 * 60 * 24));
}

function libLoanStatus(dueDate: string): { renewable: boolean; status: ZjuLibraryLoan["status"] } {
  const diff = libDayDiff(dueDate);
  if (diff === null) return { status: "unknown", renewable: false };
  if (diff < 0) return { status: "overdue", renewable: false };
  if (diff <= 7) return { status: "due-soon", renewable: true };
  return { status: "borrowed", renewable: true };
}

function libCanRenew(item: Record<string, unknown>) {
  const z30 = asRecord(item.z30);
  const z36 = asRecord(item.z36);
  const { status } = libLoanStatus(readString(z36["z36-due-date"]));
  if (status === "overdue") return false;
  const letterNumber = readString(z36["z36-letter-number"]);
  if (letterNumber && Number(letterNumber) !== 0) return false;
  const itemStatus = readString(z30["z30-item-status"]);
  if (itemStatus === "12") return true;
  if (itemStatus === "11") return readString(z36["z36-no-renewal"]) === "0";
  return false;
}

async function libAuth(client: LibClient) {
  await client.fetch(`http://api.lib.zju.edu.cn/aleph/bor-auth?CON_LNG=chi`).catch(() => undefined);
  const borId = client.bor_id;
  if (!borId) throw new Error("图书馆登录失败，未获取到读者 ID。");
  return borId;
}

export async function getLibraryLoans(userId: string): Promise<ZjuLibraryLoan[]> {
  const client = await buildLibClient(await getZjuSecret(userId));
  const borId = await libAuth(client);
  const response = await client.fetch(`http://api.lib.zju.edu.cn/aleph/bor_info?bor_id=${borId}`);
  const payload = await response.json() as { data?: { "bor-info"?: Record<string, unknown> } };
  const borInfo = payload.data?.["bor-info"];
  if (!borInfo || borInfo.error) throw new Error("借阅信息读取失败。");

  const rawLoans = borInfo["item-l"];
  const loans = Array.isArray(rawLoans) ? rawLoans : rawLoans ? [rawLoans] : [];

  return loans.map((raw) => {
    const item = asRecord(raw);
    const z13 = asRecord(item.z13);
    const z30 = asRecord(item.z30);
    const z36 = asRecord(item.z36);
    const dueDate = readString(z36["z36-due-date"]);
    const { status, renewable } = libLoanStatus(dueDate);
    return {
      barcode: readString(z30["z30-barcode"]),
      title: readString(z13["z13-title"]) || "未知书名",
      author: readString(z13["z13-author"]),
      loanDate: libDateFormat(readString(z36["z36-loan-date"])),
      dueDate: libDateFormat(dueDate),
      remainingDays: libDayDiff(dueDate),
      renewable: renewable && libCanRenew(item),
      status
    };
  });
}

export async function renewLibraryBooks(userId: string, barcodes: string[]) {
  const client = await buildLibClient(await getZjuSecret(userId));
  const borId = await libAuth(client);
  const results: Array<{ barcode: string; ok: boolean }> = [];

  for (const barcode of barcodes) {
    if (!barcode) continue;
    try {
      const response = await client.fetch(`http://api.lib.zju.edu.cn/aleph/renew?CON_LNG=chi&bor-id=${borId}&library=${LIBRARY_CODE}&item_barcode=${encodeURIComponent(barcode)}`);
      const payload = await response.json() as { data?: { renew?: { reply?: string } } };
      results.push({ barcode, ok: payload.data?.renew?.reply === "ok" });
    } catch {
      results.push({ barcode, ok: false });
    }
  }

  return results;
}

// ===========================================================================
// WebPlus 通知存档（webplus.zju）—— 保存通知页面与全部附件（修正附件文件名）
// 移植自 zju_automation/ZJU-live-better webplus.zju/saveDoc.js（无 cheerio，改用定向正则）
