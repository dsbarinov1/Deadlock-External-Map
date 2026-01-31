import React, { useRef, useEffect, useState } from 'react';
import { CropRegion, DrawingPath, Point, ToolType, Marker } from '../types';

interface MapCanvasProps {
  videoStream: MediaStream | null;
  cropRegion: CropRegion;
  drawings: DrawingPath[];
  setDrawings: React.Dispatch<React.SetStateAction<DrawingPath[]>>;
  markers: Marker[];
  setMarkers: React.Dispatch<React.SetStateAction<Marker[]>>;
  activeTool: ToolType;
  selectedColor: string;
  onCanvasRef: (canvas: HTMLCanvasElement | null) => void;
}

const MapCanvas: React.FC<MapCanvasProps> = ({
  videoStream,
  cropRegion,
  drawings,
  setDrawings,
  markers,
  setMarkers,
  activeTool,
  selectedColor,
  onCanvasRef
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(document.createElement('video'));
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);

  // Keep track of the actual rendered area of the map on the canvas
  // We use a ref so we can access it synchronously in event handlers without stale closures
  const renderRectRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Pass ref up for screenshotting
  useEffect(() => {
    onCanvasRef(canvasRef.current);
  }, [onCanvasRef]);

  // Initialize Video Stream
  useEffect(() => {
    const video = videoRef.current;
    if (videoStream) {
      video.srcObject = videoStream;
      video.play().catch(console.error);
    }
    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [videoStream]);

  // Animation Loop: Draw Video Frame + Drawings
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const video = videoRef.current;
    if (!canvas || !ctx) return;

    let animationFrameId: number;

    const render = () => {
      // 1. Resize canvas to fit container
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
          canvas.width = clientWidth;
          canvas.height = clientHeight;
        }
      }

      // 2. Clear canvas (black background for letterboxing)
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 3. Calculate Aspect Fit (Letterbox/Pillarbox)
      // We want to fit cropRegion into canvas without distortion
      const cropAspect = cropRegion.width / cropRegion.height;
      const canvasAspect = canvas.width / canvas.height;

      let drawW = canvas.width;
      let drawH = canvas.height;
      let drawX = 0;
      let drawY = 0;

      // If canvas is wider than the crop, we need pillarbox (side bars)
      // If canvas is taller than the crop, we need letterbox (top/bottom bars)
      if (canvasAspect > cropAspect) {
        drawW = canvas.height * cropAspect;
        drawX = (canvas.width - drawW) / 2;
      } else {
        drawH = canvas.width / cropAspect;
        drawY = (canvas.height - drawH) / 2;
      }

      // Update ref for event handlers
      renderRectRef.current = { x: drawX, y: drawY, w: drawW, h: drawH };

      // 4. Draw Cropped Video Frame
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(
          video,
          cropRegion.x, cropRegion.y, cropRegion.width, cropRegion.height, // Source from video
          drawX, drawY, drawW, drawH // Destination on canvas
        );
      } else {
        ctx.fillStyle = '#111';
        ctx.fillRect(drawX, drawY, drawW, drawH);
        ctx.fillStyle = '#555';
        ctx.font = '20px sans-serif';
        ctx.fillText("Waiting for stream...", drawX + 20, drawY + 40);
      }

      // Helper to transform normalized coordinate to screen coordinate
      const toScreen = (p: Point) => ({
        x: drawX + p.x * drawW,
        y: drawY + p.y * drawH
      });

      // 5. Draw Existing Paths
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      drawings.forEach(path => {
        if (path.points.length < 2) return;
        ctx.beginPath();
        ctx.strokeStyle = path.color;
        ctx.lineWidth = path.width; // Fixed pixel width for visibility
        
        const p0 = toScreen(path.points[0]);
        ctx.moveTo(p0.x, p0.y);
        
        for (let i = 1; i < path.points.length; i++) {
          const p = toScreen(path.points[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      });

      // 6. Draw Current Drawing Path
      if (currentPath.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 4;
        
        const p0 = toScreen(currentPath[0]);
        ctx.moveTo(p0.x, p0.y);

        for (let i = 1; i < currentPath.length; i++) {
          const p = toScreen(currentPath[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }

      // 7. Draw Markers
      markers.forEach(marker => {
         const screenPos = toScreen(marker);
         
         ctx.save();
         ctx.translate(screenPos.x, screenPos.y);
         
         if (marker.type === 'danger') {
           ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'; // Red
           ctx.beginPath();
           ctx.moveTo(0, -10);
           ctx.lineTo(10, 10);
           ctx.lineTo(-10, 10);
           ctx.fill();
           ctx.fillStyle = 'white';
           ctx.font = 'bold 12px sans-serif';
           ctx.textAlign = 'center';
           ctx.fillText('!', 0, 8);
         } else if (marker.type === 'move') {
           ctx.fillStyle = 'rgba(34, 197, 94, 0.9)'; // Green
           ctx.beginPath();
           ctx.arc(0, 0, 8, 0, Math.PI * 2);
           ctx.fill();
         } else {
            // Ward/Vision
            ctx.fillStyle = 'rgba(234, 179, 8, 0.9)'; // Yellow
            ctx.fillRect(-6, -6, 12, 12);
         }
         
         ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [videoStream, cropRegion, drawings, currentPath, selectedColor, markers]);

  // --- Input Handlers (Convert Screen Pixels to Normalized Coords) ---

  const getNormalizedPoint = (e: React.MouseEvent): Point | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const { x, y, w, h } = renderRectRef.current;
    if (w === 0 || h === 0) return null;

    // Mouse position relative to canvas
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert to normalized relative to the map image
    return {
      x: (mouseX - x) / w,
      y: (mouseY - y) / h
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const point = getNormalizedPoint(e);
    if (!point) return;

    if (activeTool === ToolType.PEN) {
      setIsDrawing(true);
      setCurrentPath([point]);
    } else if (activeTool === ToolType.MARKER) {
      const newMarker: Marker = {
        id: Date.now().toString(),
        x: point.x,
        y: point.y,
        type: 'danger'
      };
      setMarkers(prev => [...prev, newMarker]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || activeTool !== ToolType.PEN) return;
    const point = getNormalizedPoint(e);
    if (point) {
      setCurrentPath(prev => [...prev, point]);
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && activeTool === ToolType.PEN) {
      setIsDrawing(false);
      if (currentPath.length > 1) {
        setDrawings(prev => [...prev, { points: currentPath, color: selectedColor, width: 4 }]);
      }
      setCurrentPath([]);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-black relative cursor-crosshair">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="block w-full h-full"
      />
    </div>
  );
};

export default MapCanvas;