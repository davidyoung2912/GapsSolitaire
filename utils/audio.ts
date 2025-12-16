
// Simple Web Audio API wrapper to generate sounds without external assets
const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
let audioCtx: AudioContext | null = null;
let activeNodes: AudioScheduledSourceNode[] = [];

const getAudioContext = () => {
  if (!audioCtx && AudioContextClass) {
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
};

// Stops all currently playing sounds (useful for stopping fireworks on reset)
export const stopAllSounds = () => {
  activeNodes.forEach(node => {
    try {
      node.stop();
      node.disconnect();
    } catch (e) {
      // Ignore errors if node already stopped
    }
  });
  activeNodes = [];
};

export const playSound = (type: 'move' | 'shuffle' | 'success' | 'error' | 'lock' | 'deal' | 'hover' | 'firework') => {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  let duration = 0;

  // Track the source node to stop it later if needed
  let sourceNode: AudioScheduledSourceNode = osc; 

  if (type === 'move') {
    // Short tick for drag start
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    duration = 0.05;
    osc.start(now);
    osc.stop(now + duration);
  } else if (type === 'deal') {
    // Very short, crisp tick for dealing cards
    osc.type = 'square'; // Sharper sound
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.03);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    duration = 0.05;
    osc.start(now);
    osc.stop(now + duration);
  } else if (type === 'hover') {
    // Louder, cheerful ping (C6)
    osc.type = 'triangle'; 
    osc.frequency.setValueAtTime(1046.50, now); 
    gain.gain.setValueAtTime(0.08, now); // Significantly louder
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    duration = 0.1;
    osc.start(now);
    osc.stop(now + duration);
  } else if (type === 'firework') {
    // Explosion noise
    osc.disconnect();
    gain.disconnect();
    
    const bufferSize = ctx.sampleRate * 0.5; 
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
         // Simple noise with decay
         data[i] = (Math.random() * 2 - 1) * Math.exp(-5 * (i / bufferSize)); 
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    sourceNode = noise; // Track noise source
    
    // Lowpass filter for "thud/boom" sound rather than hiss
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;

    const noiseGain = ctx.createGain();
    // Increase volume by 50% (from 0.8 to 1.2)
    noiseGain.gain.setValueAtTime(1.2, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
    
    // Force stop after 10 seconds unconditionally
    setTimeout(() => {
        try {
            noise.stop();
            noise.disconnect();
            activeNodes = activeNodes.filter(n => n !== noise);
        } catch(e) {}
    }, 10000);

    // Auto cleanup logic handled by activeNodes tracking, but explicit timeout above ensures it.
  } else if (type === 'success') {
    // Standard placement - soft thud/click
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now); 
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    duration = 0.15;
    osc.start(now);
    osc.stop(now + duration);
  } else if (type === 'lock') {
    // Locked sequence - Magical High Pitch Ding
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15); // A6
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    
    // Add harmonics for "sparkle"
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1318.51, now); // E6
    gain2.gain.setValueAtTime(0.05, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

    activeNodes.push(osc2); // Track second osc

    duration = 0.8;
    osc.start(now);
    osc.stop(now + duration);
    osc2.start(now);
    osc2.stop(now + duration);
  } else if (type === 'error') {
    // Negative Two-Tone (Bup-Bow)
    osc.type = 'sawtooth';
    
    // Tone 1: 150Hz
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.setValueAtTime(150, now + 0.15);
    
    // Tone 2: 110Hz (Lower)
    osc.frequency.setValueAtTime(110, now + 0.15);
    osc.frequency.linearRampToValueAtTime(80, now + 0.35);

    // Envelope
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.setValueAtTime(0.1, now + 0.15); // Sustain
    gain.gain.setValueAtTime(0.08, now + 0.151); // slight dip for second note
    gain.gain.linearRampToValueAtTime(0.001, now + 0.35);
    
    duration = 0.35;
    osc.start(now);
    osc.stop(now + duration);
  } else if (type === 'shuffle') {
    // Rapid sequence to simulate shuffle noise
    osc.disconnect();
    gain.disconnect();
    
    const bufferSize = ctx.sampleRate * 0.5; // 0.5 seconds
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    sourceNode = noise;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.1, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
  }

  // Add to active nodes for tracking
  activeNodes.push(sourceNode);

  // Cleanup from array when done (if duration is known)
  if (duration > 0 || type === 'shuffle') {
      const cleanupTime = type === 'shuffle' ? 1000 : duration * 1000 + 100;
      setTimeout(() => {
          activeNodes = activeNodes.filter(n => n !== sourceNode);
      }, cleanupTime);
  }
  // Note: 'firework' cleanup is handled by its specific long timeout or stopAllSounds
};
