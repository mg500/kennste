"use client";

import { useEffect, useRef } from "react";

const BAR_COUNT = 64;

export type VisStyle = "bars" | "wave" | "circle";

interface Props {
  bpm?: number | null;
  isPlaying: boolean;
  mode: "simulated" | "microphone";
  style: VisStyle;
  accentColor?: string;
}

function drawBars(ctx: CanvasRenderingContext2D, values: number[], w: number, h: number, color: string) {
  ctx.clearRect(0, 0, w, h);
  const barW = w / values.length;
  for (let i = 0; i < values.length; i++) {
    const barH = Math.max(2, values[i] * h);
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(0.55, color);
    grad.addColorStop(0.8, "#00e5ff");
    grad.addColorStop(1, "#ff1744");
    ctx.fillStyle = grad;
    ctx.fillRect(i * barW + 0.5, h - barH, barW - 1, barH);
  }
}

function drawWave(ctx: CanvasRenderingContext2D, values: number[], w: number, h: number, color: string) {
  ctx.clearRect(0, 0, w, h);
  const mid = h / 2;

  ctx.save();
  ctx.shadowBlur = 10;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();

  const step = w / (values.length - 1);
  for (let i = 0; i < values.length; i++) {
    const x = i * step;
    const y = mid - (values[i] - 0.5) * h * 0.85;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const px = (i - 1) * step;
      const py = mid - (values[i - 1] - 0.5) * h * 0.85;
      ctx.bezierCurveTo((px + x) / 2, py, (px + x) / 2, y, x, y);
    }
  }
  ctx.stroke();
  ctx.restore();

  // Mirror below
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.shadowBlur = 6;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = i * step;
    const y = mid + (values[i] - 0.5) * h * 0.85;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const px = (i - 1) * step;
      const py = mid + (values[i - 1] - 0.5) * h * 0.85;
      ctx.bezierCurveTo((px + x) / 2, py, (px + x) / 2, y, x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawCircle(ctx: CanvasRenderingContext2D, values: number[], w: number, h: number, color: string) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w, h) * 0.22;
  const maxLen = Math.min(w, h) * 0.28;
  const angleStep = (Math.PI * 2) / values.length;
  const lineW = ((Math.PI * 2 * base) / values.length) * 0.75;

  ctx.lineCap = "round";

  for (let i = 0; i < values.length; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const len = Math.max(2, values[i] * maxLen);
    const x1 = cx + Math.cos(angle) * base;
    const y1 = cy + Math.sin(angle) * base;
    const x2 = cx + Math.cos(angle) * (base + len);
    const y2 = cy + Math.sin(angle) * (base + len);

    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, color);
    grad.addColorStop(1, values[i] > 0.7 ? "#ff1744" : "#00e5ff");

    ctx.strokeStyle = grad;
    ctx.lineWidth = lineW;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, base * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export default function Visualizer({ bpm, isPlaying, mode, style, accentColor = "#1DB954" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const simState = useRef({
    bars: Array(BAR_COUNT).fill(0.5) as number[],
    velocities: Array(BAR_COUNT).fill(0) as number[],
    lastBeat: 0,
  });
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = (values: number[]) => {
      const { width, height } = canvas;
      if (style === "bars") drawBars(ctx, values, width, height, accentColor);
      else if (style === "wave") drawWave(ctx, values, width, height, accentColor);
      else drawCircle(ctx, values, width, height, accentColor);
    };

    if (mode === "simulated") {
      const beatInterval = bpm ? 60000 / bpm : 500;
      const s = simState.current;

      const draw = (now: number) => {
        if (now - s.lastBeat >= beatInterval) {
          s.lastBeat = now;
          for (let i = 0; i < BAR_COUNT; i++) {
            if (Math.random() < 0.85) {
              s.velocities[i] += (Math.random() * 0.5 + 0.2) * (1 - (i / BAR_COUNT) * 0.5);
            }
          }
        }
        for (let i = 0; i < BAR_COUNT; i++) {
          s.velocities[i] += (Math.random() - 0.55) * 0.03 * (1 - (i / BAR_COUNT) * 0.4);
          s.velocities[i] *= 0.88;
          s.bars[i] = Math.max(0.02, Math.min(1, s.bars[i] + s.velocities[i]));
        }
        const smoothed = [...s.bars];
        for (let i = 1; i < BAR_COUNT - 1; i++) {
          smoothed[i] = s.bars[i] * 0.6 + s.bars[i - 1] * 0.2 + s.bars[i + 1] * 0.2;
        }
        render(smoothed);
        frameRef.current = requestAnimationFrame(draw);
      };

      frameRef.current = requestAnimationFrame(draw);
    } else {
      (async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          streamRef.current = stream;
          const audioCtx = new AudioContext();
          audioCtxRef.current = audioCtx;
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = style === "wave" ? 256 : 128;
          analyser.smoothingTimeConstant = 0.8;
          audioCtx.createMediaStreamSource(stream).connect(analyser);

          const freqData = new Uint8Array(analyser.frequencyBinCount);
          const timeData = new Uint8Array(analyser.fftSize);
          const binPerBar = Math.floor(freqData.length / BAR_COUNT);

          const draw = () => {
            let values: number[];
            if (style === "wave") {
              analyser.getByteTimeDomainData(timeData);
              const step = Math.floor(timeData.length / BAR_COUNT);
              values = Array.from({ length: BAR_COUNT }, (_, i) => timeData[i * step] / 255);
            } else {
              analyser.getByteFrequencyData(freqData);
              values = Array.from({ length: BAR_COUNT }, (_, i) => {
                let sum = 0;
                for (let j = 0; j < binPerBar; j++) sum += freqData[i * binPerBar + j];
                return (sum / binPerBar) / 255;
              });
            }
            render(values);
            frameRef.current = requestAnimationFrame(draw);
          };

          frameRef.current = requestAnimationFrame(draw);
        } catch {
          console.error("Mikrofon-Zugriff verweigert");
        }
      })();
    }

    return () => {
      cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, [bpm, isPlaying, mode, style, accentColor]);

  const height = style === "circle" ? 160 : 96;
  return <canvas ref={canvasRef} width={320} height={height} className="w-full rounded-lg bg-black" />;
}
