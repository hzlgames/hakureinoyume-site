"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, CheckCircle2, Library, RefreshCcw, RotateCw } from "lucide-react";
import { DashboardCard } from "../../../_components/ui";
import {
  fetchJson,
  ZjuAuthGate,
  ZjuErrorMessage,
  ZjuMetricCard,
  ZjuStatusPill,
  ZjuToolShell
} from "../courses.zju/_components";

type Loan = {
  author: string;
  barcode: string;
  dueDate: string;
  loanDate: string;
  remainingDays: number | null;
  renewable: boolean;
  status: "borrowed" | "due-soon" | "overdue" | "unknown";
  title: string;
};

const statusMeta: Record<Loan["status"], { label: string; tone: "active" | "danger" | "muted" | "ok" }> = {
  borrowed: { label: "借阅中", tone: "ok" },
  "due-soon": { label: "即将到期", tone: "active" },
  overdue: { label: "已逾期", tone: "danger" },
  unknown: { label: "未知", tone: "muted" }
};

function remainingLabel(days: number | null) {
  if (days === null) return "未知期限";
  if (days < 0) return `逾期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天到期";
  return `剩余 ${days} 天`;
}

export default function ZjuLibraryPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadLoans = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchJson<{ loans?: Loan[] }>("/api/zju/library/loans");
      setLoans(payload.loans ?? []);
      setSelected(new Set());
      setLoadedAt(new Date().toISOString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "借阅信息读取失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadLoans(), 0);
    return () => window.clearTimeout(timer);
  }, [loadLoans]);

  const renewable = useMemo(() => loans.filter((loan) => loan.renewable), [loans]);
  const overdueCount = loans.filter((loan) => loan.status === "overdue").length;

  function toggle(barcode: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(barcode);
      else next.delete(barcode);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(() => (checked ? new Set(renewable.map((loan) => loan.barcode)) : new Set()));
  }

  async function renew(barcodes: string[]) {
    if (barcodes.length === 0) return;
    setRenewing(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchJson<{ results?: Array<{ barcode: string; ok: boolean }> }>("/api/zju/library/renew", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ barcodes })
      });
      const results = payload.results ?? [];
      const ok = results.filter((item) => item.ok).length;
      const fail = results.length - ok;
      setNotice(`续借完成：成功 ${ok} 本${fail ? `，失败 ${fail} 本` : ""}。`);
      await loadLoans();
    } catch (renewError) {
      setError(renewError instanceof Error ? renewError.message : "续借失败。");
    } finally {
      setRenewing(false);
    }
  }

  const allRenewableSelected = renewable.length > 0 && renewable.every((loan) => selected.has(loan.barcode));

  return (
    <ZjuAuthGate callback="/tools/ZJU_tools/lib.zju">
      <ZjuToolShell
        actions={(
          <button className="button primary-button" disabled={loading} onClick={loadLoans} type="button">
            <RefreshCcw size={18} />
            {loading ? "刷新中" : "刷新借阅"}
          </button>
        )}
        backHref="/tools/ZJU_tools"
        backLabel="ZJU 工具"
        eyebrow="图书馆"
        lead="查询当前借阅图书与到期情况，挑选可续借的图书一键续借。"
        title="借阅续借"
      >
        <ZjuErrorMessage message={error} />

        <div className="zju-metric-grid">
          <ZjuMetricCard detail={loadedAt ? "已读取借阅信息" : "尚未刷新"} label="在借图书" value={loans.length} />
          <ZjuMetricCard detail="符合续借条件" label="可续借" value={renewable.length} />
          <ZjuMetricCard detail="请尽快归还或续借" label="已逾期" value={overdueCount} />
        </div>

        <DashboardCard className="tool-detail-card">
          <div className="zju-card-heading">
            <div className="card-title">
              <Library size={18} />
              借阅清单
            </div>
            <div className="tool-action-row">
              <button className="button secondary-button compact-button" disabled={renewable.length === 0} onClick={() => toggleAll(!allRenewableSelected)} type="button">
                {allRenewableSelected ? "取消全选" : "全选可续借"}
              </button>
              <button className="button primary-button compact-button" disabled={renewing || selected.size === 0} onClick={() => renew([...selected])} type="button">
                <RotateCw size={15} />
                {renewing ? "续借中" : `续借选中 ${selected.size || ""}`.trim()}
              </button>
            </div>
          </div>

          {notice ? <p className="auth-message success zju-page-message">{notice}</p> : null}

          <div className="zju-material-list">
            {loans.length === 0 ? <p className="tool-empty">{loading ? "正在读取借阅信息..." : "当前没有在借图书。"}</p> : null}
            {loans.map((loan, index) => {
              const meta = statusMeta[loan.status];
              const checked = selected.has(loan.barcode);
              return (
                <label
                  className={`zju-activity-row ${loan.renewable ? "" : "is-locked"} ${checked ? "is-selected" : ""}`}
                  key={loan.barcode || index}
                  style={{ animationDelay: `${Math.min(index * 28, 320)}ms` }}
                >
                  <input
                    checked={checked}
                    disabled={!loan.renewable}
                    onChange={(event) => toggle(loan.barcode, event.target.checked)}
                    type="checkbox"
                  />
                  <span className="zju-activity-icon">
                    <BookMarked size={18} />
                  </span>
                  <div className="zju-activity-body">
                    <strong>{loan.title}</strong>
                    <div className="zju-tag-row">
                      {loan.author ? <span>{loan.author}</span> : null}
                      <span>借出 {loan.loanDate || "—"}</span>
                      <span>应还 {loan.dueDate || "—"}</span>
                    </div>
                  </div>
                  <div className="zju-loan-side">
                    <ZjuStatusPill tone={meta.tone}>{meta.label}</ZjuStatusPill>
                    <span className="zju-loan-remaining">{remainingLabel(loan.remainingDays)}</span>
                    {loan.renewable ? (
                      <span className="zju-loan-renewable">
                        <CheckCircle2 size={13} />
                        可续借
                      </span>
                    ) : null}
                  </div>
                </label>
              );
            })}
          </div>
        </DashboardCard>
      </ZjuToolShell>
    </ZjuAuthGate>
  );
}
