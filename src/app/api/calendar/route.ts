import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 43200;

type CalendarEvent = {
  title: string;
  type: "holiday" | "workday" | "observance";
  description: string;
  source: "timor.tech" | "Nager.Date" | "local-fallback";
};

type TimorHoliday = {
  holiday?: boolean;
  name?: string;
  date?: string;
  wage?: number;
  target?: string;
};

type NagerHoliday = {
  date?: string;
  localName?: string;
  name?: string;
  types?: string[];
};

const fallbackEvents: Record<string, Omit<CalendarEvent, "source">[]> = {
  "01-01": [{ title: "元旦", type: "observance", description: "新年的第一天。" }],
  "02-14": [{ title: "情人节", type: "observance", description: "常见纪念日。" }],
  "03-08": [{ title: "妇女节", type: "observance", description: "国际妇女节。" }],
  "03-12": [{ title: "植树节", type: "observance", description: "春日植绿的纪念日。" }],
  "04-01": [{ title: "愚人节", type: "observance", description: "常见纪念日。" }],
  "05-01": [{ title: "劳动节", type: "observance", description: "国际劳动节。" }],
  "05-04": [{ title: "青年节", type: "observance", description: "中国青年节。" }],
  "06-01": [{ title: "儿童节", type: "observance", description: "国际儿童节。" }],
  "07-01": [{ title: "建党节", type: "observance", description: "中国共产党成立纪念日。" }],
  "08-01": [{ title: "建军节", type: "observance", description: "中国人民解放军建军纪念日。" }],
  "09-10": [{ title: "教师节", type: "observance", description: "教师节。" }],
  "10-01": [{ title: "国庆节", type: "observance", description: "中华人民共和国国庆节。" }],
  "12-24": [{ title: "平安夜", type: "observance", description: "常见纪念日。" }],
  "12-25": [{ title: "圣诞节", type: "observance", description: "常见纪念日。" }],
};

function addEvent(events: Record<string, CalendarEvent[]>, date: string, event: CalendarEvent) {
  const list = events[date] ?? [];
  const exists = list.some((item) => item.title === event.title && item.type === event.type);

  if (!exists) {
    list.push(event);
  }

  events[date] = list;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate },
    });

    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

async function loadTimorEvents(year: number, events: Record<string, CalendarEvent[]>) {
  const data = await fetchJson<{ code?: number; holiday?: Record<string, TimorHoliday> }>(
    `https://timor.tech/api/holiday/year/${year}/`
  );

  if (!data?.holiday) return false;

  Object.entries(data.holiday).forEach(([monthDay, item]) => {
    const date = item.date ?? `${year}-${monthDay}`;
    const title = item.name ?? (item.holiday ? "法定节假日" : "调休补班");
    const isHoliday = item.holiday === true;

    addEvent(events, date, {
      title,
      type: isHoliday ? "holiday" : "workday",
      description: isHoliday
        ? `法定假期${typeof item.wage === "number" && item.wage > 1 ? `，工资倍数 ${item.wage}` : ""}。`
        : `调休补班${item.target ? `，对应 ${item.target}` : ""}。`,
      source: "timor.tech",
    });
  });

  return true;
}

async function loadNagerEvents(year: number, events: Record<string, CalendarEvent[]>) {
  const data = await fetchJson<NagerHoliday[]>(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/CN`
  );

  if (!Array.isArray(data)) return false;

  data.forEach((item) => {
    if (!item.date) return;

    addEvent(events, item.date, {
      title: item.localName ?? item.name ?? "公共假日",
      type: "holiday",
      description: `${item.name ?? "Public holiday"}${item.types?.length ? ` · ${item.types.join(", ")}` : ""}`,
      source: "Nager.Date",
    });
  });

  return true;
}

function loadFallbackEvents(year: number, events: Record<string, CalendarEvent[]>) {
  Object.entries(fallbackEvents).forEach(([monthDay, list]) => {
    list.forEach((event) => {
      addEvent(events, `${year}-${monthDay}`, {
        ...event,
        source: "local-fallback",
      });
    });
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedYear = Number(searchParams.get("year"));
  const year = Number.isInteger(requestedYear) && requestedYear >= 1900 && requestedYear <= 2100
    ? requestedYear
    : new Date().getFullYear();
  const events: Record<string, CalendarEvent[]> = {};

  const [timorReady, nagerReady] = await Promise.all([
    loadTimorEvents(year, events),
    loadNagerEvents(year, events),
  ]);
  loadFallbackEvents(year, events);

  return NextResponse.json({
    year,
    sources: {
      "timor.tech": timorReady,
      "Nager.Date": nagerReady,
      "local-fallback": true,
    },
    events,
  });
}
