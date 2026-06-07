"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  applyThemeVars,
  backgrounds,
  createCustomBackground,
  siteName,
  storageKeys
} from "./site-theme";

const studyItems = [
  {
    title: "学习笔记",
    text: "整理课程、阅读、项目踩坑，把零散知识收束成可以复用的地图。",
    meta: "Notes / Courses"
  },
  {
    title: "今日推进",
    text: "保留一块给近期目标：正在看的书、正在写的代码、正在补的基础。",
    meta: "Now / Focus"
  },
  {
    title: "小工具箱",
    text: "放置自用工具、实验页面和自动化脚本入口，让学习流程更顺手。",
    meta: "Tools / Labs"
  }
];

const lifeItems = ["日常随笔", "读书摘记", "灵感片段", "音乐与游戏", "东方同好", "站点工事"];

const updates = [
  "主页主题重构：东方幻想风个人门户",
  "准备接入学习笔记与生活记录入口",
  "背景图支持预设切换与管理页上传"
];

export default function HomeExperience() {
  const [selectedId, setSelectedId] = useState(backgrounds[0].id);
  const [customBackgroundSrc, setCustomBackgroundSrc] = useState<string | null>(
    null
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKeys.selectedBackground);
    const hasSavedPreference = Boolean(saved);

    if (saved) {
      setSelectedId(saved);
    }

    fetch("/api/background", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { custom?: { src: string } } | null) => {
        if (!payload?.custom?.src) {
          return;
        }

        setCustomBackgroundSrc(payload.custom.src);

        if (!hasSavedPreference) {
          setSelectedId("custom");
        }
      })
      .catch(() => {
        setCustomBackgroundSrc(null);
      });
  }, []);

  const availableBackgrounds = useMemo(() => {
    if (!customBackgroundSrc) {
      return backgrounds;
    }

    return [...backgrounds, createCustomBackground(customBackgroundSrc)];
  }, [customBackgroundSrc]);

  const selectedBackground = useMemo(
    () =>
      availableBackgrounds.find((background) => background.id === selectedId) ??
      backgrounds[0],
    [availableBackgrounds, selectedId]
  );

  useEffect(() => {
    applyThemeVars(selectedBackground.theme);
  }, [selectedBackground]);

  function chooseBackground(id: string) {
    setSelectedId(id);
    window.localStorage.setItem(storageKeys.selectedBackground, id);
  }

  const pageStyle = {
    "--hero-background": `url(${selectedBackground.src})`,
    "--theme-accent": selectedBackground.accent,
    ...selectedBackground.theme
  } as CSSProperties;

  return (
    <div className="home-scene" data-theme={selectedBackground.id} style={pageStyle}>
      <div className="ambient-layer" aria-hidden="true">
        <span className="spell-ring spell-ring-one" />
        <span className="spell-ring spell-ring-two" />
        <span className="spell-ring spell-ring-three" />
        <span className="ofuda ofuda-one" />
        <span className="ofuda ofuda-two" />
        <span className="energy-ribbon energy-ribbon-one" />
        <span className="energy-ribbon energy-ribbon-two" />
        <span className="danmaku danmaku-one" />
        <span className="danmaku danmaku-two" />
        <span className="petal petal-one" />
        <span className="petal petal-two" />
        <span className="petal petal-three" />
      </div>

      <section className="home-hero" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">{siteName}</p>
          <h1 id="home-title">在幻想与日常之间，整理学习、生活与自己的节奏。</h1>
          <p className="lead">
            一个以东方 Project 氛围为底色的个人门户。这里会收纳学习笔记、生活记录、自用工具，以及一些只属于我的兴趣与表达。
          </p>

          <div className="hero-actions" aria-label="主页入口">
            <a className="button primary-button" href="#study">
              学习记录
            </a>
            <a className="button ghost-button" href="#life">
              生活片段
            </a>
            <Link className="button ghost-button" href="/tools">
              工具箱
            </Link>
            <Link className="button ghost-button" href="/admin">
              管理入口
            </Link>
          </div>
        </div>

        <aside className="hero-panel" aria-label="当前状态">
          <div>
            <p className="panel-kicker">Today's Shrine Note</p>
            <h2>先把今天的知识整理成明天能继续前进的路标。</h2>
          </div>
          <dl className="status-grid">
            <div>
              <dt>主线</dt>
              <dd>学习沉淀</dd>
            </div>
            <div>
              <dt>副线</dt>
              <dd>生活记录</dd>
            </div>
            <div>
              <dt>气质</dt>
              <dd>明快轻盈</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="background-dock" aria-label="背景主题">
        {availableBackgrounds.map((background) => (
          <button
            className="background-choice"
            key={background.id}
            onClick={() => chooseBackground(background.id)}
            style={{ "--choice-accent": background.accent } as CSSProperties}
            type="button"
            aria-pressed={background.id === selectedId}
          >
            <span />
            <strong>{background.label}</strong>
            <small>{background.mood}</small>
          </button>
        ))}
      </section>

      <section className="content-band study-band" id="study" aria-labelledby="study-title">
        <div className="section-heading">
          <p className="eyebrow">Study</p>
          <h2 id="study-title">学习记录</h2>
          <p>
            主页第一优先级是让学习内容更容易被看见：当前推进、沉淀入口、工具入口都放在靠前位置。
          </p>
        </div>

        <div className="study-grid">
          {studyItems.map((item) => (
            <article className="portal-card study-card" key={item.title}>
              <p>{item.meta}</p>
              <h3>{item.title}</h3>
              <span>{item.text}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="content-band split-band" id="life" aria-labelledby="life-title">
        <div className="section-heading compact-heading">
          <p className="eyebrow">Life & Self</p>
          <h2 id="life-title">生活与个性</h2>
          <p>
            生活记录不需要喧宾夺主，但要留出清晰入口，让随笔、兴趣和站点更新自然生长。
          </p>
        </div>

        <div className="life-layout">
          <div className="tag-cloud" aria-label="内容标签">
            {lifeItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>

          <article className="portal-card update-card">
            <p>Recent</p>
            <h3>最近更新</h3>
            <ul>
              {updates.map((update) => (
                <li key={update}>{update}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}
