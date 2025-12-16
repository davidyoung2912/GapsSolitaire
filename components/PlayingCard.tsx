
import React, { useEffect, useState, useRef } from 'react';
import { CardData, CardStyle, Rank, Suit } from '../types';

// Cyber/Tech Card Back Component
export const CardBack: React.FC = () => (
  <div className="w-full h-full bg-[#051014] rounded-lg border border-cyan-900/50 overflow-hidden relative shadow-md">
      {/* Corner Brackets */}
      <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-cyan-500 rounded-tl-sm"></div>
      <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-cyan-500 rounded-tr-sm"></div>
      <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-cyan-500 rounded-bl-sm"></div>
      <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-cyan-500 rounded-br-sm"></div>

      {/* Center Circle */}
      <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[60%] aspect-square rounded-full border-[3px] border-cyan-600/80 flex items-center justify-center shadow-[0_0_10px_rgba(8,145,178,0.4)]">
              {/* Center Square */}
              <div className="w-[40%] aspect-square bg-cyan-700/80 rotate-45 shadow-[0_0_5px_rgba(8,145,178,0.6)]"></div>
          </div>
      </div>
      
      {/* Subtle Scanlines/Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:10px_10px]"></div>
  </div>
);

interface PlayingCardProps {
  card: CardData;
  rowIndex: number;
  colIndex: number;
  isDraggable: boolean;
  isHinted?: boolean;
  isLastMoved?: boolean;
  isLocked?: boolean;
  isVisible?: boolean; // Controls if the card slot is empty or occupied (visually)
  isFaceUp?: boolean; // New prop for flip animation
  isDragging?: boolean;
  isDealt?: boolean; // New prop for appear animation
  // End Game Animation Props
  isFlippedBack?: boolean; // For end game flip
  isEndGameHidden?: boolean; // For end game removal
  isWiggling?: boolean; // For end game wiggle
  cardStyle: CardStyle;
  onDragStart: (e: React.DragEvent, card: CardData, r: number, c: number) => void;
  onDragEnd: () => void;
  onClick: (card: CardData) => void;
  onHover?: (card: CardData) => void;
}

const SuitIcon: React.FC<{ suit: Suit; className?: string }> = ({ suit, className }) => {
  switch (suit) {
    case Suit.HEARTS:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      );
    case Suit.DIAMONDS:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M12 2L2 12l10 10 10-10L12 2z" />
        </svg>
      );
    case Suit.CLUBS:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M19.07 13.88c.84-1.33.67-3.13-.57-4.22-1.55-1.37-3.87-1-5.18.59l-.05.08-.96-1.57c.72-1.57.34-3.51-1.04-4.71-1.53-1.33-3.85-1.09-5.27.42-1.42 1.51-1.3 3.86.13 5.3l.11.1-1.34 1.34c-1.33-.84-3.13-.67-4.22.57-1.37 1.55-1 3.87.59 5.18 1.57.72 3.51.34 4.71-1.04l.5-.58.38 2.37h6.3l.38-2.38.48.59c1.09 1.34 2.92 1.83 4.52 1.15 1.62-.68 2.45-2.45 1.83-4.19z" />
        </svg>
      );
    case Suit.SPADES:
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
           <path d="M12 2C9 7 5 9 5 14c0 3.31 2.69 6 6 6 0 0 1.5-4.5 1-4.5s1 4.5 1 4.5c3.31 0 6-2.69 6-6 0-5-4-7-7-12z" />
        </svg>
      );
    default:
      return null;
  }
};

const getRankDisplay = (rank: Rank) => {
  if (rank === Rank.TEN) return '10';
  return rank;
};

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  rowIndex,
  colIndex,
  isDraggable,
  isHinted,
  isLastMoved,
  isLocked,
  isVisible = true,
  isFaceUp = true,
  isDragging = false,
  isDealt = false,
  isFlippedBack = false,
  isEndGameHidden = false,
  isWiggling = false,
  cardStyle,
  onDragStart,
  onDragEnd,
  onClick,
  onHover
}) => {
  const [animClass, setAnimClass] = useState('');
  const isMounted = useRef(true);
  const frontRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  useEffect(() => {
    // Priority: EndGame Flip > Deal Appear > Move Flip
    if (isFlippedBack && isMounted.current) {
        // Trigger flip to back
        setAnimClass('animate-flip-out');
    } else if (isLastMoved && isMounted.current) {
        setAnimClass('animate-flip-in'); // 0.5s duration now
        const t = setTimeout(() => {
            if (isMounted.current && !isFlippedBack) setAnimClass('');
        }, 650); 
        return () => clearTimeout(t);
    } else if (isDealt && isMounted.current) {
        setAnimClass('animate-appear');
        const t = setTimeout(() => {
            if (isMounted.current && !isFlippedBack) setAnimClass('');
        }, 800);
        return () => clearTimeout(t);
    } else if (!isFlippedBack) {
        setAnimClass('');
    }
  }, [isLastMoved, isDealt, isFlippedBack]);

  const handleDragStart = (e: React.DragEvent) => {
    if (!isDraggable || isLocked || !isFaceUp) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ r: rowIndex, c: colIndex }));
    
    // Create a clone of the card element for drag image
    // This solves issues with sizing, visibility, and 3D transforms on the original element
    if (frontRef.current) {
        const rect = frontRef.current.getBoundingClientRect();
        
        // Deep clone the visible face
        const clone = frontRef.current.cloneNode(true) as HTMLElement;
        
        // Enforce dimensions
        clone.style.width = `${rect.width}px`;
        clone.style.height = `${rect.height}px`;
        
        // Position off-screen but visible to the rendering engine
        clone.style.position = 'absolute';
        clone.style.top = '-9999px';
        clone.style.left = '-9999px';
        clone.style.zIndex = '9999';
        clone.style.pointerEvents = 'none'; 
        
        // Append to body so setDragImage can see it
        document.body.appendChild(clone);
        
        // Set the drag image
        e.dataTransfer.setDragImage(clone, rect.width / 2, rect.height / 2);
        
        // Remove the clone after a short delay (0ms often works, but slightly more is safer for some browsers)
        setTimeout(() => {
            if (document.body.contains(clone)) {
                document.body.removeChild(clone);
            }
        }, 10);
    }
    
    onDragStart(e, card, rowIndex, colIndex);
  };
  
  const handleMouseEnter = () => {
      if (isDraggable && !isLocked && onHover && isFaceUp) {
          onHover(card);
      }
  };

  const isRed = card.suit === Suit.HEARTS || card.suit === Suit.DIAMONDS;
  const colorClass = isRed ? 'text-red-600' : 'text-slate-900';
  
  if (!isVisible || isEndGameHidden) {
    return <div className="aspect-[2/3] w-full" />; 
  }

  const renderFront = () => {
    if (cardStyle === 'classic') {
       return (
          <>
            <img
              src={card.image}
              alt={`${card.rank} of ${card.suit}`}
              className={`w-full h-full object-fill pointer-events-none rounded-lg select-none ${isLocked ? 'opacity-90' : ''}`}
              loading="eager"
            />
            {isLocked && (
                <div className="absolute inset-0 bg-green-900/10 rounded-lg pointer-events-none" />
            )}
          </>
       );
    } else if (cardStyle === 'pixel') {
        // Retro Pixel Style
        const rankChar = getRankDisplay(card.rank);
        return (
            <div className={`w-full h-full rounded-lg flex flex-col justify-between p-2 select-none border-4 border-black ${isLocked ? 'bg-gray-300' : 'bg-white'}`}>
                <div className={`font-mono text-sm md:text-base font-bold leading-none ${colorClass}`}>
                    {rankChar}
                </div>
                <div className="flex justify-center items-center flex-grow">
                     <div className={`transform scale-[2] md:scale-[3] ${colorClass} font-mono text-2xl`}>
                        {card.suit === Suit.HEARTS && '♥'}
                        {card.suit === Suit.DIAMONDS && '♦'}
                        {card.suit === Suit.CLUBS && '♣'}
                        {card.suit === Suit.SPADES && '♠'}
                     </div>
                </div>
                <div className={`font-mono text-sm md:text-base font-bold leading-none transform rotate-180 ${colorClass}`}>
                    {rankChar}
                </div>
                {isLocked && (
                    <div className="absolute inset-0 bg-black/10 pointer-events-none" />
                )}
            </div>
        );
    } else {
        // Abstract
        return (
          <div className={`w-full h-full rounded-lg flex flex-col justify-between p-1.5 select-none ${colorClass} ${isLocked ? 'bg-slate-100' : 'bg-white'}`}>
             <div className="text-xs md:text-sm font-bold leading-none flex flex-col items-center">
                <span>{getRankDisplay(card.rank)}</span>
                <SuitIcon suit={card.suit} className="w-3 h-3 md:w-4 md:h-4" />
             </div>
             <div className="flex justify-center items-center flex-grow opacity-90">
                <SuitIcon suit={card.suit} className="w-8 h-8 md:w-14 md:h-14" />
             </div>
             <div className="text-xs md:text-sm font-bold leading-none flex flex-col items-center rotate-180">
                <span>{getRankDisplay(card.rank)}</span>
                <SuitIcon suit={card.suit} className="w-3 h-3 md:w-4 md:h-4" />
             </div>
             {isLocked && (
                <div className="absolute inset-0 bg-green-900/10 rounded-lg pointer-events-none" />
             )}
          </div>
        );
    }
  }

  const rotationStyle = isFlippedBack 
    ? { transform: 'rotateY(180deg)' } // Force back
    : animClass ? undefined : (isFaceUp ? { transform: 'rotateY(0deg)' } : { transform: 'rotateY(180deg)' });

  return (
    <div
      draggable={isDraggable && !isLocked && isFaceUp}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={() => isDraggable && !isLocked && isFaceUp && onClick(card)}
      onMouseEnter={handleMouseEnter}
      className={`
        relative aspect-[2/3] w-full perspective-1000 rounded-lg
        ${isLocked || !isFaceUp
            ? 'cursor-default' 
            : isDraggable 
                ? 'cursor-grab active:cursor-grabbing hover:scale-105 hover:shadow-[0_0_16px_rgba(250,204,21,0.5)] hover:brightness-110 hover:ring-4 hover:ring-yellow-300 hover:z-20' 
                : 'cursor-default'}
        ${isLocked && isFaceUp ? 'brightness-50' : ''}
        ${isHinted && isFaceUp ? 'ring-1 ring-yellow-600 animate-wiggle' : ''}
        ${isWiggling ? 'animate-wiggle' : ''}
        ${isDragging ? 'opacity-40 ring-4 ring-gray-400' : ''}
      `}
    >
      {/* 3D Wrapper that rotates */}
      <div 
        className={`w-full h-full relative preserve-3d transition-transform duration-200 ease-out ${animClass}`}
        style={rotationStyle}
      >
          
          {/* Front Face (0deg) */}
          <div 
            ref={frontRef}
            className={`absolute inset-0 backface-hidden w-full h-full rounded-lg shadow-md bg-white`}
          >
            {renderFront()}
          </div>

          {/* Back Face (180deg) */}
          <div className="absolute inset-0 backface-hidden rotate-y-180 w-full h-full rounded-lg shadow-md">
            <CardBack />
          </div>

      </div>
    </div>
  );
};
