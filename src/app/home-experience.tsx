"use client";

import React, { useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { 
  Search, Bell, BookOpen, Heart,
  CloudSun, CalendarDays, Book, Timer, CheckSquare,
  Languages, Calculator, Dices, Palette, MoreHorizontal,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Star, Moon, Sun, Target, AlignLeft, MapPin, Menu, X,
  LogIn, LogOut, ShieldCheck, UserPlus
} from 'lucide-react';
import { CardHeader, DashboardCard, GlassPanel, ProgressBar } from "./_components/ui";
import { InteractiveMascot } from "./_components/interactive-mascot";
import { NeteasePlayer } from "./_components/netease-player";
import { signOut, useSession } from "../lib/auth-client";

type WeatherState = {
  temperature: number | null;
  condition: string;
  windDirection: string;
  windSpeed: number | null;
  humidity: number | null;
  location: string;
  status: "loading" | "ready" | "error";
};

type CalendarEvent = {
  title: string;
  type: "holiday" | "workday" | "observance";
  description: string;
  source: "timor.tech" | "Nager.Date" | "local-fallback";
};

type CalendarDay = {
  key: string;
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  lunarLabel: string;
  events: CalendarEvent[];
};

type CalendarApiResponse = {
  year: number;
  sources: Record<string, boolean>;
  events: Record<string, CalendarEvent[]>;
};

type WeatherApiResponse = {
  temperature: number | null;
  weatherCode: number | null;
  windDirection: number | null;
  windSpeed: number | null;
  humidity: number | null;
  source: "Open-Meteo";
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const DEFAULT_COORDS = { latitude: 31.2304, longitude: 121.4737, location: "上海" };

const weatherDescriptions: Record<number, string> = {
  0: "晴",
  1: "大部晴朗",
  2: "局部多云",
  3: "多云",
  45: "有雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "大毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  80: "阵雨",
  81: "强阵雨",
  82: "暴雨",
  95: "雷暴",
  96: "雷暴伴冰雹",
  99: "强雷暴伴冰雹",
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}年${month}月${day}日 星期${WEEKDAYS[date.getDay()]}`;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatWindDirection(degrees: number | null) {
  if (degrees === null) return "风向未知";
  const directions = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
  return directions[Math.round(degrees / 45) % 8];
}

function fullDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLunarDate(date: Date) {
  try {
    return new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

function sameDate(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function moveMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function moveYear(date: Date, amount: number) {
  return new Date(date.getFullYear() + amount, date.getMonth(), 1);
}

function buildCalendarDays(
  viewDate: Date,
  today: Date,
  selectedDate: Date,
  eventsByDate: Record<string, CalendarEvent[]>
): CalendarDay[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const start = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(start);
    cellDate.setDate(start.getDate() + index);
    const key = fullDateKey(cellDate);
    const events = eventsByDate[key] ?? [];
    const primaryEvent = events.find((event) => event.type === "holiday")
      ?? events.find((event) => event.type === "observance")
      ?? events[0];

    return {
      key,
      date: cellDate,
      day: cellDate.getDate(),
      isCurrentMonth: cellDate.getMonth() === month,
      isToday: sameDate(cellDate, today),
      isSelected: sameDate(cellDate, selectedDate),
      lunarLabel: primaryEvent?.title ?? formatLunarDate(cellDate),
      events,
    };
  });
}

export default function HomeExperience() {
  const { data: session } = useSession();
  const [theme, setTheme] = useState('light');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calendarEvents, setCalendarEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [calendarSources, setCalendarSources] = useState<Record<string, boolean>>({});
  const [loadedCalendarYears, setLoadedCalendarYears] = useState<number[]>([]);
  const [weather, setWeather] = useState<WeatherState>({
    temperature: null,
    condition: "天气获取中",
    windDirection: "风向获取中",
    windSpeed: null,
    humidity: null,
    location: "定位中",
    status: "loading",
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchWeather = async (latitude: number, longitude: number, location: string) => {
      try {
        const params = new URLSearchParams({
          lat: String(latitude),
          lon: String(longitude),
        });
        const response = await fetch(`/api/weather?${params.toString()}`);

        if (!response.ok) {
          throw new Error("Weather request failed");
        }

        const data = await response.json() as WeatherApiResponse;

        if (!isMounted) return;

        setWeather({
          temperature: data.temperature,
          condition: data.weatherCode === null ? "天气未知" : weatherDescriptions[data.weatherCode] ?? "天气未知",
          windDirection: formatWindDirection(data.windDirection),
          windSpeed: data.windSpeed,
          humidity: data.humidity,
          location,
          status: "ready",
        });
      } catch {
        if (!isMounted) return;

        setWeather({
          temperature: null,
          condition: "天气暂不可用",
          windDirection: "风向未知",
          windSpeed: null,
          humidity: null,
          location,
          status: "error",
        });
      }
    };

    const fallbackToDefaultLocation = () => {
      fetchWeather(DEFAULT_COORDS.latitude, DEFAULT_COORDS.longitude, DEFAULT_COORDS.location);
    };

    if (!("geolocation" in navigator)) {
      fallbackToDefaultLocation();
      return () => {
        isMounted = false;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchWeather(position.coords.latitude, position.coords.longitude, "当前位置");
      },
      fallbackToDefaultLocation,
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 10 * 60 * 1000 }
    );

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const viewYear = calendarViewDate.getFullYear();
    const yearsToLoad = new Set([viewYear]);

    if (calendarViewDate.getMonth() === 0) yearsToLoad.add(viewYear - 1);
    if (calendarViewDate.getMonth() === 11) yearsToLoad.add(viewYear + 1);

    const missingYears = Array.from(yearsToLoad).filter((year) => !loadedCalendarYears.includes(year));

    if (missingYears.length === 0) {
      return () => {
        isMounted = false;
      };
    }

    Promise.all(missingYears.map(async (year) => {
      const response = await fetch(`/api/calendar?year=${year}`);
      if (!response.ok) throw new Error("Calendar request failed");
      return await response.json() as CalendarApiResponse;
    }))
      .then((payloads) => {
        if (!isMounted) return;

        setCalendarEvents((current) => {
          const next = { ...current };
          payloads.forEach((payload) => {
            Object.assign(next, payload.events);
          });
          return next;
        });
        setCalendarSources((current) => {
          const next = { ...current };
          payloads.forEach((payload) => {
            Object.entries(payload.sources).forEach(([source, ready]) => {
              next[source] = Boolean(next[source] || ready);
            });
          });
          return next;
        });
        setLoadedCalendarYears((current) => Array.from(new Set([...current, ...payloads.map((payload) => payload.year)])));
      })
      .catch(() => {
        if (!isMounted) return;
        setLoadedCalendarYears((current) => Array.from(new Set([...current, ...missingYears])));
      });

    return () => {
      isMounted = false;
    };
  }, [calendarViewDate, loadedCalendarYears]);

  const calendarDays = useMemo(
    () => buildCalendarDays(calendarViewDate, now, selectedDate, calendarEvents),
    [calendarViewDate, now, selectedDate, calendarEvents]
  );
  const selectedEvents = calendarEvents[fullDateKey(selectedDate)] ?? [];
  const calendarTitle = `${calendarViewDate.getFullYear()}年${calendarViewDate.getMonth() + 1}月`;
  const selectedDateLabel = `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日 星期${WEEKDAYS[selectedDate.getDay()]}`;
  const selectedLunarDate = formatLunarDate(selectedDate);
  const dataSourceLabel = Object.entries(calendarSources)
    .filter(([, ready]) => ready)
    .map(([source]) => source)
    .join(" / ") || "加载中";
  const weatherTemperature = weather.temperature === null ? "--" : `${weather.temperature}°C`;
  const windSpeed = weather.windSpeed === null ? "--" : `${weather.windSpeed} km/h`;
  const humidity = weather.humidity === null ? "--" : `${weather.humidity}%`;

  const toggleTheme = () => {
    setTheme(t => t === 'light' ? 'dark' : 'light');
  };

  const selectCalendarDay = (day: CalendarDay) => {
    setSelectedDate(day.date);

    if (!day.isCurrentMonth) {
      setCalendarViewDate(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
    }
  };

  const jumpToToday = () => {
    const today = new Date();
    setCalendarViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.reload();
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">☯</div>
          <span>博麗の夢</span>
        </div>
        <nav className={`header-nav ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
          <span className="nav-item active">首页</span>
          <span className="nav-item">学习</span>
          <span className="nav-item">生活</span>
          <span className="nav-item">东方</span>
          <span className="nav-item">工具</span>
          <span className="nav-item">关于</span>
        </nav>
        <div className="header-right">
          <div className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </div>
          <Search className="header-icon" size={20} />
          <Bell className="header-icon" size={20} />
          <div className="header-icon" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </div>
          {session?.user ? (
            <div className="header-account">
              {session.user.role === "admin" ? (
                <Link className="header-auth-link admin" href="/admin">
                  <ShieldCheck size={16} />
                  管理
                </Link>
              ) : null}
              <span className="header-user-name">{session.user.name}</span>
              <button className="header-auth-icon" onClick={handleSignOut} type="button" aria-label="退出登录">
                <LogOut size={17} />
              </button>
            </div>
          ) : (
            <div className="header-account">
              <Link className="header-auth-link" href="/login">
                <LogIn size={16} />
                登录
              </Link>
              <Link className="header-auth-icon" href="/register" aria-label="注册">
                <UserPlus size={17} />
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="main-container">
        
        {/* Top Section */}
        <section className="top-section">
          <InteractiveMascot />
          
          <div className="hero-text">
            <h1 className="hero-title">博麗の夢</h1>
            <p className="hero-subtitle">一个记录学习与生活的小站</p>
            <div className="hero-motto">结缘东方 · 博丽神社 · 梦想常在</div>
          </div>
          
          <GlassPanel className="tools-entry">
            <div className="tools-entry-icon">
              <div className="torii-icon">⛩</div>
            </div>
            <div className="tools-entry-text">
              <h3>工具</h3>
              <p>进入工具箱</p>
            </div>
            <ChevronRight size={20} color="var(--text-tertiary)" style={{marginLeft: 'auto'}} />
          </GlassPanel>
        </section>

        {/* Dashboard Grid */}
        <section className="dashboard-grid">
          {/* Card 1: 今日任务 */}
          <DashboardCard>
            <CardHeader
              action={<div className="card-more" style={{fontWeight: 'bold', color: 'var(--text-primary)'}}>3/6</div>}
              icon={<CheckSquare className="card-title-icon" size={18} />}
              title="今日任务"
            />
            <div className="task-list">
              <div className="task-item">
                <div className="task-item-left"><div className="task-checkbox"></div><span className="task-text">复习线性代数</span></div>
                <span className="task-time">09:00</span>
              </div>
              <div className="task-item">
                <div className="task-item-left"><div className="task-checkbox"></div><span className="task-text">阅读《东方求闻史纪》</span></div>
                <span className="task-time">11:30</span>
              </div>
              <div className="task-item completed">
                <div className="task-item-left"><div className="task-checkbox">✓</div><span className="task-text">算法题训练</span></div>
                <span className="task-time">14:00</span>
              </div>
              <div className="task-item completed">
                <div className="task-item-left"><div className="task-checkbox">✓</div><span className="task-text">日记记录</span></div>
                <span className="task-time">21:00</span>
              </div>
              <div className="task-item">
                <div className="task-item-left"><div className="task-checkbox"></div><span className="task-text">锻炼身体</span></div>
                <span className="task-time">未开始</span>
              </div>
              <div className="task-item">
                <div className="task-item-left"><div className="task-checkbox"></div><span className="task-text">整理笔记</span></div>
                <span className="task-time">未开始</span>
              </div>
            </div>
            <div className="task-view-all">查看全部任务 &gt;</div>
          </DashboardCard>

          {/* Card 2: 学习轨迹 */}
          <DashboardCard>
            <CardHeader icon={<Target className="card-title-icon" size={18} />} title="学习轨迹" />
            <div className="chart-stats">
              <span>本周学习时长</span>
              <h2>18.6 <span>h</span></h2>
            </div>
            <div className="chart-container">
              <svg width="100%" height="100%" viewBox="0 0 200 80" preserveAspectRatio="none">
                <path d="M0,60 Q30,50 50,40 T100,50 T150,20 T200,30" fill="none" stroke="var(--accent)" strokeWidth="3" />
                <path d="M0,60 Q30,50 50,40 T100,50 T150,20 T200,30 L200,80 L0,80 Z" fill="var(--progress-bg)" />
                <circle cx="50" cy="40" r="4" fill="var(--bg-color)" stroke="var(--accent)" strokeWidth="2" />
                <circle cx="100" cy="50" r="4" fill="var(--bg-color)" stroke="var(--accent)" strokeWidth="2" />
                <circle cx="150" cy="20" r="4" fill="var(--bg-color)" stroke="var(--accent)" strokeWidth="2" />
                <circle cx="190" cy="28" r="4" fill="var(--bg-color)" stroke="var(--accent)" strokeWidth="2" />
                <text x="180" y="15" fontSize="10" fill="var(--text-primary)" fontWeight="bold">3.2h</text>
              </svg>
            </div>
            <div className="chart-tags">
              <span className="chart-tag">📊 算法与数据结构</span>
              <span className="chart-tag">📈 数学分析 4.1h</span>
              <span className="chart-tag">🇯🇵 日语学习 2.8h</span>
              <span className="chart-tag">💻 操作系统 2.3h</span>
            </div>
          </DashboardCard>

          {/* Card 3: 日记碎片 */}
          <DashboardCard>
            <CardHeader
              action={<div className="card-more">更多 &gt;</div>}
              icon={<AlignLeft className="card-title-icon" size={18} />}
              title="日记碎片"
            />
            <div className="diary-list">
              <div className="diary-item">
                <div className="diary-item-header">
                  <span className="diary-icon">⛩️</span>
                  <span className="diary-title">博丽神社的清晨</span>
                </div>
                <p className="diary-desc">清晨的阳光透过鸟居，洒在石板路上。今天也要好好努力呢。</p>
                <div className="diary-meta">
                  <span>05/18 · 天气晴</span>
                  <Star size={14} color="#f0b44b" fill="#f0b44b" />
                </div>
              </div>
              <div className="diary-item">
                <div className="diary-item-header">
                  <span className="diary-icon">🌸</span>
                  <span className="diary-title">关于梦想的碎片</span>
                </div>
                <p className="diary-desc">梦想就像是远方的结界，既神秘又指引着我前进。</p>
                <div className="diary-meta">
                  <span>05/16 · 心情：平静</span>
                  <span></span>
                </div>
              </div>
              <div className="diary-item">
                <div className="diary-item-header">
                  <span className="diary-icon">✨</span>
                  <span className="diary-title">学习使我快乐</span>
                </div>
                <p className="diary-desc">解决一道难题后的成就感，真是太棒了！</p>
                <div className="diary-meta">
                  <span>05/14 · 心情：开心</span>
                  <span></span>
                </div>
              </div>
            </div>
          </DashboardCard>

          {/* Card 4: 最近收藏 */}
          <DashboardCard>
            <CardHeader
              action={<div className="card-more">更多 &gt;</div>}
              icon={<Heart className="card-title-icon" size={18} />}
              title="最近收藏"
            />
            <div className="collection-list">
              <div className="collection-item">
                <Image src="https://placeholder.co/60x40" alt="东方雅乐集" width={60} height={40} className="collection-img" />
                <div className="collection-info">
                  <div className="collection-title">东方雅乐集 · Vol.4</div>
                  <div className="collection-desc">森罗万象 / 神灵庙</div>
                </div>
                <Heart size={16} className="collection-like" fill="var(--accent)" />
              </div>
              <div className="collection-item">
                <Image src="https://placeholder.co/60x40" alt="幻想乡缘起" width={60} height={40} className="collection-img" />
                <div className="collection-info">
                  <div className="collection-title">幻想乡缘起</div>
                  <div className="collection-desc">ZUN / 官方设定集</div>
                </div>
              </div>
              <div className="collection-item">
                <Image src="https://placeholder.co/60x40" alt="东方梦想" width={60} height={40} className="collection-img" />
                <div className="collection-info">
                  <div className="collection-title">东方梦想</div>
                  <div className="collection-desc">黄昏Frontier / 同人音乐</div>
                </div>
              </div>
              <div className="collection-item">
                <Image src="https://placeholder.co/60x40" alt="异变解读笔记" width={60} height={40} className="collection-img" />
                <div className="collection-info">
                  <div className="collection-title">异变解读笔记</div>
                  <div className="collection-desc">个人笔记 / 研究记录</div>
                </div>
              </div>
            </div>
          </DashboardCard>

          {/* Card 5: 正在播放 & 装饰 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <NeteasePlayer />
            
            <DashboardCard>
              <div className="quote-card">
                <div className="quote-icon">☯</div>
                <div className="quote-text">境界既定，<br/>缘起缘灭，<br/>一切皆在博丽之梦。</div>
              </div>
            </DashboardCard>
          </div>

          {/* Row 2: 时间/天气 */}
          <GlassPanel className="time-weather-card">
            <div className="time-content">
              <div className="card-title" style={{marginBottom: 0}}><MapPin className="card-title-icon" size={18} /> 时间/天气</div>
              <div style={{fontSize: '12px', color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4}}><MapPin size={12} /> {weather.location}</div>
              <div className="time-display">{formatTime(now)}</div>
              <div className="date-display">{formatDate(now)}</div>
              <div className="weather-display">
                <div className="weather-main"><CloudSun size={24} /> {weatherTemperature} {weather.condition}</div>
                <div className="weather-detail">{weather.windDirection} {windSpeed} · 湿度 {humidity}</div>
              </div>
            </div>
            <Image src="https://placeholder.co/140x140" width={140} height={140} className="time-weather-bg" alt="Shrine" />
          </GlassPanel>

          {/* Row 2: 日历 */}
          <DashboardCard>
            <CardHeader
              action={<button className="calendar-today-button" type="button" onClick={jumpToToday}>今天</button>}
              icon={<CalendarDays className="card-title-icon" size={18} />}
              title="日历"
            />
            <div className="calendar-toolbar">
              <button className="calendar-nav-button" type="button" aria-label="上一年" onClick={() => setCalendarViewDate((date) => moveYear(date, -1))}>
                <ChevronsLeft size={16} />
              </button>
              <button className="calendar-nav-button" type="button" aria-label="上个月" onClick={() => setCalendarViewDate((date) => moveMonth(date, -1))}>
                <ChevronLeft size={16} />
              </button>
              <div className="calendar-title">{calendarTitle}</div>
              <button className="calendar-nav-button" type="button" aria-label="下个月" onClick={() => setCalendarViewDate((date) => moveMonth(date, 1))}>
                <ChevronRight size={16} />
              </button>
              <button className="calendar-nav-button" type="button" aria-label="下一年" onClick={() => setCalendarViewDate((date) => moveYear(date, 1))}>
                <ChevronsRight size={16} />
              </button>
            </div>
            <div className="calendar-grid">
              {WEEKDAYS.map((day) => (
                <div className="calendar-day-name" key={day}>{day}</div>
              ))}
              {calendarDays.map((day) => (
                <button
                  className={`calendar-day${day.isCurrentMonth ? "" : " muted"}${day.isToday ? " active" : ""}${day.isSelected ? " selected" : ""}${day.events.some((event) => event.type === "workday") ? " workday" : ""}`}
                  key={day.key}
                  type="button"
                  onClick={() => selectCalendarDay(day)}
                >
                  <span className="calendar-day-number">{day.day}</span>
                  {day.events.length > 0 && <span className="calendar-event-dot" />}
                </button>
              ))}
            </div>
            <div className="calendar-detail" key={fullDateKey(selectedDate)}>
              <div>
                <div className="calendar-detail-date">{selectedDateLabel}</div>
                <div className="calendar-detail-note">
                  农历 {selectedLunarDate} · {sameDate(selectedDate, now) ? "今天" : selectedDate > now ? "未来日期" : "历史日期"}
                </div>
              </div>
              <div className="calendar-event-list">
                {selectedEvents.length > 0 ? selectedEvents.map((event) => (
                  <div className={`calendar-event-item ${event.type}`} key={`${event.title}-${event.type}`}>
                    <span className="calendar-event-marker" />
                    <div>
                      <div className="calendar-event-title">{event.title}</div>
                      <div className="calendar-event-desc">{event.description}</div>
                    </div>
                  </div>
                )) : (
                  <div className="calendar-empty-event">暂无节日或备忘</div>
                )}
              </div>
              <div className="calendar-source">数据源：{dataSourceLabel}</div>
            </div>
          </DashboardCard>

          {/* Row 2: 项目进度 */}
          <DashboardCard>
            <CardHeader
              action={<div className="card-more">更多 &gt;</div>}
              icon={<Target className="card-title-icon" size={18} />}
              title="项目进度"
            />
            <div className="project-list">
              <div className="project-item">
                <div className="project-info"><span>个人网站重构</span> <span className="project-percent">75%</span></div>
                <ProgressBar value={75} />
              </div>
              <div className="project-item">
                <div className="project-info"><span>毕业设计</span> <span className="project-percent">60%</span></div>
                <ProgressBar value={60} />
              </div>
              <div className="project-item">
                <div className="project-info"><span>日语N2备考</span> <span className="project-percent">40%</span></div>
                <ProgressBar value={40} />
              </div>
              <div className="project-item">
                <div className="project-info"><span>游戏开发练习</span> <span className="project-percent">20%</span></div>
                <ProgressBar value={20} />
              </div>
            </div>
          </DashboardCard>

          {/* Row 2: 工具箱 */}
          <DashboardCard>
            <CardHeader icon={<div className="torii-icon card-title-icon">⛩️</div>} title="工具箱" />
            <div className="toolbox-grid">
              <div className="tool-item">
                <div className="tool-icon"><Book size={20} /></div>
                <span className="tool-name">笔记本</span>
              </div>
              <div className="tool-item">
                <div className="tool-icon"><Timer size={20} /></div>
                <span className="tool-name">番茄钟</span>
              </div>
              <div className="tool-item">
                <div className="tool-icon"><CheckSquare size={20} /></div>
                <span className="tool-name">待办清单</span>
              </div>
              <div className="tool-item">
                <div className="tool-icon"><Languages size={20} /></div>
                <span className="tool-name">翻译</span>
              </div>
              <div className="tool-item">
                <div className="tool-icon"><Calculator size={20} /></div>
                <span className="tool-name">计算器</span>
              </div>
              <div className="tool-item">
                <div className="tool-icon"><Dices size={20} /></div>
                <span className="tool-name">随机灵签</span>
              </div>
              <div className="tool-item">
                <div className="tool-icon"><Palette size={20} /></div>
                <span className="tool-name">配色助手</span>
              </div>
              <div className="tool-item">
                <div className="tool-icon"><MoreHorizontal size={20} /></div>
                <span className="tool-name">更多工具</span>
              </div>
            </div>
          </DashboardCard>

          {/* Row 2: Decorative Omamori */}
          <div className="decorative-widget">
            <Image src={theme === 'light' ? "https://placeholder.co/120x180/d33c46/fff?text=Omamori" : "https://placeholder.co/120x120/11162d/5e84f5?text=Butterfly"} alt="Decoration" width={120} height={180} className="decorative-img" />
          </div>

        </section>

      </main>

      {/* Footer */}
      <footer className="footer">
        <div>© 2025 博麗の夢 · 记录学习与生活的点滴</div>
        <div className="footer-icons">
          <BookOpen className="footer-icon" size={16} />
          <Heart className="footer-icon" size={16} />
          <Star className="footer-icon" size={16} />
        </div>
        <div>愿你在幻想乡的每一天都充满奇迹 ✨</div>
      </footer>
    </div>
  );
}
