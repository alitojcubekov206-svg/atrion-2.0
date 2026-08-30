"use client";

import { useEffect, useRef } from "react";
import Matter from "matter-js";

const VIOLET = "#a78bfa";
const VIOLET_HOT = "#c4b5fd";
const MAGENTA = "#e879f9";
const DARK = "#8b6dd8";
const COLORS = [VIOLET, VIOLET_HOT, MAGENTA, DARK];

const WALL_THICKNESS = 8;
const SPAWN_PAUSE_MS = 450;
const RESET_PAUSE_MS = 550;

type Phase = "falling" | "waiting" | "resetting" | "pending";

interface Square {
  body: Matter.Body;
  color: string;
}

export default function CubesLoop({ className = "h-40 w-full" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx = ctx2d;

    // Size the drawing space to whatever box this is actually placed in,
    // rather than a fixed resolution — a mismatched aspect ratio would
    // stretch the canvas via CSS and throw off every physics coordinate.
    const rect = canvas.getBoundingClientRect();
    const W = rect.width || 220;
    const H = rect.height || 160;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const boxW = W * 0.6;
    const boxH = H * 0.48;
    const squareSize = Math.max(16, W * 0.105);
    const boxLeft = (W - boxW) / 2;
    const boxRight = boxLeft + boxW;
    const boxBottom = H - H * 0.08;
    const boxTop = boxBottom - boxH; // open top — the "overflow" line

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0.42 },
      enableSleeping: true,
    });
    engine.timing.timeScale = 0.72;
    const world = engine.world;

    const wallOpts: Matter.IChamferableBodyDefinition = { isStatic: true, friction: 0.4 };
    const floor = Matter.Bodies.rectangle(
      (boxLeft + boxRight) / 2,
      boxBottom + WALL_THICKNESS / 2,
      boxW + WALL_THICKNESS * 2,
      WALL_THICKNESS,
      wallOpts
    );
    const leftWall = Matter.Bodies.rectangle(
      boxLeft,
      (boxTop + boxBottom) / 2,
      WALL_THICKNESS,
      boxH,
      wallOpts
    );
    const rightWall = Matter.Bodies.rectangle(
      boxRight,
      (boxTop + boxBottom) / 2,
      WALL_THICKNESS,
      boxH,
      wallOpts
    );
    Matter.World.add(world, [floor, leftWall, rightWall]);

    const squares: Square[] = [];
    let spawnIndex = 0;
    let phase: Phase = "pending";
    let timer = 200;
    let fadeAlpha = 1;

    function spawnSquare() {
      const x = boxLeft + squareSize / 2 + 4 + Math.random() * (boxW - squareSize - 8);
      const body = Matter.Bodies.rectangle(x, boxTop - H * 0.35, squareSize, squareSize, {
        restitution: 0.55,
        friction: 0.2,
        frictionAir: 0.012,
        density: 0.0025,
        angle: (Math.random() - 0.5) * 0.7,
      });
      Matter.World.add(world, body);
      squares.push({ body, color: COLORS[spawnIndex % COLORS.length] });
      spawnIndex += 1;
      phase = "falling";
    }

    function resetAll() {
      squares.forEach((s) => Matter.World.remove(world, s.body));
      squares.length = 0;
      spawnIndex = 0;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // Box: floor + two open-top side walls.
      ctx.strokeStyle = "rgba(167,139,250,0.55)";
      ctx.fillStyle = "rgba(167,139,250,0.08)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(boxLeft, boxTop);
      ctx.lineTo(boxLeft, boxBottom);
      ctx.lineTo(boxRight, boxBottom);
      ctx.lineTo(boxRight, boxTop);
      ctx.stroke();
      ctx.fillRect(boxLeft, boxTop, boxW, boxH);

      const alpha = phase === "resetting" ? fadeAlpha : 1;
      squares.forEach(({ body, color }) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        const r = 3;
        ctx.beginPath();
        ctx.roundRect(-squareSize / 2, -squareSize / 2, squareSize, squareSize, r);
        ctx.fill();
        ctx.restore();
      });
    }

    let rafId = 0;
    let last = performance.now();

    function loop(now: number) {
      const delta = Math.min(now - last, 33);
      last = now;
      Matter.Engine.update(engine, delta);

      if (phase === "pending") {
        timer -= delta;
        if (timer <= 0) spawnSquare();
      } else if (phase === "falling") {
        const active = squares[squares.length - 1]?.body;
        if (active && active.isSleeping) {
          if (active.bounds.min.y < boxTop) {
            phase = "resetting";
            timer = RESET_PAUSE_MS;
            fadeAlpha = 1;
          } else {
            phase = "waiting";
            timer = SPAWN_PAUSE_MS;
          }
        }
      } else if (phase === "waiting") {
        timer -= delta;
        if (timer <= 0) spawnSquare();
      } else if (phase === "resetting") {
        timer -= delta;
        fadeAlpha = Math.max(timer / RESET_PAUSE_MS, 0);
        if (timer <= 0) {
          resetAll();
          phase = "pending";
          timer = 250;
        }
      }

      draw();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      Matter.World.clear(world, false);
      Matter.Engine.clear(engine);
    };
  }, []);

  return (
    <div className={className}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} className="block" />
    </div>
  );
}
