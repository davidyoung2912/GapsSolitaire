
import React, { useEffect, useRef } from 'react';
import { playSound } from '../utils/audio';

export const Fireworks: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: any[] = [];
    
    // HSL colors with 100% Saturation and 60% Lightness
    const colors = [
      'hsl(0, 100%, 60%)',    // Red
      'hsl(30, 100%, 60%)',   // Orange
      'hsl(60, 100%, 50%)',   // Yellow
      'hsl(120, 100%, 60%)',  // Green
      'hsl(180, 100%, 60%)',  // Cyan
      'hsl(240, 100%, 70%)',  // Blue
      'hsl(280, 100%, 60%)',  // Purple
      'hsl(320, 100%, 60%)'   // Magenta
    ];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const createExplosion = (x: number, y: number) => {
      playSound('firework'); // Add sound effect here
      const particleCount = 60;
      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        // High speed variety for big bursts
        const speed = Math.random() * 8 + 4; 
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1.0,
          // Instead of decay, we use life counter to keep it solid longer
          life: 100 + Math.random() * 50,
          maxLife: 100 + Math.random() * 50
        });
      }
    };

    const loop = () => {
      if (!ctx) return;
      
      // 1. Clear trails faster so they don't look like a wash of transparency
      // Increasing this opacity value (0.2) makes the previous frames disappear faster
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // 2. Draw new particles
      ctx.globalCompositeOperation = 'source-over';

      // Only generate new fireworks for 8 seconds (Reduced from 10s)
      if (Date.now() - startTimeRef.current < 8000) {
        if (Math.random() < 0.04) {
          createExplosion(
              Math.random() * canvas.width, 
              Math.random() * canvas.height * 0.6
          );
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15; // gravity
        p.life--;

        // Keep fully opaque for first 70% of life
        if (p.life > 30) {
            p.alpha = 1;
        } else {
            // Fade out quickly at the end
            p.alpha = p.life / 30;
        }
        
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        
        // Add glow
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Reset shadow for performance if needed, or next iteration overwrites
        ctx.shadowBlur = 0;
      }
      
      // Continue loop only if particles exist or we are within the 9s generation window
      // This allows existing particles to fade out even after generation stops
      if (Date.now() - startTimeRef.current < 9000 || particles.length > 0) {
        requestAnimationFrame(loop);
      }
    };

    const animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[40]" />;
};
