import React from 'react';
import { PIECE_PALETTES, PIECE_SHAPES } from '../game/constants';
import { TetrominoType } from '../game/types';

interface PiecePreviewProps {
  type: TetrominoType | null;
  size?: 'sm' | 'md';
  dimmed?: boolean;
}

export const PiecePreview: React.FC<PiecePreviewProps> = ({
  type,
  size = 'md',
  dimmed = false,
}) => {
  const cellSize = size === 'sm' ? 16 : 20;
  const boxWidth = cellSize * 4;
  const boxHeight = cellSize * 2.5;

  if (!type) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ width: boxWidth, height: boxHeight }}
        aria-label="비어 있음"
      >
        <span className="text-xs text-slate-600 select-none">—</span>
      </div>
    );
  }

  const shape = PIECE_SHAPES[type][0];
  const palette = PIECE_PALETTES[type];

  // Compute tight bounding box of filled cells so every piece sits optically centered
  let minR = shape.length;
  let maxR = -1;
  let minC = shape[0].length;
  let maxC = -1;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minC = Math.min(minC, c);
        maxC = Math.max(maxC, c);
      }
    }
  }

  const cols = maxC - minC + 1;
  const rows = maxR - minR + 1;
  const offsetX = (boxWidth - cols * cellSize) / 2;
  const offsetY = (boxHeight - rows * cellSize) / 2;

  const blocks: { x: number; y: number }[] = [];
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (shape[r][c]) {
        blocks.push({
          x: offsetX + (c - minC) * cellSize,
          y: offsetY + (r - minR) * cellSize,
        });
      }
    }
  }

  const inset = 1;
  const inner = cellSize - inset * 2;
  const bevel = Math.max(2, Math.round(cellSize * 0.14));

  return (
    <svg
      width={boxWidth}
      height={boxHeight}
      viewBox={`0 0 ${boxWidth} ${boxHeight}`}
      className={`transition-opacity duration-150 ${dimmed ? 'opacity-35 grayscale-[45%]' : 'opacity-100'}`}
      aria-label={`${type} 블록`}
    >
      {blocks.map((b, idx) => {
        const bx = b.x + inset;
        const by = b.y + inset;
        return (
          <g key={idx}>
            <rect
              x={bx}
              y={by}
              width={inner}
              height={inner}
              rx={2}
              fill={palette.fill}
            />
            {/* Top-left specular bevel */}
            <polygon
              points={`${bx},${by} ${bx + inner},${by} ${bx + inner - bevel},${by + bevel} ${bx + bevel},${by + bevel} ${bx + bevel},${by + inner - bevel} ${bx},${by + inner}`}
              fill={palette.highlight}
              opacity={0.45}
            />
            {/* Bottom-right shadow bevel */}
            <polygon
              points={`${bx + inner},${by} ${bx + inner},${by + inner} ${bx},${by + inner} ${bx + bevel},${by + inner - bevel} ${bx + inner - bevel},${by + inner - bevel} ${bx + inner - bevel},${by + bevel}`}
              fill={palette.shadow}
              opacity={0.6}
            />
            <rect
              x={bx + 0.5}
              y={by + 0.5}
              width={inner - 1}
              height={inner - 1}
              rx={1.5}
              fill="none"
              stroke={palette.border}
              strokeWidth={1}
            />
          </g>
        );
      })}
    </svg>
  );
};
