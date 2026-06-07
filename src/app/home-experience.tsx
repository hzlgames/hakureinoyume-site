"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { 
  Search, Bell, BookOpen, Heart,
  Play, Pause, SkipBack, SkipForward, Music,
  CloudSun, CalendarDays, Book, Timer, CheckSquare,
  Languages, Calculator, Dices, Palette, MoreHorizontal,
  ChevronRight, Star, Moon, Sun, Target, AlignLeft, MapPin, Menu, X
} from 'lucide-react';
import { CardHeader, DashboardCard, GlassPanel, ProgressBar } from "./_components/ui";

export default function HomeExperience() {
  const [theme, setTheme] = useState('light');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(t => t === 'light' ? 'dark' : 'light');
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
          <div className="header-avatar">
            <Image src="https://placeholder.co/100x100/d33c46/fff?text=R" alt="avatar" width={100} height={100} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-container">
        
        {/* Top Section */}
        <section className="top-section">
          <div className="mascot-widget">
            <div className="mascot-img-placeholder"></div>
            <div className="mascot-bubble">
              <p>需要帮忙吗？</p>
              <p>今天也要加油哦！✨</p>
            </div>
          </div>
          
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
            <DashboardCard className="music-player">
              <CardHeader
                action={<ChevronRight size={16} color="var(--text-tertiary)" />}
                icon={<Music className="card-title-icon" size={18} />}
                title="正在播放"
              />
              <div className="music-cover-wrapper">
                <div className="music-vinyl"></div>
                <Image src="https://placeholder.co/140x140" alt="Album Cover" width={140} height={140} className="music-cover" />
              </div>
              <div className="music-title">幻梦的风 🍃</div>
              <div className="music-artist">幽闭サテライト</div>
              <div className="music-controls">
                <div className="music-btn"><SkipBack size={16} /></div>
                <div className="music-btn play" onClick={() => setIsPlaying(!isPlaying)}>
                  {isPlaying ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
                </div>
                <div className="music-btn"><SkipForward size={16} /></div>
              </div>
              <div className="music-progress">
                <span>01:24</span>
                <div className="music-bar"><div className="music-bar-fill"></div></div>
                <span>04:36</span>
              </div>
            </DashboardCard>
            
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
              <div style={{fontSize: '12px', color: 'var(--text-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4}}><MapPin size={12} /> 幻想乡 · 博丽神社</div>
              <div className="time-display">14:28:36</div>
              <div className="date-display">2025年05月18日 星期日</div>
              <div className="weather-display">
                <div className="weather-main"><CloudSun size={24} /> 23°C 多云转晴</div>
                <div className="weather-detail">东风 2级 · 湿度 58%</div>
              </div>
            </div>
            <Image src="https://placeholder.co/140x140" width={140} height={140} className="time-weather-bg" alt="Shrine" />
          </GlassPanel>

          {/* Row 2: 日历 */}
          <DashboardCard>
            <CardHeader
              action={<div className="card-more" style={{color: 'var(--text-primary)', fontWeight: 600}}>2025年5月 &gt;</div>}
              icon={<CalendarDays className="card-title-icon" size={18} />}
              title="日历"
            />
            <div className="calendar-grid">
              <div className="calendar-day-name">日</div>
              <div className="calendar-day-name">一</div>
              <div className="calendar-day-name">二</div>
              <div className="calendar-day-name">三</div>
              <div className="calendar-day-name">四</div>
              <div className="calendar-day-name">五</div>
              <div className="calendar-day-name">六</div>
              
              <div className="calendar-day muted">27</div>
              <div className="calendar-day muted">28</div>
              <div className="calendar-day muted">29</div>
              <div className="calendar-day muted">30</div>
              <div className="calendar-day">1</div>
              <div className="calendar-day">2</div>
              <div className="calendar-day">3</div>
              <div className="calendar-day">4</div>
              <div className="calendar-day">5</div>
              <div className="calendar-day">6</div>
              <div className="calendar-day">7</div>
              <div className="calendar-day">8</div>
              <div className="calendar-day">9</div>
              <div className="calendar-day">10</div>
              <div className="calendar-day">11</div>
              <div className="calendar-day">12</div>
              <div className="calendar-day">13</div>
              <div className="calendar-day">14</div>
              <div className="calendar-day">15</div>
              <div className="calendar-day">16</div>
              <div className="calendar-day">17</div>
              <div className="calendar-day active">18</div>
              <div className="calendar-day">19</div>
              <div className="calendar-day">20</div>
              <div className="calendar-day">21</div>
              <div className="calendar-day">22</div>
              <div className="calendar-day">23</div>
              <div className="calendar-day">24</div>
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
