
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GridCell, CardData, DragItem, Rank, HistoryItem, CardStyle, SessionStats, GameTimeStats } from './types';
import { initializeBoard, canPlaceCard, checkWinCondition, reshuffleBoard, calculateScore, getRankValue, getLockedCards } from './utils/gameRules';
import { playSound, stopAllSounds } from './utils/audio';
import { PlayingCard, CardBack } from './components/PlayingCard';
import { Fireworks } from './components/Fireworks';

interface FloatingPoints {
    id: number;
    r: number;
    c: number;
    text: string;
    colorClass: string;
}

type EndGamePhase = 'idle' | 'flipping' | 'wiggling' | 'removing' | 'finished';

const App: React.FC = () => {
  const [grid, setGrid] = useState<GridCell[][]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [isWin, setIsWin] = useState(false);
  const [moves, setMoves] = useState(0);
  const [shufflesRemaining, setShufflesRemaining] = useState(2);
  const [dragOverTarget, setDragOverTarget] = useState<{r: number, c: number} | null>(null);
  const [hintedCards, setHintedCards] = useState<Set<string>>(new Set());
  const [lastMovedCardId, setLastMovedCardId] = useState<string | null>(null);
  const [showStuckModal, setShowStuckModal] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [floatingTexts, setFloatingTexts] = useState<FloatingPoints[]>([]);
  
  // Start Screen State
  const [showRulesModal, setShowRulesModal] = useState(true);
  
  // End Game Animation State
  const [endGamePhase, setEndGamePhase] = useState<EndGamePhase>('idle');
  const [animIndex, setAnimIndex] = useState(-1);

  // Style Preference
  const [cardStyle, setCardStyle] = useState<CardStyle>('classic');

  // Animation States
  const [isDealing, setIsDealing] = useState(false);
  // dealingIndex now represents "revealed up to this index"
  const [dealingIndex, setDealingIndex] = useState(-1);
  const [showCenterDeck, setShowCenterDeck] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [isDeckWiggling, setIsDeckWiggling] = useState(false);
  // New state to control if locked cards are preserved (visible) during shuffle deal
  const [isPreservingLocked, setIsPreservingLocked] = useState(false);

  // Stats
  const [sessionStats, setSessionStats] = useState<SessionStats>({ minMoves: null, maxMoves: 0 });
  const [gameStats, setGameStats] = useState<GameTimeStats>({ longestTimeBetweenMoves: 0, fastMovesCount: 0 });
  const [lastMoveTimestamp, setLastMoveTimestamp] = useState<number>(0);

  // Move Timer Bar State
  const [moveTimer, setMoveTimer] = useState(0); // 0 to 50

  // Scoring State - Split Scores
  const [speedScore, setSpeedScore] = useState(0);
  // Derived state mostly, but we track it implicitly via calculateScore * 100
  
  // Scoring State for History (placeholder to avoid type errors, though strict logic is in place)
  const [completedRows, setCompletedRows] = useState<boolean[]>([false, false, false, false]); 
  
  // Long press refs
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Timer Bar Logic - Dynamic Speed
  // Green: 38-50 (13 steps)
  // Yellow: 26-37 (12 steps)
  // Orange: 13-25 (13 steps)
  // Red: 0-12 (13 steps - including 0)
  useEffect(() => {
    if (moveTimer > 0) {
        let delay = 38; 
        
        if (moveTimer <= 12) {
             // Red: 0-12
             delay = 26; // +10% faster than orange
        } else if (moveTimer <= 25) {
             // Orange: 13-25
             delay = 30; // +10% faster than yellow
        } else if (moveTimer <= 37) {
             // Yellow: 26-37
             delay = 34; // +10% faster than green
        } else {
             // Green: 38-50
             delay = 38; // Base rate
        }

        const timerId = setTimeout(() => {
            setMoveTimer(prev => prev - 1);
        }, delay); 
        return () => clearTimeout(timerId);
    }
  }, [moveTimer]);

  // End Game Animation Driver
  useEffect(() => {
    if (endGamePhase === 'flipping') {
        const id = setInterval(() => {
            setAnimIndex(prev => {
                if (prev >= 51) {
                    clearInterval(id);
                    setEndGamePhase('wiggling');
                    return 52;
                }
                return prev + 1;
            });
        }, 30); 
        return () => clearInterval(id);
    } else if (endGamePhase === 'wiggling') {
        // Wiggle for 2 seconds (Reduced from 5s)
        const t = setTimeout(() => {
            setEndGamePhase('removing');
            setAnimIndex(-1); // Reset for removal loop
        }, 2000);
        return () => clearTimeout(t);
    } else if (endGamePhase === 'removing') {
        const id = setInterval(() => {
            setAnimIndex(prev => {
                if (prev >= 51) {
                    clearInterval(id);
                    setEndGamePhase('finished'); // Skip gold, go to finish
                    return 52;
                }
                return prev + 1;
            });
        }, 30);
        return () => clearInterval(id);
    }
  }, [endGamePhase]);

  const startDealingSequence = (newGrid: GridCell[][], keepLocked: boolean) => {
    // 1. Prepare grid, start shuffle phase
    setGrid(newGrid);
    setIsPreservingLocked(keepLocked);
    setIsShuffling(!keepLocked); // Only do fly-in if not preserving locked (Fresh Game)
    setShowCenterDeck(false); 
    setIsDealing(true);
    setDealingIndex(-1); // Start with all Hidden (except locked if preserving)
    setIsDeckWiggling(false);

    if (!keepLocked) {
        playSound('shuffle');
        // Wait for fly-in animation to land. 
        setTimeout(() => {
            setIsShuffling(false); 
            setShowCenterDeck(true);
            setIsDeckWiggling(true); // Start wiggle
            
            // Wiggle for 1 second before dealing (Reduced from 2s)
            setTimeout(() => {
                setIsDeckWiggling(false);
                setShowCenterDeck(false);
                beginDeal();
            }, 1000);
        }, 600); 
    } else {
        // Immediate deal if keeping locked (Reshuffle)
        playSound('shuffle');
        setTimeout(() => {
            beginDeal();
        }, 300);
    }
  };

  const beginDeal = () => {
    // Start fast deal/appear
    // "place the dealt cards ... quickly ... individually"
    // 30ms interval implies quick sequential dealing
    let currentIdx = 0;
    const interval = setInterval(() => {
        if (currentIdx > 52) { 
            clearInterval(interval);
            setIsDealing(false);
            setIsPreservingLocked(false); // Reset this so normal game rules apply
        } else {
            setDealingIndex(currentIdx);
            // Slight tick for deal
            if (currentIdx % 4 === 0) playSound('deal'); 
            currentIdx++;
        }
    }, 30); // 30ms interval
  };

  const startNewGame = useCallback(() => {
    stopAllSounds(); // Stop fireworks or other sounds immediately
    const newBoard = initializeBoard();
    setHistory([]);
    setIsWin(false);
    setMoves(0);
    setShufflesRemaining(2);
    setDraggedItem(null);
    setDragOverTarget(null);
    setHintedCards(new Set());
    setLastMovedCardId(null);
    setShowStuckModal(false);
    setIsGameOver(false);
    setEndGamePhase('idle');
    setAnimIndex(-1);
    setFloatingTexts([]);
    
    setSpeedScore(0);
    setCompletedRows([false, false, false, false]);
    
    // Reset Game Stats
    setGameStats({ longestTimeBetweenMoves: 0, fastMovesCount: 0 });
    setLastMoveTimestamp(Date.now());
    setMoveTimer(0);

    // Completely clear board (keepLocked = false)
    startDealingSequence(newBoard, false);
  }, []);

  const handleStartGame = () => {
      setShowRulesModal(false);
      startNewGame();
  };

  // Card Score is purely derived from grid state * 100
  const cardScore = useMemo(() => calculateScore(grid) * 100, [grid]);
  const lockedCards = useMemo(() => getLockedCards(grid), [grid]);
  
  const totalScore = cardScore + speedScore;

  // --- Helpers for Logic ---
  
  const getHoleStatus = (rowIdx: number, colIdx: number) => {
    if (colIdx === 0) return 'active'; 
    
    // Check left side chain for King to determine "Dead" status
    let i = colIdx - 1;
    let leftNonHoleCard: CardData | null = null;
    
    while (i >= 0) {
        if (grid[rowIdx][i] !== null) {
            leftNonHoleCard = grid[rowIdx][i];
            break;
        }
        i--;
    }

    if (leftNonHoleCard && leftNonHoleCard.rank === Rank.KING) {
        return 'dead';
    }

    // If immediate left is a hole, it's inactive (cannot be filled yet)
    if (grid[rowIdx][colIdx - 1] === null) return 'inactive';
    
    return 'active';
  };

  const areAllHolesDead = useMemo(() => {
      if (grid.length === 0) return false;
      let activeHoles = 0;
      
      for(let r=0; r<4; r++){
          for(let c=0; c<13; c++){
              if(grid[r][c] === null) {
                  const status = getHoleStatus(r, c);
                  if (status === 'active') {
                      activeHoles++;
                  }
              }
          }
      }
      return activeHoles === 0;
  }, [grid]);

  // Trigger End Game Sequence
  const triggerEndGame = useCallback((win: boolean) => {
      if (endGamePhase !== 'idle') return; // Prevent double trigger
      
      setIsWin(win);
      setIsGameOver(!win);
      
      // Update stats
      setSessionStats(prev => ({
          minMoves: win ? (prev.minMoves === null ? (moves + 1) : Math.min(prev.minMoves, (moves + 1))) : prev.minMoves,
          maxMoves: Math.max(prev.maxMoves, moves + (win?1:0))
      }));

      // Start Animation Sequence
      setEndGamePhase('flipping');
      setAnimIndex(-1);
  }, [endGamePhase, moves]);

  // Check for Game Over or Stuck state
  useEffect(() => {
      if (!isDealing && moves > 0 && !isWin && !isGameOver && endGamePhase === 'idle' && areAllHolesDead) {
          if (shufflesRemaining > 0) {
              setShowStuckModal(true);
          } else {
              setShowStuckModal(false);
              triggerEndGame(false); // Game Over
          }
      } else {
          setShowStuckModal(false);
      }
  }, [areAllHolesDead, isWin, shufflesRemaining, moves, isDealing, endGamePhase, isGameOver, triggerEndGame]);

  // --- Hint Logic Helpers ---

  const clearHints = useCallback(() => {
    setHintedCards(new Set());
    if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
    }
    if (hintDurationTimerRef.current) {
        clearTimeout(hintDurationTimerRef.current);
        hintDurationTimerRef.current = null;
    }
  }, []);

  const isCardPlayable = (card: CardData): boolean => {
      // Logic duplicated from click handler, checks if card can go anywhere
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] === null) {
                if (canPlaceCard(card, r, c, grid)) {
                    return true;
                }
            }
        }
    }
    return false;
  };

  const handleHoverCard = (card: CardData) => {
      if (isDealing) return;
      if (isCardPlayable(card)) {
          playSound('hover');
      }
  };

  const handleToggleStyle = () => {
    setCardStyle(prev => {
        if (prev === 'classic') return 'abstract';
        if (prev === 'abstract') return 'pixel';
        return 'classic';
    });
  };

  const getStyleLabel = () => {
      if (cardStyle === 'classic') return '🖼️ Classic';
      if (cardStyle === 'abstract') return '🎨 Abstract';
      return '👾 Pixel';
  };

  // --- Interaction Handlers ---

  const handleUndo = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      if (history.length === 0 || isDealing || endGamePhase !== 'idle') return;

      const prevState = history[history.length - 1];
      setGrid(prevState.grid);
      setMoves(prevState.moves);
      setLastMovedCardId(prevState.lastMovedCardId);
      setCompletedRows(prevState.completedRows);
      setHistory(prev => prev.slice(0, -1));
      
      setIsWin(false);
      setIsGameOver(false);
      playSound('move');
  }, [history, isDealing, endGamePhase]);

  const recordMoveStats = () => {
      const now = Date.now();
      const timeSinceLast = (now - lastMoveTimestamp) / 1000;
      
      setGameStats(prev => ({
          longestTimeBetweenMoves: Math.max(prev.longestTimeBetweenMoves, timeSinceLast),
          fastMovesCount: timeSinceLast < 2.0 ? prev.fastMovesCount + 1 : prev.fastMovesCount
      }));
      setLastMoveTimestamp(now);
  };

  const handleDragStart = (e: React.DragEvent, card: CardData, rowIndex: number, colIndex: number) => {
    if (isDealing || endGamePhase !== 'idle') {
        e.preventDefault();
        return;
    }
    clearHints(); // Stop any hints or pending timers immediately
    playSound('move');
    setDraggedItem({ card, rowIndex, colIndex });
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    clearHints(); // Ensure hints are cleared after drag attempt finishes
  };

  const handleDragOver = (e: React.DragEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault(); // Necessary to allow dropping
    if (grid[rowIndex][colIndex] === null) {
        if (dragOverTarget?.r !== rowIndex || dragOverTarget?.c !== colIndex) {
            setDragOverTarget({ r: rowIndex, c: colIndex });
        }
    }
  };
  
  const handleDragLeave = () => {
      setDragOverTarget(null);
  }

  const addFloatingText = (r: number, c: number, text: string, colorClass: string) => {
      const newFloat = { id: Date.now() + Math.random(), r, c, text, colorClass };
      setFloatingTexts(prev => [...prev, newFloat]);
      setTimeout(() => {
          setFloatingTexts(prev => prev.filter(f => f.id !== newFloat.id));
      }, 2000);
  };

  const executeMove = (card: CardData, sourceRow: number, sourceCol: number, targetRow: number, targetCol: number) => {
      recordMoveStats();
      
      let speedBonus = 0;
      
      if (moveTimer <= 0) {
          speedBonus = 0;
      } else if (moveTimer <= 12) {
          speedBonus = 5; // Red
      } else if (moveTimer <= 25) {
          speedBonus = 10; // Orange
      } else if (moveTimer <= 37) {
          speedBonus = 15; // Yellow
      } else {
          speedBonus = 20; // Green
      }

      if (speedBonus > 0) {
          setSpeedScore(prev => prev + speedBonus);
      }

      setMoveTimer(50);
      
      setHistory(prev => [...prev, {
          grid: grid,
          moves: moves,
          lastMovedCardId: lastMovedCardId,
          bonusPoints: { streak: 0, speed: speedScore },
          streak: 0,
          completedRows: completedRows
      }]);

      const scoreBefore = calculateScore(grid) * 100;

      const newGrid = grid.map(row => [...row]);
      newGrid[targetRow][targetCol] = card;
      newGrid[sourceRow][sourceCol] = null;
      
      const newLockedCards = getLockedCards(newGrid);
      const isCardLocked = newLockedCards.has(card.id);

      const scoreAfter = calculateScore(newGrid) * 100;
      const cardPointsGained = scoreAfter - scoreBefore;

      if (isCardLocked) {
          const newMoves = moves + 1;
          setMoves(newMoves);
          
          playSound('lock');

          if (cardPointsGained > 0) {
              addFloatingText(targetRow, targetCol, `+${cardPointsGained}`, 'text-gold-shimmer');
              if (speedBonus > 0) {
                  setTimeout(() => {
                      addFloatingText(targetRow, targetCol, `+${speedBonus}`, 'text-red-shimmer');
                  }, 200);
              }
          } else {
              if (speedBonus > 0) {
                  addFloatingText(targetRow, targetCol, `+${speedBonus}`, 'text-red-shimmer');
              }
          }

      } else {
          setMoves(moves + 1);
          playSound('success');
          
          if (speedBonus > 0) {
              addFloatingText(targetRow, targetCol, `+${speedBonus}`, 'text-red-shimmer');
          }
      }

      setGrid(newGrid);
      setLastMovedCardId(card.id);
      
      if (checkWinCondition(newGrid)) {
         // Instead of immediate win state, trigger end sequence
         triggerEndGame(true);
      }
  }

  const handleDrop = (e: React.DragEvent, targetRow: number, targetCol: number) => {
    e.preventDefault();
    clearHints();
    setDragOverTarget(null);

    if (!draggedItem || isDealing || endGamePhase !== 'idle') return;

    const { card, rowIndex: sourceRow, colIndex: sourceCol } = draggedItem;

    if (lockedCards.has(card.id)) {
        playSound('error');
        setDraggedItem(null);
        return;
    }

    if (grid[targetRow][targetCol] !== null) {
        setDraggedItem(null);
        return;
    }

    if (canPlaceCard(card, targetRow, targetCol, grid)) {
      executeMove(card, sourceRow, sourceCol, targetRow, targetCol);
    } else {
      playSound('error');
    }

    setDraggedItem(null);
  };

  const handleCardClick = (card: CardData) => {
    if (isDealing || endGamePhase !== 'idle') return;
    clearHints();
    if (lockedCards.has(card.id)) {
        playSound('error');
        return;
    }

    let sourceRow = -1;
    let sourceCol = -1;
    
    grid.forEach((row, r) => {
        row.forEach((cell, c) => {
            if (cell && cell.id === card.id) {
                sourceRow = r;
                sourceCol = c;
            }
        });
    });

    if (sourceRow === -1) return;

    let moved = false;
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] === null) {
                if (canPlaceCard(card, r, c, grid)) {
                    executeMove(card, sourceRow, sourceCol, r, c);
                    moved = true;
                    break;
                }
            }
        }
        if (moved) break;
    }
    if (!moved) {
        playSound('error');
    }
  };

  const handleHoleClick = (r: number, c: number) => {
      if (isDealing || endGamePhase !== 'idle') return;
      clearHints();
      if (grid[r][c] !== null) return;

      let moved = false;

      if (c === 0) {
          let candidate: { card: CardData, r: number, c: number } | null = null;
          for(let searchR = 0; searchR < 4; searchR++) {
              for(let searchC = 0; searchC < 13; searchC++) {
                  const cell = grid[searchR][searchC];
                  if (cell && cell.rank === Rank.TWO && searchC !== 0) {
                      candidate = { card: cell, r: searchR, c: searchC };
                      break;
                  }
              }
              if (candidate) break;
          }
          
          if (candidate) {
              executeMove(candidate.card, candidate.r, candidate.c, r, c);
              moved = true;
          }
      } else {
        const leftNeighbor = grid[r][c - 1];
        if (leftNeighbor && leftNeighbor.rank !== Rank.KING) {
            const neededRankVal = getRankValue(leftNeighbor.rank) + 1;
            const neededSuit = leftNeighbor.suit;

            for(let searchR = 0; searchR < 4; searchR++) {
                for(let searchC = 0; searchC < 13; searchC++) {
                    const cell = grid[searchR][searchC];
                    if (cell && cell.suit === neededSuit && getRankValue(cell.rank) === neededRankVal) {
                        executeMove(cell, searchR, searchC, r, c);
                        moved = true;
                        break;
                    }
                }
                if(moved) break;
            }
        }
      }

      if (!moved) {
          playSound('error');
      }
  };

  const handleReshuffle = () => {
      if (shufflesRemaining > 0 && endGamePhase === 'idle' && !isDealing) {
          setHistory([]); // Clear history on shuffle
          clearHints();
          setFloatingTexts([]);
          
          const newGrid = reshuffleBoard(grid);
          setShufflesRemaining(prev => prev - 1);
          setLastMovedCardId(null);
          
          setLastMoveTimestamp(Date.now()); // Reset timestamp so time during shuffle doesn't count against user
          setMoveTimer(0);

          // Preserve locked cards during shuffle
          startDealingSequence(newGrid, true);

          if (checkWinCondition(newGrid)) {
              triggerEndGame(true);
          }
      } else {
          playSound('error');
      }
  }

  // --- Hint Logic (Long Press) ---
  
  const startHint = () => {
      const playableCardIds = new Set<string>();
      for(let r=0; r<4; r++) {
          for(let c=0; c<13; c++) {
              if (grid[r][c] === null) {
                  if (c === 0) {
                      grid.forEach(row => row.forEach((cell, cellC) => {
                          if (cell && cell.rank === Rank.TWO && cellC !== 0) {
                              playableCardIds.add(cell.id);
                          }
                      }));
                  } else {
                      const left = grid[r][c-1];
                      if (left && left.rank !== Rank.KING) {
                           const neededVal = getRankValue(left.rank) + 1;
                           grid.forEach(row => row.forEach(cell => {
                               if (cell && cell.suit === left.suit && getRankValue(cell.rank) === neededVal) {
                                   playableCardIds.add(cell.id);
                               }
                           }));
                      }
                  }
              }
          }
      }

      if (playableCardIds.size > 0) {
          setHintedCards(playableCardIds);
          if (hintDurationTimerRef.current) clearTimeout(hintDurationTimerRef.current);
          hintDurationTimerRef.current = setTimeout(() => {
              setHintedCards(new Set());
          }, 1000);
      }
  };

  const handleMouseDown = () => {
      if (endGamePhase !== 'idle' || isDealing) return;
      // Only start timer if not already hinting
      clearHints(); 
      longPressTimerRef.current = setTimeout(() => {
          startHint();
      }, 800); 
  };

  const handleMouseUp = () => {
      if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
      }
  };

  // Determine Dialog Visibility
  const showFinishDialog = endGamePhase === 'finished';

  return (
    <div 
        className="h-screen w-screen flex flex-col items-center font-sans selection:bg-green-700 overflow-hidden"
        style={{
             backgroundImage: `
                radial-gradient(circle at 50% 50%, rgba(22, 101, 52, 0.9), rgba(2, 44, 34, 0.95)),
                url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")
             `,
             backgroundColor: '#022c22'
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleUndo}
    >
        {/* Style for Fly-in Animation - Increased speed by 25% (0.8s -> 0.6s) */}
        <style dangerouslySetInnerHTML={{__html: `
            @keyframes flyIn {
                0% { transform: translate(-50vw, 50vh) rotate(-180deg) scale(0.5); opacity: 0; }
                60% { transform: translate(0, -10px) rotate(10deg) scale(1.1); opacity: 1; }
                100% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
            }
            .animate-flyIn {
                animation: flyIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            }
        `}} />

      {/* Header */}
      <header className="w-full bg-green-950 text-white p-2 shadow-lg border-b border-green-800 z-10 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2">
            <div className="flex items-center gap-4 flex-wrap justify-center">
                <h1 className="text-xl font-bold tracking-wider text-yellow-400">Gaps Solitaire</h1>
                <div className="flex gap-2 items-center scale-90 origin-left">
                  <span className="bg-green-800 px-3 py-1 rounded-full text-sm font-mono border border-green-700">Moves: {moves}</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-mono border ${shufflesRemaining > 0 ? 'bg-blue-900 border-blue-700 text-blue-100' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                      Shuffles: {shufflesRemaining}
                  </span>
                  
                  {/* Split Score Pills */}
                  <span className="bg-yellow-900/50 text-yellow-200 border border-yellow-700 px-4 py-1 rounded-full text-sm font-mono flex items-center gap-2 min-w-[140px] justify-center shadow-sm">
                      <span className="text-yellow-500 font-bold">Card:</span> {cardScore}
                  </span>
                  <span className="bg-red-900/50 text-red-200 border border-red-700 px-4 py-1 rounded-full text-sm font-mono flex items-center gap-2 min-w-[140px] justify-center shadow-sm">
                      <span className="text-red-500 font-bold">Speed:</span> {speedScore}
                  </span>
                </div>
            </div>
            
            <div className="flex gap-2 items-center scale-90 origin-right">
                <button
                    onClick={handleToggleStyle}
                    className="px-3 py-1 bg-green-800 hover:bg-green-700 text-green-100 rounded shadow transition-colors text-xs font-medium border border-green-700 min-w-[100px]"
                    title="Toggle Card Style"
                    disabled={isDealing}
                >
                    {getStyleLabel()}
                </button>

                 <button 
                    onClick={handleReshuffle}
                    disabled={shufflesRemaining <= 0 || (endGamePhase !== 'idle' && !showFinishDialog) || isDealing}
                    className={`
                        px-3 py-1 font-bold rounded shadow transition-all flex items-center gap-2 text-xs
                        ${shufflesRemaining > 0 && endGamePhase === 'idle' && !isDealing
                            ? 'bg-blue-600 hover:bg-blue-500 text-white' 
                            : 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-50'}
                    `}
                >
                    Shuffle
                </button>

                 <button 
                    onClick={startNewGame}
                    className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 text-yellow-950 font-bold rounded shadow transition-colors flex items-center gap-2 text-xs"
                    disabled={isDealing}
                >
                    Restart
                </button>
            </div>
        </div>

        {/* Move Speed Bar */}
        <div className="w-full h-2 mt-2 flex gap-[1px] opacity-90" title="Speed Timer">
            {Array.from({length: 50}).map((_, i) => {
                let colorClass = 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]'; // Default Green (38-50)
                
                if (i <= 12) {
                     colorClass = 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]'; // Red (0-12)
                } else if (i <= 25) {
                     colorClass = 'bg-orange-500 shadow-[0_0_4px_rgba(249,115,22,0.6)]'; // Orange (13-25)
                } else if (i <= 37) {
                     colorClass = 'bg-yellow-400 shadow-[0_0_4px_rgba(250,204,21,0.6)]'; // Yellow (26-37)
                }
                
                return (
                    <div 
                        key={i} 
                        className={`flex-1 rounded-sm transition-colors duration-75 ${i < moveTimer ? colorClass : 'bg-gray-800/30'}`} 
                    />
                )
            })}
        </div>
      </header>

      {/* Main Game Area - Centered, constrained to fit viewport */}
      <main className="flex-1 w-full h-full flex flex-col items-center justify-center p-2 relative overflow-hidden">
        
        {/* Shuffle Fly-in and Center Deck Animation */}
        {(showCenterDeck || isShuffling) && (
            <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                 <div className="relative w-24 h-36 md:w-32 md:h-48">
                    {/* Flying Cards */}
                    {isShuffling && [1,2,3,4,5,6].map(i => (
                         <div key={`fly-${i}`} 
                              className="absolute inset-0 rounded-lg shadow-xl animate-flyIn" 
                              style={{ 
                                  animationDelay: `${i * 0.1}s`
                              }}>
                              <CardBack />
                         </div>
                    ))}

                    {/* Static Stack (visible after shuffle, before deal) */}
                    {showCenterDeck && [1,2,3,4,5].map(i => (
                         <div key={i} className={`absolute inset-0 rounded-lg shadow-xl ${isDeckWiggling ? 'animate-wiggle' : ''}`} style={{ transform: `translate(-${i}px, -${i}px)` }}>
                             <CardBack />
                         </div>
                    ))}
                 </div>
            </div>
        )}

        {/* Card Grid Container */}
        <div className={`
             bg-green-800/40 p-3 rounded-xl border border-green-700/50 shadow-2xl backdrop-blur-sm 
             transition-opacity duration-300
             w-full max-w-[85vw]
             h-auto max-h-[85vh]
             flex flex-col justify-center
             ${showCenterDeck || isShuffling ? 'opacity-0' : 'opacity-100'}
        `}>
            {/* Increased gaps: gap-y-6 (vertical) and gap-x-3/4 (horizontal) */}
            <div className="grid grid-rows-4 gap-y-4 md:gap-y-6 h-full relative">
            {grid.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`} className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-x-3 md:gap-x-4 h-full relative">
                {row.map((cell, colIndex) => {
                    const flatIndex = rowIndex * 13 + colIndex;
                    
                    const isLocked = cell ? lockedCards.has(cell.id) : false;
                    const isVisible = (isPreservingLocked && isLocked) || (!isDealing) || (flatIndex <= dealingIndex);
                    const isFaceUp = true; 
                    const isDealt = isDealing && isVisible && !(isPreservingLocked && isLocked);
                    const floatingText = floatingTexts.find(f => f.r === rowIndex && f.c === colIndex);

                    // End Game Animation Logic
                    // Flip: non-locked cards, index check. If wiggling/pause, they are all flipped.
                    const isFlippedBack = (endGamePhase === 'flipping' && !isLocked && flatIndex <= animIndex) ||
                                          (endGamePhase === 'wiggling' && !isLocked) || 
                                          (endGamePhase === 'removing' && !isLocked); // Keep flipped during removal
                    
                    // Wiggle: only during wiggle phase
                    const isWiggling = endGamePhase === 'wiggling' && !isLocked;

                    // Remove: non-locked cards, index check. If gold/finished, they are removed.
                    const isEndGameHidden = (endGamePhase === 'removing' && !isLocked && flatIndex <= animIndex) || 
                                          (endGamePhase === 'finished' && !isLocked);

                    if (cell) {
                    const isDragging = draggedItem?.card.id === cell.id;

                    return (
                        <div key={cell.id} className="relative w-full h-full">
                            <PlayingCard
                                card={cell}
                                rowIndex={rowIndex}
                                colIndex={colIndex}
                                isDraggable={!isWin && !isGameOver && !isDealing && endGamePhase === 'idle'}
                                isHinted={!draggedItem && hintedCards.has(cell.id)}
                                isLastMoved={cell.id === lastMovedCardId}
                                isLocked={isLocked}
                                isVisible={isVisible}
                                isFaceUp={isFaceUp}
                                isDragging={isDragging}
                                isDealt={isDealt}
                                // End Game Props
                                isFlippedBack={isFlippedBack}
                                isEndGameHidden={isEndGameHidden}
                                isWiggling={isWiggling}
                                cardStyle={cardStyle}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                                onClick={handleCardClick}
                                onHover={handleHoverCard}
                            />
                             {floatingText && (
                                <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
                                    <div className="absolute left-1/2 animate-float-score grid place-items-center">
                                         {/* Back Layer (Outline) */}
                                         <div className="col-start-1 row-start-1 text-base md:text-lg font-black whitespace-nowrap text-white text-outline-white select-none">
                                             {floatingText.text}
                                         </div>
                                         {/* Front Layer (Gradient) */}
                                         <div className={`col-start-1 row-start-1 text-base md:text-lg font-black whitespace-nowrap ${floatingText.colorClass} select-none`}>
                                             {floatingText.text}
                                         </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                    } else {
                    const status = getHoleStatus(rowIndex, colIndex);
                    const isTargeted = dragOverTarget?.r === rowIndex && dragOverTarget?.c === colIndex;
                    
                    let baseClasses = "aspect-[2/3] w-full rounded-lg border-2 transition-all duration-200 flex items-center justify-center";
                    
                    if (status === 'dead') {
                        baseClasses += " border-red-800/60 bg-black/60 cursor-not-allowed shadow-inner";
                    } else if (status === 'inactive') {
                        baseClasses += " border-green-800/30 bg-green-900/10 opacity-60 cursor-not-allowed";
                    } else if (isTargeted) {
                         baseClasses += " border-yellow-400 bg-yellow-400/20 scale-105 shadow-[0_0_15px_rgba(250,204,21,0.3)]";
                    } else {
                        baseClasses += " border-dashed border-emerald-400 bg-emerald-300/30 cursor-pointer hover:bg-emerald-300/40";
                    }
                    
                    // Hide holes immediately when end game starts
                    if (!isVisible || endGamePhase !== 'idle') return <div className="aspect-[2/3] w-full invisible" key={`hole-${rowIndex}-${colIndex}`} />;

                    return (
                        <div
                            key={`hole-${rowIndex}-${colIndex}`}
                            className={baseClasses}
                            onDragOver={(e) => handleDragOver(e, rowIndex, colIndex)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, rowIndex, colIndex)}
                            onClick={() => !isWin && !isGameOver && !isDealing && endGamePhase === 'idle' && handleHoleClick(rowIndex, colIndex)}
                        >
                            {status === 'dead' && (
                                <span className="text-red-700 md:text-5xl text-2xl font-bold opacity-80 select-none drop-shadow-md">✕</span>
                            )}
                        </div>
                    );
                    }
                })}
                </div>
            ))}
            </div>
        </div>

        {/* Instructions - Compact at bottom */}
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-4 text-green-100 text-xs font-medium opacity-80 select-none pointer-events-none">
            <div className="flex items-center gap-1 bg-green-900/60 px-2 py-1 rounded-full border border-green-800">
                <span className="text-yellow-400">🖱️</span> Drag/Click To Move
            </div>
             <div className="flex items-center gap-1 bg-green-900/60 px-2 py-1 rounded-full border border-green-800">
                <span className="text-yellow-400">💡</span> Hold Left Button For Hints
            </div>
             <div className="flex items-center gap-1 bg-green-900/60 px-2 py-1 rounded-full border border-green-800">
                <span className="text-yellow-400">↩️</span> Right Click to Undo Move
            </div>
        </div>
      </main>

      {/* Rules Modal (Start Screen) */}
      {showRulesModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in">
            <div className="bg-green-950 text-white p-8 rounded-xl shadow-2xl max-w-lg relative border-4 border-blue-400/50 animate-pop">
                <div className="text-center mb-6">
                    <h1 className="text-4xl font-bold text-yellow-400 mb-2 drop-shadow-lg">Gap Solitaire</h1>
                    <h2 className="text-sm font-bold text-green-300 uppercase tracking-widest border-b border-green-800 pb-2 inline-block">Rules of the Game</h2>
                </div>
                
                <div className="space-y-3 text-sm md:text-base text-green-100 leading-relaxed mb-8 text-left">
                    <p className="flex gap-2">
                        <span className="text-yellow-500 font-bold">1.</span>
                        <span>The full deck is dealt, then the <span className="text-red-400 font-bold">Aces</span> are removed to create gaps.</span>
                    </p>
                    <p className="flex gap-2">
                        <span className="text-yellow-500 font-bold">2.</span>
                        <span><strong>Goal:</strong> Arrange cards by suit in sequence from <span className="text-white font-mono">2</span> to <span className="text-white font-mono">King</span> on each row.</span>
                    </p>
                    <p className="flex gap-2">
                        <span className="text-yellow-500 font-bold">3.</span>
                        <span>Fill gaps with the card that is <strong>next in sequence</strong> (same suit) to the card on the <em>left</em>.</span>
                    </p>
                    <p className="flex gap-2">
                        <span className="text-yellow-500 font-bold">4.</span>
                        <span><span className="text-red-400 font-bold">Kings</span> are sequence blockers. No card can be placed to the right of a King.</span>
                    </p>
                    <p className="flex gap-2">
                        <span className="text-yellow-500 font-bold">5.</span>
                        <span>When all gaps are blocked by Kings, cards are <strong>shuffled</strong> and redealt. You have <strong>3 rounds</strong> to win!</span>
                    </p>
                </div>

                <button 
                    onClick={handleStartGame}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg font-bold shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all transform hover:scale-[1.02] text-xl border border-blue-400/30"
                >
                    Start Game
                </button>
            </div>
        </div>
      )}

      {/* Shuffle Required Modal - Only show if idle */}
      {showStuckModal && !isGameOver && endGamePhase === 'idle' && (
         <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in">
            <div className="bg-green-950 text-white p-8 rounded-xl shadow-2xl max-w-sm text-center border border-green-700 animate-pop">
                <div className="text-yellow-500 text-5xl mb-4">⚠️</div>
                <h3 className="text-2xl font-bold mb-2">Shuffle Required</h3>
                <p className="text-green-200 mb-6">
                    All gaps are blocked by Kings or other gaps. No more moves are possible.
                </p>
                <button 
                    onClick={handleReshuffle}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow-lg transition-colors"
                >
                    Shuffle Board ({shufflesRemaining} left)
                </button>
            </div>
         </div>
      )}

      {/* Game Over Modal - Opacity adjusted to bg-black/25 */}
      {isGameOver && showFinishDialog && (
        <>
            <Fireworks />
            <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in">
                <div className="bg-green-950 text-white p-8 rounded-xl shadow-2xl max-w-md text-center border-4 border-red-500 animate-pop z-50">
                    <div className="text-6xl mb-4">🎆</div>
                    <h3 className="text-3xl font-bold mb-2 text-red-400">Game Over</h3>
                    <p className="text-green-200 mb-4">
                        No more moves possible and no shuffles remaining.
                    </p>
                    
                    {/* Stats Grid */}
                     <div className="grid grid-cols-2 gap-3 mb-6 text-xs">
                        <div className="bg-gray-800 p-2 rounded">
                            <div className="text-gray-400">Moves (Total)</div>
                            <div className="text-xl font-mono text-white">{moves}</div>
                        </div>
                         <div className="bg-gray-800 p-2 rounded">
                            <div className="text-gray-400">Fast Moves (&lt;2s)</div>
                            <div className="text-xl font-mono text-green-300">{gameStats.fastMovesCount}</div>
                        </div>
                        <div className="bg-gray-800 p-2 rounded">
                            <div className="text-gray-400">Longest Pause</div>
                            <div className="text-xl font-mono text-yellow-300">{gameStats.longestTimeBetweenMoves.toFixed(1)}s</div>
                        </div>
                        <div className="bg-gray-800 p-2 rounded">
                            <div className="text-gray-400">Max Moves per Round</div>
                            <div className="text-xl font-mono text-red-300">{sessionStats.maxMoves}</div>
                        </div>
                    </div>

                    <div className="mb-6 border-t border-green-800 pt-4 space-y-2">
                         <div className="flex justify-between items-end">
                             <span className="text-yellow-500 font-bold text-sm">Card Score:</span>
                             <span className="text-xl font-mono text-yellow-200">{cardScore}</span>
                         </div>
                         <div className="flex justify-between items-end border-b border-green-800 pb-2 mb-2">
                             <span className="text-red-500 font-bold text-sm">Speed Score:</span>
                             <span className="text-xl font-mono text-red-200">{speedScore}</span>
                         </div>
                         <div className="flex justify-between items-end pt-2">
                             <span className="text-green-400 uppercase tracking-widest text-xs font-bold">Total Score</span>
                             <span className="text-4xl font-bold text-white">{totalScore}</span>
                         </div>
                    </div>

                    <button 
                        onClick={startNewGame}
                        className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 text-yellow-950 rounded-lg font-bold shadow-lg transition-colors text-lg"
                    >
                        Play Again
                    </button>
                </div>
            </div>
        </>
      )}

      {/* Win Modal - Styled like Game Over */}
      {isWin && showFinishDialog && (
        <>
            <Fireworks />
            <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50 backdrop-blur-sm animate-fade-in">
                <div className="bg-green-950 text-white p-8 rounded-xl shadow-2xl max-w-md text-center border-4 border-yellow-400 animate-pop z-50">
                    <div className="text-6xl mb-4">🏆</div>
                    <h2 className="text-3xl font-bold mb-2 text-yellow-400">Congratulations!</h2>
                    <p className="text-green-200 mb-6">You have successfully arranged all decks!</p>
                    
                    {/* Stats Grid */}
                     <div className="grid grid-cols-2 gap-3 mb-6 text-xs text-center">
                        <div className="bg-gray-800 p-2 rounded">
                            <div className="text-gray-400">Moves</div>
                            <div className="text-xl font-mono text-white">{moves}</div>
                        </div>
                        <div className="bg-gray-800 p-2 rounded">
                            <div className="text-gray-400">Fast Moves</div>
                            <div className="text-xl font-mono text-green-300">{gameStats.fastMovesCount}</div>
                        </div>
                         <div className="bg-gray-800 p-2 rounded">
                            <div className="text-gray-400">Min Moves (Session)</div>
                            <div className="text-xl font-mono text-blue-300">{sessionStats.minMoves}</div>
                        </div>
                        <div className="bg-gray-800 p-2 rounded">
                            <div className="text-gray-400">Max Moves per Round</div>
                            <div className="text-xl font-mono text-blue-300">{sessionStats.maxMoves}</div>
                        </div>
                    </div>

                    <div className="mb-6 border-t border-green-800 pt-4 space-y-2">
                         <div className="flex justify-between items-end">
                             <span className="text-yellow-500 font-bold text-sm">Card Score:</span>
                             <span className="text-xl font-mono text-yellow-200">{cardScore}</span>
                         </div>
                         <div className="flex justify-between items-end border-b border-green-800 pb-2 mb-2">
                             <span className="text-red-500 font-bold text-sm">Speed Score:</span>
                             <span className="text-xl font-mono text-red-200">{speedScore}</span>
                         </div>
                         <div className="flex justify-between items-end pt-2">
                             <span className="text-green-400 uppercase tracking-widest text-xs font-bold">Total Score</span>
                             <span className="text-4xl font-bold text-white">{totalScore}</span>
                         </div>
                    </div>

                    <button 
                        onClick={startNewGame}
                        className="w-full py-3 bg-yellow-600 hover:bg-yellow-500 text-yellow-950 rounded-lg font-bold shadow-lg transition-colors text-lg"
                    >
                        Play Again
                    </button>
                </div>
            </div>
        </>
      )}
    </div>
  );
};

export default App;
