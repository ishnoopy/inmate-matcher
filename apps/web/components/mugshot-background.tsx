import { cn } from "@/lib/utils";

export function MugshotBackground({ className }: { className?: string }) {
  // Height markers every 6 inches
  // Assuming 1 line = 3 inches = 40px
  // So 6 inches = 80px = gap-20 (5rem)
  const markers = ["7'0\"", "6'6\"", "6'0\"", "5'6\"", "5'0\"", "4'6\"", "4'0\""];

  return (
    <div className={cn("fixed inset-0 -z-10 flex flex-col items-center justify-center overflow-hidden bg-background pointer-events-none", className)}>
      {/* Height Lines Grid - Lines every 3 inches (40px) */}
      <div 
        className="absolute inset-0 w-full h-full opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: '100% 40px', 
          backgroundPosition: 'center 20px', // Shift to align roughly with markers
          color: 'var(--foreground)'
        }}
      />
      
      {/* Silhouette & Markers Container */}
      <div className="relative w-full h-full max-w-5xl mx-auto flex items-center justify-center">
        
        {/* Left Markers */}
        <div className="hidden md:flex flex-col items-end gap-20 mr-12 pt-4">
          {markers.map((height) => (
            <span key={height} className="text-xl font-mono font-bold text-foreground/10 select-none h-0 flex items-center">
              {height}
            </span>
          ))}
        </div>

        {/* Silhouette SVG */}
        <div className="relative z-10 opacity-[0.04]">
          <svg 
            width="400" 
            height="500" 
            viewBox="0 0 400 500" 
            className="h-[70vh] w-auto fill-foreground"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Head */}
            <path d="M200 50 C 270 50 310 110 310 190 C 310 260 270 300 200 300 C 130 300 90 260 90 190 C 90 110 130 50 200 50 Z" />
            {/* Neck */}
            <rect x="160" y="290" width="80" height="40" />
            {/* Shoulders/Body */}
            <path d="M100 310 C 50 330 20 380 20 500 L 380 500 C 380 380 350 330 300 310 L 260 330 L 140 330 Z" />
          </svg>
        </div>

        {/* Right Markers */}
        <div className="hidden md:flex flex-col items-start gap-20 ml-12 pt-4">
           {markers.map((height) => (
            <span key={height} className="text-xl font-mono font-bold text-foreground/10 select-none h-0 flex items-center">
              {height}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
