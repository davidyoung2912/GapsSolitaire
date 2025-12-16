
export enum Suit {
  HEARTS = 'H',
  DIAMONDS = 'D',
  CLUBS = 'C',
  SPADES = 'S',
}

export enum Rank {
  TWO = '2',
  THREE = '3',
  FOUR = '4',
  FIVE = '5',
  SIX = '6',
  SEVEN = '7',
  EIGHT = '8',
  NINE = '9',
  TEN = '0', // API uses 0 for 10
  JACK = 'J',
  QUEEN = 'Q',
  KING = 'K',
  ACE = 'A',
}

export interface CardData {
  suit: Suit;
  rank: Rank;
  code: string; // e.g., '2H', '0D'
  image: string;
  id: string; // Unique identifier for React keys
}

export type GridCell = CardData | null; // null represents a hole

export interface DragItem {
  card: CardData;
  rowIndex: number;
  colIndex: number;
}

export type GameStatus = 'playing' | 'won' | 'stuck';

export interface BonusScore {
  streak: number;
  speed: number;
}

export interface HistoryItem {
  grid: GridCell[][];
  moves: number;
  lastMovedCardId: string | null;
  bonusPoints: BonusScore;
  streak: number;
  completedRows: boolean[];
}

export interface SessionStats {
  minMoves: number | null;
  maxMoves: number;
}

export interface GameTimeStats {
  longestTimeBetweenMoves: number; // in seconds
  fastMovesCount: number; // moves under 2 seconds
}

export type CardStyle = 'classic' | 'abstract' | 'pixel';
