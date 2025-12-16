
import { CardData, GridCell, Rank, Suit } from '../types';

const RANKS: Rank[] = [
  Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE, Rank.SIX, Rank.SEVEN, 
  Rank.EIGHT, Rank.NINE, Rank.TEN, Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE
];

const SUITS: Suit[] = [Suit.HEARTS, Suit.DIAMONDS, Suit.CLUBS, Suit.SPADES];

// Helpers to get numeric value for logic comparisons
export const getRankValue = (rank: Rank): number => {
  const index = RANKS.indexOf(rank);
  // 2 is index 0, so value is 2. Ace is index 12, value 14.
  return index + 2; 
};

export const generateDeck = (): CardData[] => {
  const deck: CardData[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        code: `${rank}${suit}`,
        image: `https://deckofcardsapi.com/static/img/${rank}${suit}.png`,
        id: `${rank}${suit}-${Math.random().toString(36).substr(2, 9)}`,
      });
    }
  }
  return deck;
};

export const shuffleDeck = (deck: CardData[]): CardData[] => {
  const newDeck = [...deck];
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

export const initializeBoard = (): GridCell[][] => {
  let deck = shuffleDeck(generateDeck());
  const rows: GridCell[][] = [];

  // Distribute 52 cards into 4 rows of 13
  for (let i = 0; i < 4; i++) {
    const row: GridCell[] = [];
    for (let j = 0; j < 13; j++) {
      const card = deck.pop();
      if (!card) throw new Error("Deck ran out!");
      
      // If it's an Ace, it becomes a hole immediately
      if (card.rank === Rank.ACE) {
        row.push(null);
      } else {
        row.push(card);
      }
    }
    rows.push(row);
  }
  return rows;
};

export const canPlaceCard = (
  card: CardData,
  targetRow: number,
  targetCol: number,
  grid: GridCell[][]
): boolean => {
  // Rule 1: If target is leftmost column (col 0), only a '2' can be placed there.
  if (targetCol === 0) {
    return card.rank === Rank.TWO;
  }

  const leftNeighbor = grid[targetRow][targetCol - 1];

  // Rule 2: Cannot place if left neighbor is a hole (this shouldn't strictly happen in valid play, but good safety).
  if (!leftNeighbor) {
    return false;
  }

  // Rule 3: No card can be placed into a hole which has a King to the left of it.
  if (leftNeighbor.rank === Rank.KING) {
    return false;
  }

  // Rule 4: Must be same suit as left neighbor.
  if (card.suit !== leftNeighbor.suit) {
    return false;
  }

  // Rule 5: Must be next in sequence (Rank + 1) to the left neighbor.
  const leftVal = getRankValue(leftNeighbor.rank);
  const currentVal = getRankValue(card.rank);

  return currentVal === leftVal + 1;
};

export const isRowComplete = (row: GridCell[]): boolean => {
  // A complete row has 13 cells: 2 through King of same suit, ending with a null.
  
  // Check last cell is hole
  if (row[12] !== null) return false;

  // Check first card is a 2
  if (!row[0] || row[0].rank !== Rank.TWO) return false;

  const suit = row[0].suit;

  for (let i = 0; i < 12; i++) {
    const cell = row[i];
    if (!cell) return false;
    
    // Check suit consistency
    if (cell.suit !== suit) return false;
    
    // Check rank consistency (i=0 is 2, i=1 is 3, etc.)
    // getRankValue returns 2 for Rank.TWO. 
    // So index 0 (Rank 2) should match i + 2.
    if (getRankValue(cell.rank) !== i + 2) return false;
  }
  
  return true;
};

export const checkWinCondition = (grid: GridCell[][]): boolean => {
  // Win if all rows are filled 2..K in order (no holes until the end, effectively).
  for (const row of grid) {
    if (!isRowComplete(row)) return false;
  }
  return true;
};

export const reshuffleBoard = (currentGrid: GridCell[][]): GridCell[][] => {
  const rows = 4;
  const cols = 13;
  // Deep copy grid to avoid mutation issues
  const newGrid: GridCell[][] = currentGrid.map(row => [...row]);
  
  const cardsToShuffle: CardData[] = [];
  const positionsToFill: {r: number, c: number}[] = [];

  // 1. Identify locked cards and gather removable cards
  for (let r = 0; r < rows; r++) {
    let isSequence = true;
    
    // Check the first card. If it's not a 2, the whole row is invalid sequence-wise (though valid game state)
    if (!newGrid[r][0] || newGrid[r][0]!.rank !== Rank.TWO) {
      isSequence = false;
    }

    for (let c = 0; c < cols; c++) {
      if (isSequence) {
        // We are currently in a valid sequence, check continuation
        if (c === 0) {
           // Already checked it is a 2 above, or set isSequence false
           if (!isSequence) {
             const cell = newGrid[r][c];
             if (cell) cardsToShuffle.push(cell);
             positionsToFill.push({r, c});
             newGrid[r][c] = null;
           }
        } else {
           // Check if current card follows previous
           const prev = newGrid[r][c-1];
           const curr = newGrid[r][c];
           
           // Prev is guaranteed to exist and be correct if we are here
           if (curr && prev && curr.suit === prev.suit && getRankValue(curr.rank) === getRankValue(prev.rank) + 1) {
              // Valid continuation, keep it
           } else {
              // Break sequence
              isSequence = false;
              // Collect current
              if (curr) cardsToShuffle.push(curr);
              positionsToFill.push({r, c});
              newGrid[r][c] = null;
           }
        }
      } else {
        // Already broken sequence, collect everything
        const cell = newGrid[r][c];
        if (cell) cardsToShuffle.push(cell);
        positionsToFill.push({r, c});
        newGrid[r][c] = null;
      }
    }
  }

  // 2. Shuffle the collected cards
  for (let i = cardsToShuffle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cardsToShuffle[i], cardsToShuffle[j]] = [cardsToShuffle[j], cardsToShuffle[i]];
  }

  // 3. Prepare items to fill (cards + holes)
  const fillItems: (CardData | null)[] = [...cardsToShuffle];
  while (fillItems.length < positionsToFill.length) {
    fillItems.push(null);
  }
  
  // Randomize the fill items (cards + holes) to distribute holes fairly
  for (let i = fillItems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fillItems[i], fillItems[j]] = [fillItems[j], fillItems[i]];
  }

  // 4. Assign back
  positionsToFill.forEach((pos, idx) => {
    newGrid[pos.r][pos.c] = fillItems[idx];
  });

  return newGrid;
};

export const calculateScore = (grid: GridCell[][]): number => {
  let score = 0;
  for (const row of grid) {
    // Check if row starts with 2
    if (!row[0] || row[0].rank !== Rank.TWO) continue;
    
    // Score for the '2'
    score += 2; 
    let currentRankVal = 2;
    const currentSuit = row[0].suit;

    for (let i = 1; i < row.length; i++) {
      const cell = row[i];
      if (!cell) break;
      
      // Must be same suit
      if (cell.suit !== currentSuit) break;
      
      // Must be next rank
      const val = getRankValue(cell.rank);
      if (val === currentRankVal + 1) {
        score += val;
        currentRankVal = val;
      } else {
        break;
      }
    }
  }
  return score;
};

export const getLockedCards = (grid: GridCell[][]): Set<string> => {
  const locked = new Set<string>();
  for (const row of grid) {
    if (!row[0] || row[0].rank !== Rank.TWO) continue;
    
    locked.add(row[0].id);
    let currentRankVal = 2;
    const currentSuit = row[0].suit;

    for (let i = 1; i < row.length; i++) {
      const cell = row[i];
      if (!cell) break;
      
      if (cell.suit !== currentSuit) break;
      
      const val = getRankValue(cell.rank);
      if (val === currentRankVal + 1) {
        locked.add(cell.id);
        currentRankVal = val;
      } else {
        break;
      }
    }
  }
  return locked;
};
