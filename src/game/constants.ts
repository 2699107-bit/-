import { RotationState, TetrominoType } from './types';

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const BUFFER_ROWS = 2;
export const TOTAL_ROWS = VISIBLE_ROWS + BUFFER_ROWS;

export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const DAS_MS = 135;
export const ARR_MS = 28;
export const SOFT_DROP_MS = 35;

export interface PiecePalette {
  fill: string;
  highlight: string;
  shadow: string;
  border: string;
  ghost: string;
}

export const PIECE_PALETTES: Record<TetrominoType, PiecePalette> = {
  I: {
    fill: '#06B6D4',
    highlight: '#67E8F9',
    shadow: '#0E7490',
    border: '#0891B2',
    ghost: 'rgba(6, 182, 212, 0.28)',
  },
  O: {
    fill: '#EAB308',
    highlight: '#FDE047',
    shadow: '#A16207',
    border: '#CA8A04',
    ghost: 'rgba(234, 179, 8, 0.28)',
  },
  T: {
    fill: '#A855F7',
    highlight: '#D8B4FE',
    shadow: '#6B21A8',
    border: '#9333EA',
    ghost: 'rgba(168, 85, 247, 0.28)',
  },
  S: {
    fill: '#22C55E',
    highlight: '#86EFAC',
    shadow: '#15803D',
    border: '#16A34A',
    ghost: 'rgba(34, 197, 94, 0.28)',
  },
  Z: {
    fill: '#EF4444',
    highlight: '#FCA5A5',
    shadow: '#B91C1C',
    border: '#DC2626',
    ghost: 'rgba(239, 68, 68, 0.28)',
  },
  J: {
    fill: '#3B82F6',
    highlight: '#93C5FD',
    shadow: '#1D4ED8',
    border: '#2563EB',
    ghost: 'rgba(59, 130, 246, 0.28)',
  },
  L: {
    fill: '#F97316',
    highlight: '#FDBA74',
    shadow: '#C2410C',
    border: '#EA580C',
    ghost: 'rgba(249, 115, 22, 0.28)',
  },
};

// Standard SRS piece shapes by rotation state (0: spawn, 1: R, 2: 2, 3: L)
export const PIECE_SHAPES: Record<TetrominoType, Record<RotationState, number[][]>> = {
  I: {
    0: [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    1: [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
    ],
    2: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
    ],
    3: [
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  },
  O: {
    0: [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    1: [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    2: [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    3: [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
  },
  T: {
    0: [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    1: [
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ],
    2: [
      [0, 0, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
    3: [
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  S: {
    0: [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    1: [
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
    2: [
      [0, 0, 0],
      [0, 1, 1],
      [1, 1, 0],
    ],
    3: [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  Z: {
    0: [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    1: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    2: [
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 1],
    ],
    3: [
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  },
  J: {
    0: [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    1: [
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
    ],
    2: [
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 1],
    ],
    3: [
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
  L: {
    0: [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    1: [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
    ],
    2: [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
    ],
    3: [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ],
  },
};

// SRS Wall Kick offsets: [dx, dy] where +y is downward in screen coordinates
type KickKey = `${RotationState}->${RotationState}`;

export const JLSTZ_KICKS: Record<KickKey, [number, number][]> = {
  '0->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1->0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1->2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2->1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3->2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3->0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0->3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  // Unused self transitions
  '0->0': [[0, 0]],
  '1->1': [[0, 0]],
  '2->2': [[0, 0]],
  '3->3': [[0, 0]],
  '0->2': [[0, 0]],
  '2->0': [[0, 0]],
  '1->3': [[0, 0]],
  '3->1': [[0, 0]],
};

export const I_KICKS: Record<KickKey, [number, number][]> = {
  '0->1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1->0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1->2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2->1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2->3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3->2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3->0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0->3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '0->0': [[0, 0]],
  '1->1': [[0, 0]],
  '2->2': [[0, 0]],
  '3->3': [[0, 0]],
  '0->2': [[0, 0]],
  '2->0': [[0, 0]],
  '1->3': [[0, 0]],
  '3->1': [[0, 0]],
};

export function getDropIntervalMs(level: number): number {
  const clamped = Math.max(1, Math.min(20, level));
  // Classic Tetris Worlds gravity curve (in ms)
  const seconds = Math.pow(0.8 - (clamped - 1) * 0.007, clamped - 1);
  return Math.max(45, Math.round(seconds * 1000));
}

export const HIGH_SCORE_STORAGE_KEY = 'tetris_high_score_v1';
export const MUTE_STORAGE_KEY = 'tetris_sound_muted_v1';
