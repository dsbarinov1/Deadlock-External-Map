export interface Point {
  x: number;
  y: number;
}

export interface DrawingPath {
  points: Point[];
  color: string;
  width: number;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export enum ToolType {
  PEN = 'PEN',
  ERASER = 'ERASER',
  MARKER = 'MARKER'
}

export interface Marker {
  id: string;
  x: number;
  y: number;
  type: 'danger' | 'move' | 'ward';
}

// Add Overwolf global types for TS
declare global {
  interface Window {
    overwolf: any;
  }
  var overwolf: any;
}