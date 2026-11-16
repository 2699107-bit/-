import React, { useEffect, useRef } from 'react';
import {
  BUFFER_ROWS,
  COLS,
  PIECE_PALETTES,
  VISIBLE_ROWS,
} from '../game/constants';
import { getGhostY, getPieceCells } from '../game/engine';
import {
  ActivePiece,
  BoardGrid,
  DropTrail,
  GameState,
  TetrominoType,
} from '../game/types';

interface TetrisBoardCanvasProps {
  board: BoardGrid;
  activePiece: ActivePiece | null;
  gameState: GameState;
  showGhost: boolean;
  lockProgress: number; // 0..1 when piece is resting on surface
  dropTrails: DropTrail[];
  flashRows: { rows: number[]; timestamp: number } | null;
}

const CELL_PX = 30;
const CANVAS_WIDTH = COLS * CELL_PX;
const CANVAS_HEIGHT = VISIBLE_ROWS * CELL_PX;

function drawBeveledCell(
  ctx: CanvasRenderingContext2D,
  col: number,
  visibleRow: number,
  type: TetrominoType,
  alpha = 1,
  flashBoost = 0
) {
  const palette = PIECE_PALETTES[type];
  const x = col * CELL_PX + 1;
  const y = visibleRow * CELL_PX + 1;
  const size = CELL_PX - 2;
  const bevel = 4;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Base fill
  ctx.fillStyle = palette.fill;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 3);
  ctx.fill();

  // Top-left light bevel
  ctx.fillStyle = palette.highlight;
  ctx.globalAlpha = alpha * 0.45;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size, y);
  ctx.lineTo(x + size - bevel, y + bevel);
  ctx.lineTo(x + bevel, y + bevel);
  ctx.lineTo(x + bevel, y + size - bevel);
  ctx.lineTo(x, y + size);
  ctx.closePath();
  ctx.fill();

  // Bottom-right shadow bevel
  ctx.fillStyle = palette.shadow;
  ctx.globalAlpha = alpha * 0.6;
  ctx.beginPath();
  ctx.moveTo(x + size, y);
  ctx.lineTo(x + size, y + size);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x + bevel, y + size - bevel);
  ctx.lineTo(x + size - bevel, y + size - bevel);
  ctx.lineTo(x + size - bevel, y + bevel);
  ctx.closePath();
  ctx.fill();

  // Crisp inner face
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, size - 1, size - 1, 2.5);
  ctx.stroke();

  if (flashBoost > 0) {
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = Math.min(0.45, flashBoost);
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 3);
    ctx.fill();
  }

  ctx.restore();
}

function drawGhostCell(
  ctx: CanvasRenderingContext2D,
  col: number,
  visibleRow: number,
  type: TetrominoType
) {
  const palette = PIECE_PALETTES[type];
  const x = col * CELL_PX + 2;
  const y = visibleRow * CELL_PX + 2;
  const size = CELL_PX - 4;

  ctx.save();
  ctx.fillStyle = palette.ghost;
  ctx.strokeStyle = palette.fill;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export const TetrisBoardCanvas: React.FC<TetrisBoardCanvasProps> = ({
  board,
  activePiece,
  gameState,
  showGhost,
  lockProgress,
  dropTrails,
  flashRows,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = CANVAS_WIDTH * dpr;
    const targetH = CANVAS_HEIGHT * dpr;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    // Arena surface
    ctx.fillStyle = '#121620';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Subtle 10x20 grid lines
    ctx.strokeStyle = '#1B2230';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      const gx = c * CELL_PX + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let r = 1; r < VISIBLE_ROWS; r++) {
      const gy = r * CELL_PX + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(CANVAS_WIDTH, gy);
      ctx.stroke();
    }

    const now = performance.now();

    // Hard-drop subtle vertical trails
    for (const trail of dropTrails) {
      const age = now - trail.createdAt;
      if (age < 170) {
        const opacity = (1 - age / 170) * 0.16;
        const startY = Math.max(0, (trail.fromY - BUFFER_ROWS) * CELL_PX);
        const endY = Math.max(0, (trail.toY - BUFFER_ROWS) * CELL_PX);
        if (endY > startY) {
          const grad = ctx.createLinearGradient(0, startY, 0, endY);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(1, trail.color);
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.fillStyle = grad;
          ctx.fillRect(
            trail.x * CELL_PX + 2,
            startY,
            trail.width * CELL_PX - 4,
            endY - startY
          );
          ctx.restore();
        }
      }
    }

    // Hide blocks while paused for fair play
    if (gameState !== 'PAUSED') {
      // Placed board blocks
      for (let r = BUFFER_ROWS; r < board.length; r++) {
        const visibleRow = r - BUFFER_ROWS;
        for (let c = 0; c < COLS; c++) {
          const cell = board[r][c];
          if (cell) {
            const dim = gameState === 'GAME_OVER' ? 0.45 : 1;
            drawBeveledCell(ctx, c, visibleRow, cell, dim);
          }
        }
      }

      // Active piece & ghost
      if (activePiece && gameState === 'PLAYING') {
        if (showGhost) {
          const ghostY = getGhostY(board, activePiece);
          if (ghostY !== activePiece.y) {
            const ghostCells = getPieceCells(
              activePiece.type,
              activePiece.rotation,
              activePiece.x,
              ghostY
            );
            for (const [cx, cy] of ghostCells) {
              const vr = cy - BUFFER_ROWS;
              if (vr >= 0 && vr < VISIBLE_ROWS) {
                drawGhostCell(ctx, cx, vr, activePiece.type);
              }
            }
          }
        }

        const activeCells = getPieceCells(
          activePiece.type,
          activePiece.rotation,
          activePiece.x,
          activePiece.y
        );
        const lockFlash = lockProgress > 0 ? Math.sin(lockProgress * Math.PI) * 0.22 : 0;
        for (const [cx, cy] of activeCells) {
          const vr = cy - BUFFER_ROWS;
          if (vr >= 0 && vr < VISIBLE_ROWS) {
            drawBeveledCell(ctx, cx, vr, activePiece.type, 1, lockFlash);
          }
        }
      }
    }

    // Line-clear horizontal pulse overlay
    if (flashRows && now - flashRows.timestamp < 180) {
      const t = (now - flashRows.timestamp) / 180;
      const alpha = (1 - t) * 0.65;
      ctx.save();
      ctx.fillStyle = '#F8FAFC';
      ctx.globalAlpha = alpha;
      for (const r of flashRows.rows) {
        const vr = r - BUFFER_ROWS;
        if (vr >= 0 && vr < VISIBLE_ROWS) {
          ctx.fillRect(0, vr * CELL_PX, CANVAS_WIDTH, CELL_PX);
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }, [board, activePiece, gameState, showGhost, lockProgress, dropTrails, flashRows]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
      className="block rounded-md border border-[#2A3241] shadow-[0_18px_48px_rgba(0,0,0,0.55)]"
      aria-label="테트리스 게임 보드"
    />
  );
};
