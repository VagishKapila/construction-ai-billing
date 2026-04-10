import { useRef, useEffect, useState } from 'react';

interface Planet {
  name: string;        // trade name
  initials: string;    // first 3 letters of trade name
  color: string;       // trust tier color
  orbitRadius: number; // px
  speed: number;       // orbit speed multiplier
  size: number;        // planet radius px
  trustScore?: number;
}

interface OrbitalCanvasProps {
  planets: Planet[];
  onPlanetHover?: (name: string | null) => void;
}

const OrbitalCanvas: React.FC<OrbitalCanvasProps> = ({ planets, onPlanetHover }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoveredRef = useRef<string | null>(null);
  const speedRef = useRef<number>(1);
  const anglesRef = useRef<Record<string, number>>({});
  const [speed, setSpeed] = useState(1);

  // Initialize angles
  useEffect(() => {
    planets.forEach((p, i) => {
      if (!(p.name in anglesRef.current)) {
        anglesRef.current[p.name] = (i / planets.length) * Math.PI * 2;
      }
    });
  }, [planets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    function draw() {
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Dark background
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Center sun (project)
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('HUB', cx, cy);

      planets.forEach((planet) => {
        if (!ctx) return;

        // Orbit ring
        ctx.beginPath();
        ctx.arc(cx, cy, planet.orbitRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // HOVER FREEZE: only animate if not hovered
        if (hoveredRef.current !== planet.name) {
          anglesRef.current[planet.name] = (anglesRef.current[planet.name] || 0) + planet.speed * speedRef.current * 0.005;
        }

        const angle = anglesRef.current[planet.name] || 0;
        const px = cx + Math.cos(angle) * planet.orbitRadius;
        const py = cy + Math.sin(angle) * planet.orbitRadius;

        // Planet hover: scale(1.15) + white ring
        const isHovered = hoveredRef.current === planet.name;
        const radius = isHovered ? planet.size * 1.15 : planet.size;

        if (isHovered) {
          ctx.beginPath();
          ctx.arc(px, py, radius + 3, 0, Math.PI * 2);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = planet.color;
        ctx.fill();

        // 3-letter initials
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(8, planet.size * 0.5)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(planet.initials.substring(0, 3).toUpperCase(), px, py);
      });

      animId = requestAnimationFrame(draw);
    }

    draw();

    // Mouse hover detection
    function handleMouseMove(e: MouseEvent) {
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      let found = false;
      planets.forEach((planet) => {
        const angle = anglesRef.current[planet.name] || 0;
        const px = cx + Math.cos(angle) * planet.orbitRadius;
        const py = cy + Math.sin(angle) * planet.orbitRadius;
        const dist = Math.sqrt((mx - px) ** 2 + (my - py) ** 2);
        if (dist < planet.size + 5) {
          hoveredRef.current = planet.name;
          found = true;
          if (onPlanetHover) onPlanetHover(planet.name);
        }
      });
      if (!found) {
        hoveredRef.current = null;
        if (onPlanetHover) onPlanetHover(null);
      }
    }

    canvas.addEventListener('mousemove', handleMouseMove);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousemove', handleMouseMove);
    };
  }, [planets, onPlanetHover]);

  return (
    <div className="flex flex-col items-center gap-4 bg-[#0f172a] rounded-xl p-6">
      <canvas
        ref={canvasRef}
        width={400}
        height={400}
        className="rounded-lg"
        style={{ background: '#0f172a' }}
      />
      <div className="flex items-center gap-3 text-sm">
        <span className="text-xs text-gray-400">Orbit speed</span>
        <input
          type="range"
          min={0}
          max={5}
          step={0.5}
          value={speed}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            setSpeed(val);
            speedRef.current = val;
          }}
          className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <span className="text-xs text-gray-400 w-8 text-right">{speed.toFixed(1)}x</span>
      </div>
    </div>
  );
};

export default OrbitalCanvas;
