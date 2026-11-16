import {
  BUFFER_ROWS,
  COLS,
  I_KICKS,
  JLSTZ_KICKS,
  PIECE_SHAPES,
  TOTAL_ROWS,
} from './constants';
import { ActivePiece, BoardGrid, RotationState, TetrominoType } from './types';

const ALL_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export function createEmptyBoard(): BoardGrid {
  return Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(null));
}

export function createBag(): TetrominoType[] {
  const bag = [...ALL_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function createSpawnPiece(type: TetrominoType): ActivePiece {
  const shape = PIECE_SHAPES[type][0];
  const width = shape[0].length;
  const x = Math.floor((COLS - width) / 2);
  // Spawn in buffer rows just above visible grid
  const y = type === 'I' ? 0 : BUFFER_ROWS - 2;
  return {
    type,
    rotation: 0,
    x,
    y,
  };
}

export function getPieceCells(
  type: TetrominoType,
  rotation: RotationState,
  x: number,
  y: number
): [number, number][] {
  const matrix = PIECE_SHAPES[type][rotation];
  const cells: [number, number][] = [];
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (matrix[row][col]) {
        cells.push([x + col, y + row]);
      }
    }
  }
  return cells;
}

export function isValidPosition(
  board: BoardGrid,
  type: TetrominoType,
  rotation: RotationState,
  x: number,
  y: number
): boolean {
  const cells = getPieceCells(type, rotation, x, y);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= COLS || cy >= TOTAL_ROWS) {
      return false;
    }
    if (cy >= 0 && board[cy][cx] !== null) {
      return false;
    }
  }
  return true;
}

export function tryRotate(
  board: BoardGrid,
  piece: ActivePiece,
  dir: 1 | -1
): { piece: ActivePiece; kickIndex: number } | null {
  if (piece.type === 'O') {
    const nextRot = (((piece.rotation + dir) % 4 + 4) % 4) as RotationState;
    return {
      piece: { ...piece, rotation: nextRot },
      kickIndex: 0,
    };
  }

  const fromRot = piece.rotation;
  const toRot = (((fromRot + dir) % 4 + 4) % 4) as RotationState;
  const key = `${fromRot}->${toRot}` as const;
  const kickTable = piece.type === 'I' ? I_KICKS[key] : JLSTZ_KICKS[key];

  for (let i = 0; i < kickTable.length; i++) {
    const [dx, dy] = kickTable[i];
    const nx = piece.x + dx;
    const ny = piece.y + dy;
    if (isValidPosition(board, piece.type, toRot, nx, ny)) {
      return {
        piece: {
          ...piece,
          rotation: toRot,
          x: nx,
          y: ny,
        },
        kickIndex: i,
      };
    }
  }
  return null;
}

export function getGhostY(board: BoardGrid, piece: ActivePiece): number {
  let gy = piece.y;
  while (isValidPosition(board, piece.type, piece.rotation, piece.x, gy + 1)) {
    gy++;
  }
  return gy;
}

export function isTSpin(
  board: BoardGrid,
  piece: ActivePiece,
  lastActionWasRotate: boolean
): boolean {
  if (piece.type !== 'T' || !lastActionWasRotate) {
    return false;
  }

  const corners: [number, number][] = [
    [piece.x, piece.y],
    [piece.x + 2, piece.y],
    [piece.x, piece.y + 2],
    [piece.x + 2, piece.y + 2],
  ];

  let occupiedCorners = 0;
  for (const [cx, cy] of corners) {
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= TOTAL_ROWS || board[cy][cx] !== null) {
      occupiedCorners++;
    }
  }
  return occupiedCorners >= 3;
}

export function lockPieceAndClearLines(
  board: BoardGrid,
  piece: ActivePiece
): {
  newBoard: BoardGrid;
  clearedRowIndices: number[];
  isPerfectClear: boolean;
  lockedAboveVisible: boolean;
} {
  const newBoard = board.map((row) => [...row]);
  const cells = getPieceCells(piece.type, piece.rotation, piece.x, piece.y);
  let lockedAboveVisible = true;

  for (const [cx, cy] of cells) {
    if (cy >= BUFFER_ROWS) {
      lockedAboveVisible = false;
    }
    if (cy >= 0 && cy < TOTAL_ROWS && cx >= 0 && cx < COLS) {
      newBoard[cy][cx] = piece.type;
    }
  }

  const clearedRowIndices: number[] = [];
  for (let r = 0; r < TOTAL_ROWS; r++) {
    if (newBoard[r].every((cell) => cell !== null)) {
      clearedRowIndices.push(r);
    }
  }

  if (clearedRowIndices.length > 0) {
    const remaining = newBoard.filter((_, idx) => !clearedRowIndices.includes(idx));
    const emptyRows = Array.from({ length: clearedRowIndices.length }, () =>
      Array(COLS).fill(null)
    );
    const compacted = [...emptyRows, ...remaining];
    const isPerfectClear = compacted.every((row) => row.every((cell) => cell === null));
    return {
      newBoard: compacted,
      clearedRowIndices,
      isPerfectClear,
      lockedAboveVisible,
    };
  }

  return {
    newBoard,
    clearedRowIndices: [],
    isPerfectClear: false,
    lockedAboveVisible,
  };
}

export function calculateLineScore(
  linesCleared: number,
  level: number,
  tSpin: boolean,
  isBackToBack: boolean,
  combo: number,
  isPerfectClear: boolean
): {
  points: number;
  label: string;
  qualifiesB2B: boolean;
} {
  let base = 0;
  let label = '';
  let qualifiesB2B = false;

  if (tSpin) {
    qualifiesB2B = linesCleared > 0;
    switch (linesCleared) {
      case 0:
        base = 400;
        label = 'T-SPIN';
        break;
      case 1:
        base = 800;
        label = 'T-SPIN SINGLE';
        break;
      case 2:
        base = 1200;
        label = 'T-SPIN DOUBLE';
        break;
      case 3:
        base = 1600;
        label = 'T-SPIN TRIPLE';
        break;
    }
  } else {
    switch (linesCleared) {
      case 1:
        base = 100;
        label = 'SINGLE';
        break;
      case 2:
        base = 300;
        label = 'DOUBLE';
        break;
      case 3:
        base = 500;
        label = 'TRIPLE';
        break;
      case 4:
        base = 800;
        label = 'TETRIS';
        qualifiesB2B = true;
        break;
    }
  }

  let points = base * level;
  if (qualifiesB2B && isBackToBack) {
    points = Math.round(points * 1.5);
    label = `B2B ${label}`;
  }

  if (combo > 0 && linesCleared > 0) {
    points += 50 * combo * level;
  }

  if (isPerfectClear) {
    points += 1800 * level;
    label = 'PERFECT CLEAR';
  }

  return { points, label, qualifiesB2B };
}
