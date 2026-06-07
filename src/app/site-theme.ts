export type ThemeVars = Record<`--${string}`, string>;

export type BackgroundOption = {
  id: string;
  label: string;
  mood: string;
  src: string;
  accent: string;
  theme: ThemeVars;
};

export const siteName = "博麗の夢";

export const storageKeys = {
  selectedBackground: "hakurei-home-background",
  customBackground: "hakurei-admin-custom-background"
} as const;

export const backgrounds: BackgroundOption[] = [
  {
    id: "dawn",
    label: "晨光神社",
    mood: "朱红、金光、晨雾",
    src: "/backgrounds/hakurei-shrine-dawn.webp",
    accent: "#e2323f",
    theme: {
      "--background": "#fff2ee",
      "--foreground": "#261d22",
      "--muted": "#76565d",
      "--line": "rgba(164, 65, 69, 0.22)",
      "--surface": "rgba(255, 248, 244, 0.78)",
      "--surface-strong": "rgba(255, 252, 249, 0.92)",
      "--theme-accent": "#e2323f",
      "--theme-accent-2": "#f2b84b",
      "--theme-base": "#fff2ee",
      "--theme-ink": "#291b23",
      "--theme-muted": "#76565d",
      "--theme-shadow": "0 26px 86px rgba(111, 32, 43, 0.24)",
      "--theme-glow": "rgba(226, 50, 63, 0.34)",
      "--theme-glow-2": "rgba(242, 184, 75, 0.28)",
      "--hero-wash": "linear-gradient(90deg, rgba(255, 244, 238, 0.96) 0%, rgba(255, 231, 220, 0.66) 42%, rgba(255, 242, 238, 0.2) 100%)",
      "--hero-bottom": "linear-gradient(180deg, rgba(255, 242, 238, 0) 0%, #fff2ee 72%)",
      "--theme-card-border": "rgba(255, 255, 255, 0.72)",
      "--theme-ribbon": "rgba(226, 50, 63, 0.22)",
      "--theme-filter": "saturate(1.14) contrast(1.04)"
    }
  },
  {
    id: "boundary",
    label: "樱色结界",
    mood: "樱粉、紫雾、柔亮",
    src: "/backgrounds/sakura-boundary.webp",
    accent: "#ce4f96",
    theme: {
      "--background": "#fff0f8",
      "--foreground": "#2c1d2d",
      "--muted": "#73516e",
      "--line": "rgba(169, 70, 137, 0.22)",
      "--surface": "rgba(255, 246, 252, 0.76)",
      "--surface-strong": "rgba(255, 252, 255, 0.92)",
      "--theme-accent": "#ce4f96",
      "--theme-accent-2": "#875ee8",
      "--theme-base": "#fff0f8",
      "--theme-ink": "#2c1d2d",
      "--theme-muted": "#73516e",
      "--theme-shadow": "0 26px 90px rgba(94, 35, 92, 0.24)",
      "--theme-glow": "rgba(206, 79, 150, 0.34)",
      "--theme-glow-2": "rgba(135, 94, 232, 0.28)",
      "--hero-wash": "linear-gradient(90deg, rgba(255, 241, 249, 0.96) 0%, rgba(249, 222, 251, 0.66) 44%, rgba(255, 241, 249, 0.18) 100%)",
      "--hero-bottom": "linear-gradient(180deg, rgba(255, 240, 248, 0) 0%, #fff0f8 72%)",
      "--theme-card-border": "rgba(255, 255, 255, 0.72)",
      "--theme-ribbon": "rgba(206, 79, 150, 0.22)",
      "--theme-filter": "saturate(1.2) contrast(1.03) hue-rotate(4deg)"
    }
  },
  {
    id: "night",
    label: "符卡夜色",
    mood: "靛蓝、星光、电弧",
    src: "/backgrounds/spellcard-night.webp",
    accent: "#6687ff",
    theme: {
      "--background": "#11162d",
      "--foreground": "#f6f0ff",
      "--muted": "#b8b5d6",
      "--line": "rgba(163, 180, 255, 0.22)",
      "--surface": "rgba(25, 28, 54, 0.74)",
      "--surface-strong": "rgba(36, 39, 72, 0.9)",
      "--theme-accent": "#6687ff",
      "--theme-accent-2": "#f165b4",
      "--theme-base": "#11162d",
      "--theme-ink": "#f7f0ff",
      "--theme-muted": "#b8b5d6",
      "--theme-shadow": "0 28px 96px rgba(4, 8, 26, 0.46)",
      "--theme-glow": "rgba(102, 135, 255, 0.36)",
      "--theme-glow-2": "rgba(241, 101, 180, 0.28)",
      "--hero-wash": "linear-gradient(90deg, rgba(14, 18, 42, 0.94) 0%, rgba(21, 22, 55, 0.68) 45%, rgba(11, 14, 35, 0.24) 100%)",
      "--hero-bottom": "linear-gradient(180deg, rgba(17, 22, 45, 0) 0%, #11162d 72%)",
      "--theme-card-border": "rgba(192, 203, 255, 0.2)",
      "--theme-ribbon": "rgba(102, 135, 255, 0.2)",
      "--theme-filter": "saturate(1.26) contrast(1.1) brightness(0.92)"
    }
  }
];

export function createCustomBackground(src: string): BackgroundOption {
  return {
    id: "custom",
    label: "自定义底图",
    mood: "管理页裁切保存",
    src,
    accent: "#d93b51",
    theme: {
      ...backgrounds[0].theme,
      "--theme-accent": "#d93b51",
      "--theme-accent-2": "#f0b44b",
      "--theme-glow": "rgba(217, 59, 81, 0.34)",
      "--theme-ribbon": "rgba(217, 59, 81, 0.22)",
      "--theme-filter": "saturate(1.16) contrast(1.05)"
    }
  };
}

export function applyThemeVars(theme: ThemeVars) {
  if (typeof document === "undefined") {
    return;
  }

  Object.entries(theme).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
}
