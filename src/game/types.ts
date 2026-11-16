export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export type RotationState = 0 | 1 | 2 | 3;

export type CellValue = TetrominoType | null;

export type BoardGrid = CellValue[][];

export interface ActivePiece {
  type: TetrominoType;
  rotation: RotationState;
  x: number;
  y: number;
}

export interface ClearFeedback {
  id: number;
  title: string;
  points: number;
  combo: number;
  timestamp: number;
}

export interface GameStats {
  score: number;
  highScore: number;
  lines: number;
  level: number;
  combo: number;
  tetrises: number;
  isNewRecord: boolean;
}

export interface DropTrail {
  x: number;
  fromY: number;
  toY: number;
  width: number;
  color: string;
  createdAt: number;
}
