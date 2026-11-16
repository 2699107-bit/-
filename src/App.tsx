import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronsDown,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PiecePreview } from './components/PiecePreview';
import { TetrisBoardCanvas } from './components/TetrisBoardCanvas';
import {
  ARR_MS,
  BUFFER_ROWS,
  COLS,
  DAS_MS,
  HIGH_SCORE_STORAGE_KEY,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  PIECE_PALETTES,
  PIECE_SHAPES,
  SOFT_DROP_MS,
  getDropIntervalMs,
} from './game/constants';
import {
  calculateLineScore,
  createBag,
  createEmptyBoard,
  createSpawnPiece,
  getGhostY,
  isTSpin,
  isValidPosition,
  lockPieceAndClearLines,
  tryRotate,
} from './game/engine';
import { soundEngine } from './game/sound';
import {
  ActivePiece,
  BoardGrid,
  ClearFeedback,
  DropTrail,
  GameState,
  GameStats,
  TetrominoType,
} from './game/types';

interface EngineData {
  board: BoardGrid;
  bag: TetrominoType[];
  nextQueue: TetrominoType[];
  activePiece: ActivePiece | null;
  holdPiece: TetrominoType | null;
  canHold: boolean;
  lastActionWasRotate: boolean;
  isBackToBack: boolean;
  combo: number;
  score: number;
  highScore: number;
  lines: number;
  level: number;
  startLevel: number;
  tetrises: number;
  isNewRecord: boolean;
  dropAccumulatorMs: number;
  lockTimerMs: number;
  lockResetCount: number;
  dropTrails: DropTrail[];
  flashRows: { rows: number[]; timestamp: number } | null;
  clearFeedback: ClearFeedback | null;
  feedbackSeq: number;
}

function loadHighScore(): number {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(score));
  } catch {
    // Ignore storage failures
  }
}

function createInitialEngine(startLevel: number): EngineData {
  const bag = [...createBag(), ...createBag()];
  const nextQueue = bag.splice(0, 3);
  return {
    board: createEmptyBoard(),
    bag,
    nextQueue,
    activePiece: null,
    holdPiece: null,
    canHold: true,
    lastActionWasRotate: false,
    isBackToBack: false,
    combo: -1,
    score: 0,
    highScore: loadHighScore(),
    lines: 0,
    level: startLevel,
    startLevel,
    tetrises: 0,
    isNewRecord: false,
    dropAccumulatorMs: 0,
    lockTimerMs: 0,
    lockResetCount: 0,
    dropTrails: [],
    flashRows: null,
    clearFeedback: null,
    feedbackSeq: 0,
  };
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [startLevel, setStartLevel] = useState<number>(1);
  const [showGhost, setShowGhost] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEngine.isMuted());

  const engineRef = useRef<EngineData>(createInitialEngine(1));
  const gameStateRef = useRef<GameState>('TITLE_MENU');

  // Render snapshot synced from engineRef
  const [, setFrameTick] = useState(0);
  const triggerRender = useCallback(() => {
    setFrameTick((t) => (t + 1) % 1000000);
  }, []);

  // Keep gameStateRef synchronized
  const updateGameState = useCallback((next: GameState) => {
    gameStateRef.current = next;
    setGameState(next);
  }, []);

  // Input state tracking for smooth DAS/ARR
  const keysHeldRef = useRef<{
    left: boolean;
    right: boolean;
    down: boolean;
    lastHorizontal: 'left' | 'right' | null;
    dasElapsed: number;
    arrElapsed: number;
    softDropElapsed: number;
  }>({
    left: false,
    right: false,
    down: false,
    lastHorizontal: null,
    dasElapsed: 0,
    arrElapsed: 0,
    softDropElapsed: 0,
  });

  const refillBagIfNeeded = (eng: EngineData) => {
    if (eng.bag.length < 7) {
      eng.bag.push(...createBag());
    }
  };

  const spawnNextPiece = useCallback(
    (eng: EngineData): boolean => {
      refillBagIfNeeded(eng);
      const nextType = eng.nextQueue.shift()!;
      const replacement = eng.bag.shift()!;
      eng.nextQueue.push(replacement);

      const piece = createSpawnPiece(nextType);
      eng.canHold = true;
      eng.lastActionWasRotate = false;
      eng.dropAccumulatorMs = 0;
      eng.lockTimerMs = 0;
      eng.lockResetCount = 0;

      if (!isValidPosition(eng.board, piece.type, piece.rotation, piece.x, piece.y)) {
        // Try shifting up 1 row in buffer space if blocked at spawn
        if (isValidPosition(eng.board, piece.type, piece.rotation, piece.x, piece.y - 1)) {
          piece.y -= 1;
          eng.activePiece = piece;
          return true;
        }
        eng.activePiece = null;
        return false;
      }

      eng.activePiece = piece;
      return true;
    },
    []
  );

  const finishGame = useCallback(() => {
    soundEngine.playGameOver();
    updateGameState('GAME_OVER');
    triggerRender();
  }, [triggerRender, updateGameState]);

  const startNewGame = useCallback(
    (chosenStartLevel = startLevel) => {
      const fresh = createInitialEngine(chosenStartLevel);
      engineRef.current = fresh;
      keysHeldRef.current = {
        left: false,
        right: false,
        down: false,
        lastHorizontal: null,
        dasElapsed: 0,
        arrElapsed: 0,
        softDropElapsed: 0,
      };
      const ok = spawnNextPiece(fresh);
      if (ok) {
        updateGameState('PLAYING');
      } else {
        updateGameState('GAME_OVER');
      }
      triggerRender();
    },
    [spawnNextPiece, startLevel, triggerRender, updateGameState]
  );

  const togglePause = useCallback(() => {
    if (gameStateRef.current === 'PLAYING') {
      updateGameState('PAUSED');
      triggerRender();
    } else if (gameStateRef.current === 'PAUSED') {
      updateGameState('PLAYING');
      triggerRender();
    }
  }, [triggerRender, updateGameState]);

  const toggleMute = useCallback(() => {
    const next = !soundEngine.isMuted();
    soundEngine.setMuted(next);
    setIsMuted(next);
  }, []);

  const addScore = (eng: EngineData, delta: number) => {
    if (delta <= 0) return;
    eng.score += delta;
    if (eng.score > eng.highScore) {
      eng.highScore = eng.score;
      eng.isNewRecord = true;
      saveHighScore(eng.highScore);
    }
  };

  const resetLockIfGrounded = (eng: EngineData) => {
    if (!eng.activePiece) return;
    const grounded = !isValidPosition(
      eng.board,
      eng.activePiece.type,
      eng.activePiece.rotation,
      eng.activePiece.x,
      eng.activePiece.y + 1
    );
    if (grounded && eng.lockResetCount < MAX_LOCK_RESETS) {
      eng.lockTimerMs = 0;
      eng.lockResetCount += 1;
    }
  };

  const lockActivePiece = useCallback(
    (eng: EngineData, playLockSound = true) => {
      if (!eng.activePiece) return;

      const tSpin = isTSpin(eng.board, eng.activePiece, eng.lastActionWasRotate);
      const { newBoard, clearedRowIndices, isPerfectClear, lockedAboveVisible } =
        lockPieceAndClearLines(eng.board, eng.activePiece);

      eng.board = newBoard;
      eng.activePiece = null;

      if (lockedAboveVisible && clearedRowIndices.length === 0) {
        finishGame();
        return;
      }

      const linesCleared = clearedRowIndices.length;

      if (linesCleared > 0) {
        eng.flashRows = {
          rows: clearedRowIndices,
          timestamp: performance.now(),
        };
        eng.combo += 1;

        const { points, label, qualifiesB2B } = calculateLineScore(
          linesCleared,
          eng.level,
          tSpin,
          eng.isBackToBack,
          eng.combo,
          isPerfectClear
        );

        addScore(eng, points);
        eng.lines += linesCleared;
        if (linesCleared === 4) {
          eng.tetrises += 1;
        }
        eng.isBackToBack = qualifiesB2B;

        const prevLevel = eng.level;
        const computedLevel = eng.startLevel + Math.floor(eng.lines / 10);
        if (computedLevel > prevLevel) {
          eng.level = computedLevel;
          soundEngine.playLevelUp();
        } else {
          soundEngine.playLineClear(linesCleared, tSpin);
        }

        eng.feedbackSeq += 1;
        eng.clearFeedback = {
          id: eng.feedbackSeq,
          title: label,
          points,
          combo: eng.combo,
          timestamp: performance.now(),
        };
      } else {
        eng.combo = -1;
        if (tSpin) {
          const { points, label } = calculateLineScore(
            0,
            eng.level,
            true,
            eng.isBackToBack,
            0,
            false
          );
          addScore(eng, points);
          eng.feedbackSeq += 1;
          eng.clearFeedback = {
            id: eng.feedbackSeq,
            title: label,
            points,
            combo: 0,
            timestamp: performance.now(),
          };
        }
        if (playLockSound) {
          soundEngine.playLock();
        }
      }

      const spawned = spawnNextPiece(eng);
      if (!spawned) {
        finishGame();
        return;
      }
      triggerRender();
    },
    [finishGame, spawnNextPiece, triggerRender]
  );

  const moveHorizontal = useCallback(
    (dx: -1 | 1): boolean => {
      if (gameStateRef.current !== 'PLAYING') return false;
      const eng = engineRef.current;
      if (!eng.activePiece) return false;

      const nx = eng.activePiece.x + dx;
      if (
        isValidPosition(
          eng.board,
          eng.activePiece.type,
          eng.activePiece.rotation,
          nx,
          eng.activePiece.y
        )
      ) {
        eng.activePiece = { ...eng.activePiece, x: nx };
        eng.lastActionWasRotate = false;
        resetLockIfGrounded(eng);
        soundEngine.playMove();
        triggerRender();
        return true;
      }
      return false;
    },
    [triggerRender]
  );

  const moveDown = useCallback(
    (fromSoftDrop: boolean): boolean => {
      if (gameStateRef.current !== 'PLAYING') return false;
      const eng = engineRef.current;
      if (!eng.activePiece) return false;

      const ny = eng.activePiece.y + 1;
      if (
        isValidPosition(
          eng.board,
          eng.activePiece.type,
          eng.activePiece.rotation,
          eng.activePiece.x,
          ny
        )
      ) {
        eng.activePiece = { ...eng.activePiece, y: ny };
        eng.lastActionWasRotate = false;
        eng.lockTimerMs = 0;
        if (fromSoftDrop) {
          addScore(eng, 1);
          eng.dropAccumulatorMs = 0;
        }
        triggerRender();
        return true;
      }
      return false;
    },
    [triggerRender]
  );

  const rotatePiece = useCallback(
    (dir: 1 | -1) => {
      if (gameStateRef.current !== 'PLAYING') return;
      const eng = engineRef.current;
      if (!eng.activePiece) return;

      const result = tryRotate(eng.board, eng.activePiece, dir);
      if (result) {
        eng.activePiece = result.piece;
        eng.lastActionWasRotate = true;
        resetLockIfGrounded(eng);
        soundEngine.playRotate();
        triggerRender();
      }
    },
    [triggerRender]
  );

  const hardDrop = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    const eng = engineRef.current;
    if (!eng.activePiece) return;

    const startY = eng.activePiece.y;
    const ghostY = getGhostY(eng.board, eng.activePiece);
    const distance = Math.max(0, ghostY - startY);

    if (distance > 0) {
      const shape = PIECE_SHAPES[eng.activePiece.type][eng.activePiece.rotation];
      let minCol = shape[0].length;
      let maxCol = -1;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            minCol = Math.min(minCol, c);
            maxCol = Math.max(maxCol, c);
          }
        }
      }
      if (maxCol >= minCol) {
        eng.dropTrails.push({
          x: eng.activePiece.x + minCol,
          fromY: startY,
          toY: ghostY + 1,
          width: maxCol - minCol + 1,
          color: PIECE_PALETTES[eng.activePiece.type].fill,
          createdAt: performance.now(),
        });
      }
      eng.activePiece = { ...eng.activePiece, y: ghostY };
      eng.lastActionWasRotate = false;
      addScore(eng, distance * 2);
    }

    soundEngine.playHardDrop();
    lockActivePiece(eng, false);
  }, [lockActivePiece]);

  const holdCurrentPiece = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    const eng = engineRef.current;
    if (!eng.activePiece || !eng.canHold) return;

    const currentType = eng.activePiece.type;
    if (eng.holdPiece === null) {
      eng.holdPiece = currentType;
      spawnNextPiece(eng);
    } else {
      const swappedType = eng.holdPiece;
      eng.holdPiece = currentType;
      eng.activePiece = createSpawnPiece(swappedType);
      eng.dropAccumulatorMs = 0;
      eng.lockTimerMs = 0;
      eng.lockResetCount = 0;
      eng.lastActionWasRotate = false;
    }

    eng.canHold = false;
    soundEngine.playHold();
    triggerRender();
  }, [spawnNextPiece, triggerRender]);

  // Keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;

      if (
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'ArrowDown' ||
        code === 'ArrowUp' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      if (code === 'KeyP' || code === 'Escape') {
        if (gameStateRef.current === 'PLAYING' || gameStateRef.current === 'PAUSED') {
          togglePause();
        }
        return;
      }

      if (code === 'KeyM') {
        toggleMute();
        return;
      }

      if (code === 'KeyR') {
        if (gameStateRef.current !== 'TITLE_MENU') {
          startNewGame(startLevel);
        }
        return;
      }

      if (code === 'Enter') {
        if (gameStateRef.current === 'TITLE_MENU' || gameStateRef.current === 'GAME_OVER') {
          startNewGame(startLevel);
        }
        return;
      }

      if (gameStateRef.current !== 'PLAYING') return;
      if (e.repeat) return; // Handled smoothly via DAS/ARR in RAF loop

      switch (code) {
        case 'ArrowLeft':
          keysHeldRef.current.left = true;
          keysHeldRef.current.lastHorizontal = 'left';
          keysHeldRef.current.dasElapsed = 0;
          keysHeldRef.current.arrElapsed = 0;
          moveHorizontal(-1);
          break;
        case 'ArrowRight':
          keysHeldRef.current.right = true;
          keysHeldRef.current.lastHorizontal = 'right';
          keysHeldRef.current.dasElapsed = 0;
          keysHeldRef.current.arrElapsed = 0;
          moveHorizontal(1);
          break;
        case 'ArrowDown':
          keysHeldRef.current.down = true;
          keysHeldRef.current.softDropElapsed = 0;
          moveDown(true);
          break;
        case 'ArrowUp':
        case 'KeyX':
          rotatePiece(1);
          break;
        case 'KeyZ':
          rotatePiece(-1);
          break;
        case 'Space':
          hardDrop();
          break;
        case 'KeyC':
        case 'ShiftLeft':
        case 'ShiftRight':
          holdCurrentPiece();
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft':
          keysHeldRef.current.left = false;
          if (keysHeldRef.current.right) {
            keysHeldRef.current.lastHorizontal = 'right';
            keysHeldRef.current.dasElapsed = 0;
            keysHeldRef.current.arrElapsed = 0;
          } else {
            keysHeldRef.current.lastHorizontal = null;
          }
          break;
        case 'ArrowRight':
          keysHeldRef.current.right = false;
          if (keysHeldRef.current.left) {
            keysHeldRef.current.lastHorizontal = 'left';
            keysHeldRef.current.dasElapsed = 0;
            keysHeldRef.current.arrElapsed = 0;
          } else {
            keysHeldRef.current.lastHorizontal = null;
          }
          break;
        case 'ArrowDown':
          keysHeldRef.current.down = false;
          break;
      }
    };

    const handleBlur = () => {
      keysHeldRef.current.left = false;
      keysHeldRef.current.right = false;
      keysHeldRef.current.down = false;
      keysHeldRef.current.lastHorizontal = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [
    hardDrop,
    holdCurrentPiece,
    moveDown,
    moveHorizontal,
    rotatePiece,
    startLevel,
    startNewGame,
    toggleMute,
    togglePause,
  ]);

  // Main 60fps requestAnimationFrame game loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(100, now - lastTime);
      lastTime = now;

      const eng = engineRef.current;
      let needsRender = false;

      // Prune expired animations
      if (eng.dropTrails.length > 0) {
        eng.dropTrails = eng.dropTrails.filter((t) => now - t.createdAt < 180);
        needsRender = true;
      }
      if (eng.flashRows && now - eng.flashRows.timestamp >= 180) {
        eng.flashRows = null;
        needsRender = true;
      }
      if (eng.clearFeedback && now - eng.clearFeedback.timestamp >= 1400) {
        eng.clearFeedback = null;
        needsRender = true;
      }

      if (gameStateRef.current === 'PLAYING' && eng.activePiece) {
        // Horizontal DAS / ARR
        const keys = keysHeldRef.current;
        const dir =
          keys.lastHorizontal === 'left' && keys.left
            ? -1
            : keys.lastHorizontal === 'right' && keys.right
              ? 1
              : keys.left
                ? -1
                : keys.right
                  ? 1
                  : 0;

        if (dir !== 0) {
          keys.dasElapsed += dt;
          if (keys.dasElapsed >= DAS_MS) {
            keys.arrElapsed += dt;
            while (keys.arrElapsed >= ARR_MS) {
              keys.arrElapsed -= ARR_MS;
              if (!moveHorizontal(dir)) break;
            }
          }
        }

        // Soft drop repeat
        if (keys.down) {
          keys.softDropElapsed += dt;
          while (keys.softDropElapsed >= SOFT_DROP_MS) {
            keys.softDropElapsed -= SOFT_DROP_MS;
            if (!moveDown(true)) break;
          }
        }

        // Check grounded state
        const piece = eng.activePiece;
        if (piece) {
          const canFall = isValidPosition(
            eng.board,
            piece.type,
            piece.rotation,
            piece.x,
            piece.y + 1
          );

          if (canFall) {
            eng.lockTimerMs = 0;
            eng.dropAccumulatorMs += dt;
            const interval = getDropIntervalMs(eng.level);
            while (eng.dropAccumulatorMs >= interval) {
              eng.dropAccumulatorMs -= interval;
              if (!moveDown(false)) {
                break;
              }
            }
          } else {
            eng.lockTimerMs += dt;
            needsRender = true;
            if (eng.lockTimerMs >= LOCK_DELAY_MS) {
              lockActivePiece(eng, true);
            }
          }
        }
      }

      if (needsRender) {
        triggerRender();
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [lockActivePiece, moveDown, moveHorizontal, triggerRender]);

  // Touch repeat helper for mobile buttons
  const touchRepeatTimerRef = useRef<number | null>(null);
  const touchRepeatIntervalRef = useRef<number | null>(null);

  const stopTouchRepeat = useCallback(() => {
    if (touchRepeatTimerRef.current !== null) {
      window.clearTimeout(touchRepeatTimerRef.current);
      touchRepeatTimerRef.current = null;
    }
    if (touchRepeatIntervalRef.current !== null) {
      window.clearInterval(touchRepeatIntervalRef.current);
      touchRepeatIntervalRef.current = null;
    }
  }, []);

  const startTouchRepeat = useCallback(
    (action: () => void, repeatMs = 55) => {
      stopTouchRepeat();
      action();
      touchRepeatTimerRef.current = window.setTimeout(() => {
        touchRepeatIntervalRef.current = window.setInterval(action, repeatMs);
      }, 150);
    },
    [stopTouchRepeat]
  );

  useEffect(() => {
    return () => stopTouchRepeat();
  }, [stopTouchRepeat]);

  const eng = engineRef.current;
  const stats: GameStats = {
    score: eng.score,
    highScore: eng.highScore,
    lines: eng.lines,
    level: eng.level,
    combo: Math.max(0, eng.combo),
    tetrises: eng.tetrises,
    isNewRecord: eng.isNewRecord,
  };

  const lockProgress =
    eng.activePiece &&
    !isValidPosition(
      eng.board,
      eng.activePiece.type,
      eng.activePiece.rotation,
      eng.activePiece.x,
      eng.activePiece.y + 1
    )
      ? Math.min(1, eng.lockTimerMs / LOCK_DELAY_MS)
      : 0;

  const linesIntoLevel = eng.lines % 10;
  const levelProgressPct = (linesIntoLevel / 10) * 100;

  return (
    <div className="min-h-screen bg-[#0E1117] text-[#F1F5F9] flex flex-col">
      {/* Top Bar: Clean 3-Zone Contract */}
      <header className="w-full border-b border-[#222938] bg-[#121620]/90">
        <div className="max-w-[1140px] mx-auto px-5 py-3.5 flex items-center justify-between gap-8">
          <span className="font-display text-xl font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            테트리스
          </span>

          <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 whitespace-nowrap shrink-0">
            <span>10×20 클래식</span>
            <span aria-hidden="true">·</span>
            <span>SRS 회전</span>
            <span aria-hidden="true">·</span>
            <span>7-Bag 분배</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {gameState === 'PLAYING' || gameState === 'PAUSED' ? (
              <button
                type="button"
                onClick={togglePause}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                {gameState === 'PAUSED' ? '계속하기' : '일시정지'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startNewGame(startLevel)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
              >
                새 게임
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Arena */}
      <main className="flex-1 flex items-center justify-center px-4 py-5 md:py-6">
        <div className="w-full max-w-[1040px] flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6">
          {/* Left Column: Hold + Controls + Settings */}
          <aside className="w-full max-w-[300px] lg:w-[228px] order-2 lg:order-1 flex flex-col gap-5">
            {/* Hold Slot */}
            <section className="bg-[#161B26] border border-[#252D3D] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-200">보관</h2>
                <span className="font-mono-num text-xs text-slate-400">C / Shift</span>
              </div>
              <div className="h-[74px] flex items-center justify-center bg-[#11151F] border border-[#212836] rounded-lg">
                <PiecePreview
                  type={eng.holdPiece}
                  size="md"
                  dimmed={!eng.canHold && eng.holdPiece !== null}
                />
              </div>
            </section>

            {/* Quick Settings & Actions */}
            <section className="bg-[#161B26] border border-[#252D3D] rounded-xl p-5 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-slate-200">설정 및 동작</h2>

              <div className="flex items-center justify-between pt-2 border-t border-[#222A3A]">
                <span className="text-xs text-slate-300">고스트 블록</span>
                <button
                  type="button"
                  onClick={() => setShowGhost((g) => !g)}
                  aria-pressed={showGhost}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showGhost
                      ? 'bg-slate-100 text-slate-900'
                      : 'bg-[#212838] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {showGhost ? '켜짐' : '꺼짐'}
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#222A3A]">
                <span className="text-xs text-slate-300">효과음</span>
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-pressed={!isMuted}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#212838] text-slate-200 hover:bg-[#2A3346] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isMuted ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                      <span>꺼짐</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>켜짐</span>
                    </>
                  )}
                </button>
              </div>

              {gameState !== 'TITLE_MENU' && (
                <button
                  type="button"
                  onClick={() => startNewGame(startLevel)}
                  className="mt-1 w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border border-[#2D3648] bg-[#1C2230] text-slate-200 hover:bg-[#242C3D] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>처음부터 다시하기 (R)</span>
                </button>
              )}
            </section>

            {/* Keyboard Guide (Desktop) */}
            <section className="hidden lg:flex flex-col gap-2.5 bg-[#161B26] border border-[#252D3D] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-200 mb-0.5">조작 방법</h2>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>좌우 이동</span>
                <span className="font-mono-num text-slate-200">← / →</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>소프트 드롭</span>
                <span className="font-mono-num text-slate-200">↓</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>하드 드롭</span>
                <span className="font-mono-num text-slate-200">Space</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>회전 (시계 / 반시계)</span>
                <span className="font-mono-num text-slate-200">↑, X / Z</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>일시정지</span>
                <span className="font-mono-num text-slate-200">P / Esc</span>
              </div>
            </section>
          </aside>

          {/* Center Column: Primary Focal Anchor — 10x20 Playfield */}
          <div className="order-1 lg:order-2 flex flex-col items-center">
            <div className="relative p-2.5 bg-[#161B26] border border-[#273042] rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
              <TetrisBoardCanvas
                board={eng.board}
                activePiece={eng.activePiece}
                gameState={gameState}
                showGhost={showGhost}
                lockProgress={lockProgress}
                dropTrails={eng.dropTrails}
                flashRows={eng.flashRows}
              />

              {/* Ephemeral Clear / Combo Feedback (top edge inside frame, never blocks falling blocks) */}
              {gameState === 'PLAYING' && eng.clearFeedback && (
                <div
                  key={eng.clearFeedback.id}
                  className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md bg-[#0E1117]/90 border border-amber-500/40 text-center whitespace-nowrap shadow-lg"
                >
                  <div className="font-display text-xs font-bold text-amber-400 tracking-wide">
                    {eng.clearFeedback.title}
                    {eng.clearFeedback.combo > 0 ? ` · ${eng.clearFeedback.combo} COMBO` : ''}
                  </div>
                  <div className="font-mono-num text-[11px] text-slate-200">
                    +{eng.clearFeedback.points.toLocaleString()}
                  </div>
                </div>
              )}

              {/* TITLE_MENU Overlay */}
              {gameState === 'TITLE_MENU' && (
                <div className="absolute inset-2.5 rounded-md bg-[#0E1117]/92 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
                  <h1 className="font-display text-4xl font-bold tracking-tight text-slate-50 mb-2">
                    테트리스
                  </h1>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6 max-w-[220px]">
                    가로 한 줄을 빈틈없이 채워 블록을 지우고, 콤보와 테트리스로 최고 점수에 도전하세요.
                  </p>

                  <div className="w-full max-w-[230px] mb-6">
                    <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                      <span>시작 속도 레벨</span>
                      <span className="font-mono-num font-semibold text-amber-400">
                        Lv. {startLevel}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#161B26] border border-[#252D3D] rounded-lg">
                      {[1, 5, 10].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setStartLevel(lvl)}
                          className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                            startLevel === lvl
                              ? 'bg-amber-500 text-slate-950 font-semibold'
                              : 'text-slate-400 hover:text-slate-100'
                          }`}
                        >
                          Lv. {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => startNewGame(startLevel)}
                    className="w-full max-w-[230px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-[0.98] transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>게임 시작</span>
                  </button>

                  {stats.highScore > 0 && (
                    <div className="mt-5 text-xs text-slate-400">
                      최고 기록{' '}
                      <span className="font-mono-num font-semibold text-slate-200 ml-1">
                        {stats.highScore.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* PAUSED Overlay */}
              {gameState === 'PAUSED' && (
                <div className="absolute inset-2.5 rounded-md bg-[#0E1117]/95 flex flex-col items-center justify-center p-6 text-center">
                  <Pause className="w-8 h-8 text-amber-400 mb-3" />
                  <h2 className="font-display text-2xl font-bold text-slate-100 mb-1">
                    일시정지
                  </h2>
                  <p className="text-xs text-slate-400 mb-6">
                    P 또는 Esc 키를 누르면 이어서 진행합니다.
                  </p>
                  <div className="w-full max-w-[210px] flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={togglePause}
                      className="w-full px-5 py-2.5 text-sm font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
                    >
                      계속하기
                    </button>
                    <button
                      type="button"
                      onClick={() => startNewGame(startLevel)}
                      className="w-full px-5 py-2.5 text-sm font-medium rounded-lg border border-[#2D3648] bg-[#161B26] text-slate-200 hover:bg-[#1E2534] transition-colors cursor-pointer"
                    >
                      다시 시작
                    </button>
                  </div>
                </div>
              )}

              {/* GAME_OVER Overlay */}
              {gameState === 'GAME_OVER' && (
                <div className="absolute inset-2.5 rounded-md bg-[#0E1117]/92 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
                  <h2 className="font-display text-2xl font-bold text-slate-100 mb-1">
                    게임 종료
                  </h2>
                  {stats.isNewRecord ? (
                    <p className="text-xs font-semibold text-amber-400 mb-5">
                      최고 기록을 경신했습니다
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mb-5">
                      블록이 천장에 닿았습니다
                    </p>
                  )}

                  <div className="w-full max-w-[230px] bg-[#161B26] border border-[#252D3D] rounded-lg p-4 mb-5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">최종 점수</span>
                      <span className="font-mono-num text-base font-bold text-amber-400">
                        {stats.score.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#222A3A]">
                      <span className="text-slate-400">최고 기록</span>
                      <span className="font-mono-num font-semibold text-slate-200">
                        {stats.highScore.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#222A3A]">
                      <span className="text-slate-400">도달 레벨</span>
                      <span className="font-mono-num font-semibold text-slate-200">
                        Lv. {stats.level}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-[#222A3A]">
                      <span className="text-slate-400">지운 줄</span>
                      <span className="font-mono-num font-semibold text-slate-200">
                        {stats.lines}줄
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => startNewGame(startLevel)}
                    className="w-full max-w-[230px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>다시 플레이</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile / Tablet Touch Controls (visible below lg breakpoint) */}
            <div className="w-full max-w-[320px] mt-4 grid grid-cols-4 gap-2 lg:hidden select-none">
              <button
                type="button"
                onClick={holdCurrentPiece}
                className="min-h-[48px] rounded-lg bg-[#161B26] border border-[#252D3D] text-xs font-semibold text-slate-200 active:bg-[#232B3B] flex items-center justify-center"
                aria-label="블록 보관"
              >
                보관
              </button>
              <button
                type="button"
                onClick={() => rotatePiece(-1)}
                className="min-h-[48px] rounded-lg bg-[#161B26] border border-[#252D3D] text-slate-200 active:bg-[#232B3B] flex items-center justify-center"
                aria-label="반시계 회전"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => rotatePiece(1)}
                className="min-h-[48px] rounded-lg bg-[#161B26] border border-[#252D3D] text-slate-200 active:bg-[#232B3B] flex items-center justify-center"
                aria-label="시계 회전"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={hardDrop}
                className="min-h-[48px] rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 active:bg-amber-500/25 flex items-center justify-center"
                aria-label="하드 드롭"
              >
                <ChevronsDown className="w-5 h-5" />
              </button>

              <button
                type="button"
                onPointerDown={() => startTouchRepeat(() => moveHorizontal(-1))}
                onPointerUp={stopTouchRepeat}
                onPointerLeave={stopTouchRepeat}
                onPointerCancel={stopTouchRepeat}
                className="col-span-1 min-h-[52px] rounded-lg bg-[#1B2230] border border-[#2A3346] text-slate-100 active:bg-[#273145] flex items-center justify-center"
                aria-label="왼쪽 이동"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onPointerDown={() => startTouchRepeat(() => moveDown(true), 45)}
                onPointerUp={stopTouchRepeat}
                onPointerLeave={stopTouchRepeat}
                onPointerCancel={stopTouchRepeat}
                className="col-span-2 min-h-[52px] rounded-lg bg-[#1B2230] border border-[#2A3346] text-slate-100 active:bg-[#273145] flex items-center justify-center gap-1.5 text-xs font-medium"
                aria-label="아래로 내리기"
              >
                <ArrowDown className="w-5 h-5" />
                <span>내리기</span>
              </button>
              <button
                type="button"
                onPointerDown={() => startTouchRepeat(() => moveHorizontal(1))}
                onPointerUp={stopTouchRepeat}
                onPointerLeave={stopTouchRepeat}
                onPointerCancel={stopTouchRepeat}
                className="col-span-1 min-h-[52px] rounded-lg bg-[#1B2230] border border-[#2A3346] text-slate-100 active:bg-[#273145] flex items-center justify-center"
                aria-label="오른쪽 이동"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Right Column: Next Queue + Telemetry Readouts */}
          <aside className="w-full max-w-[300px] lg:w-[228px] order-3 flex flex-col gap-5">
            {/* Next 3 Queue */}
            <section className="bg-[#161B26] border border-[#252D3D] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">다음 블록</h2>
              <div className="flex flex-col divide-y divide-[#212836] bg-[#11151F] border border-[#212836] rounded-lg">
                {eng.nextQueue.map((pieceType, idx) => (
                  <div
                    key={`${idx}-${pieceType}`}
                    className={`flex items-center justify-center ${
                      idx === 0 ? 'py-3.5' : 'py-2.5 opacity-80'
                    }`}
                  >
                    <PiecePreview
                      type={pieceType}
                      size={idx === 0 ? 'md' : 'sm'}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Score & Level Metrics */}
            <section className="bg-[#161B26] border border-[#252D3D] rounded-xl p-5 flex flex-col gap-3.5">
              <div>
                <div className="text-xs text-slate-400 mb-1">현재 점수</div>
                <div className="font-mono-num text-2xl font-bold text-slate-50 tracking-tight">
                  {stats.score.toLocaleString()}
                </div>
              </div>

              <div className="pt-3 border-t border-[#222A3A] flex items-center justify-between">
                <span className="text-xs text-slate-400">최고 기록</span>
                <span className="font-mono-num text-sm font-semibold text-amber-400">
                  {stats.highScore.toLocaleString()}
                </span>
              </div>

              <div className="pt-3 border-t border-[#222A3A]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">레벨</span>
                  <span className="font-mono-num text-sm font-semibold text-slate-100">
                    Lv. {stats.level}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#11151F] rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-amber-500 transition-all duration-150"
                    style={{ width: `${levelProgressPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                  <span>다음 레벨까지</span>
                  <span className="font-mono-num">{10 - linesIntoLevel}줄</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#222A3A] flex items-center justify-between">
                <span className="text-xs text-slate-400">지운 줄</span>
                <span className="font-mono-num text-sm font-semibold text-slate-100">
                  {stats.lines}
                </span>
              </div>

              <div className="pt-3 border-t border-[#222A3A] flex items-center justify-between">
                <span className="text-xs text-slate-400">테트리스 (4줄)</span>
                <span className="font-mono-num text-sm font-semibold text-slate-100">
                  {stats.tetrises}
                </span>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
