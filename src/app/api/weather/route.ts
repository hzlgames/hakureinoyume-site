import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 600;

type WeatherPayload = {
  temperature: number | null;
  weatherCode: number | null;
  windDirection: number | null;
  windSpeed: number | null;
  humidity: number | null;
  source: "Open-Meteo";
};

function parseCoordinate(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = parseCoordinate(searchParams.get("lat"), 31.2304, -90, 90);
  const longitude = parseCoordinate(searchParams.get("lon"), 121.4737, -180, 180);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m",
    timezone: "auto",
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: AbortSignal.timeout(6000),
      next: { revalidate },
    });

    if (!response.ok) {
      throw new Error("Open-Meteo request failed");
    }

    const data = await response.json();
    const current = data.current ?? {};
    const payload: WeatherPayload = {
      temperature: typeof current.temperature_2m === "number" ? Math.round(current.temperature_2m) : null,
      weatherCode: typeof current.weather_code === "number" ? current.weather_code : null,
      windDirection: typeof current.wind_direction_10m === "number" ? current.wind_direction_10m : null,
      windSpeed: typeof current.wind_speed_10m === "number" ? Math.round(current.wind_speed_10m) : null,
      humidity: typeof current.relative_humidity_2m === "number" ? Math.round(current.relative_humidity_2m) : null,
      source: "Open-Meteo",
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Weather unavailable", source: "Open-Meteo" },
      { status: 503 }
    );
  }
}
