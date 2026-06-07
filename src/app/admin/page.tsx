"use client";

import Link from "next/link";
import type { CSSProperties, ChangeEvent } from "react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  applyThemeVars,
  backgrounds,
  createCustomBackground,
  siteName,
  storageKeys
} from "../site-theme";

type PublicBackgroundResponse = {
  custom: {
    src: string;
    updatedAt?: string;
  } | null;
};

const outputWidth = 1600;
const outputHeight = 1000;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawCroppedImage(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  zoom: number,
  offsetX: number,
  offsetY: number
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const maxOffsetX = Math.max(0, (drawWidth - width) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - height) / 2);
  const imageOffsetX = clamp((offsetX / 100) * width, -maxOffsetX, maxOffsetX);
  const imageOffsetY = clamp((offsetY / 100) * height, -maxOffsetY, maxOffsetY);
  const drawX = (width - drawWidth) / 2 + imageOffsetX;
  const drawY = (height - drawHeight) / 2 + imageOffsetY;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#1d1720";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

export default function AdminPage() {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [zoom, setZoom] = useState(1.08);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [serverBackground, setServerBackground] =
    useState<PublicBackgroundResponse["custom"]>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/session", { cache: "no-store" })
        .then((response) => response.json())
        .catch(() => ({ authenticated: false })),
      fetch("/api/background", { cache: "no-store" })
        .then((response) => response.json())
        .catch(() => ({ custom: null }))
    ]).then(([sessionPayload, backgroundPayload]) => {
      setAuthenticated(Boolean(sessionPayload.authenticated));
      setServerBackground(backgroundPayload.custom);
      setCheckingAuth(false);
    });
  }, []);

  const activeBackground = useMemo(() => {
    if (serverBackground?.src) {
      return createCustomBackground(serverBackground.src);
    }

    return backgrounds[0];
  }, [serverBackground]);

  useEffect(() => {
    applyThemeVars(activeBackground.theme);
  }, [activeBackground]);

  useEffect(() => {
    if (!sourceImage) {
      return;
    }

    let cancelled = false;

    loadImage(sourceImage)
      .then((image) => {
        if (cancelled || !previewRef.current) {
          return;
        }

        previewRef.current.width = 1200;
        previewRef.current.height = 750;
        drawCroppedImage(previewRef.current, image, zoom, offsetX, offsetY);
      })
      .catch(() => setNotice("图片预览失败，请换一张图片。"));

    return () => {
      cancelled = true;
    };
  }, [offsetX, offsetY, sourceImage, zoom]);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      setLoginError("Access token 不正确。");
      setToken("");
      return;
    }

    setToken("");
    setAuthenticated(true);
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setNotice("请选择图片文件。");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setNotice("图片不能超过 10MB。");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSourceImage(String(reader.result));
      setFileName(file.name);
      setZoom(1.08);
      setOffsetX(0);
      setOffsetY(0);
      setNotice("");
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveBackground() {
    if (!sourceImage) {
      setNotice("请先选择图片。");
      return;
    }

    setSaving(true);
    setNotice("");

    try {
      const image = await loadImage(sourceImage);
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      drawCroppedImage(canvas, image, zoom, offsetX, offsetY);

      const imageData = canvas.toDataURL("image/webp", 0.86);
      const response = await fetch("/api/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData })
      });

      if (!response.ok) {
        throw new Error("upload_failed");
      }

      const payload = (await response.json()) as PublicBackgroundResponse;
      setServerBackground(payload.custom);
      window.localStorage.setItem(storageKeys.selectedBackground, "custom");
      setNotice("背景图已保存。");
    } catch {
      setNotice("保存失败，请重新登录或更换图片。");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetBackground() {
    setSaving(true);
    setNotice("");

    try {
      const response = await fetch("/api/background", { method: "DELETE" });

      if (!response.ok) {
        throw new Error("delete_failed");
      }

      setServerBackground(null);
      window.localStorage.setItem(storageKeys.selectedBackground, backgrounds[0].id);
      setNotice("已恢复预设背景。");
    } catch {
      setNotice("重置失败，请重新登录后再试。");
    } finally {
      setSaving(false);
    }
  }

  const pageStyle = {
    "--hero-background": `url(${activeBackground.src})`,
    "--theme-accent": activeBackground.accent,
    ...activeBackground.theme
  } as CSSProperties;

  return (
    <div className="home-scene admin-scene" style={pageStyle}>
      <div className="ambient-layer" aria-hidden="true">
        <span className="spell-ring spell-ring-one" />
        <span className="spell-ring spell-ring-two" />
        <span className="spell-ring spell-ring-three" />
        <span className="energy-ribbon energy-ribbon-one" />
        <span className="energy-ribbon energy-ribbon-two" />
        <span className="ofuda ofuda-one" />
        <span className="petal petal-one" />
        <span className="danmaku danmaku-one" />
      </div>

      <section className="admin-shell" aria-labelledby="admin-title">
        <div className="section-heading admin-heading">
          <p className="eyebrow">{siteName}</p>
          <h1 id="admin-title">管理入口</h1>
        </div>

        {checkingAuth ? (
          <div className="portal-card admin-card">
            <p>Session</p>
            <h2>正在校验</h2>
          </div>
        ) : authenticated ? (
          <div className="admin-grid">
            <section className="portal-card admin-card crop-card" aria-label="背景图裁切">
              <div className="card-title-row">
                <div>
                  <p>Background</p>
                  <h2>更换背景图</h2>
                </div>
                <button className="icon-button" type="button" onClick={handleLogout}>
                  退出
                </button>
              </div>

              <label className="file-drop">
                <input
                  accept="image/avif,image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  type="file"
                />
                <span>{fileName || "选择图片"}</span>
              </label>

              <div className="crop-preview">
                {sourceImage ? (
                  <canvas ref={previewRef} />
                ) : (
                  <div className="empty-preview">16:10</div>
                )}
              </div>

              <div className="control-grid">
                <label>
                  <span>缩放</span>
                  <input
                    max="2.2"
                    min="1"
                    onChange={(event) => setZoom(Number(event.target.value))}
                    step="0.01"
                    type="range"
                    value={zoom}
                  />
                </label>
                <label>
                  <span>水平</span>
                  <input
                    max="50"
                    min="-50"
                    onChange={(event) => setOffsetX(Number(event.target.value))}
                    step="1"
                    type="range"
                    value={offsetX}
                  />
                </label>
                <label>
                  <span>垂直</span>
                  <input
                    max="50"
                    min="-50"
                    onChange={(event) => setOffsetY(Number(event.target.value))}
                    step="1"
                    type="range"
                    value={offsetY}
                  />
                </label>
              </div>

              <div className="admin-actions">
                <button
                  className="button primary-button"
                  disabled={saving || !sourceImage}
                  onClick={handleSaveBackground}
                  type="button"
                >
                  {saving ? "保存中" : "保存背景"}
                </button>
                <button
                  className="button ghost-button"
                  disabled={saving}
                  onClick={handleResetBackground}
                  type="button"
                >
                  恢复预设
                </button>
                <Link className="button ghost-button" href="/">
                  返回首页
                </Link>
              </div>

              {notice ? <p className="admin-notice">{notice}</p> : null}
            </section>

            <aside className="portal-card admin-card admin-status">
              <p>Current</p>
              <h2>{serverBackground ? "自定义背景已启用" : "当前使用预设背景"}</h2>
              <dl>
                <div>
                  <dt>输出比例</dt>
                  <dd>16:10</dd>
                </div>
                <div>
                  <dt>输出尺寸</dt>
                  <dd>
                    {outputWidth} x {outputHeight}
                  </dd>
                </div>
                <div>
                  <dt>Access token</dt>
                  <dd>服务端校验</dd>
                </div>
              </dl>
            </aside>
          </div>
        ) : (
          <form className="portal-card admin-card login-card" onSubmit={handleLogin}>
            <p>Access</p>
            <h2>输入 access token</h2>
            <label>
              <span>Token</span>
              <input
                autoComplete="off"
                inputMode="text"
                onChange={(event) => setToken(event.target.value)}
                type="password"
                value={token}
              />
            </label>
            <button className="button primary-button" type="submit">
              进入管理
            </button>
            {loginError ? <p className="admin-notice">{loginError}</p> : null}
          </form>
        )}
      </section>
    </div>
  );
}
