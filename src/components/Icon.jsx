import React from 'react'
import {
  House, Layers, Puzzle, Settings, Terminal, Play, CircleStop, Plus, Search, FolderOpen, Trash, Pencil,
  Download, Check, TriangleAlert, User, LogOut, X, Minus, Square, Copy, ChevronsUpDown, Cpu, Palette,
  Sparkles, Upload, Package, ImagePlus, Ghost, Clock, Gauge, Boxes, ArrowLeft, RefreshCw, FileArchive, MemoryStick, Timer, Shirt, Volume2, Film
} from 'lucide-react'

// Nombres cortos para los iconos de lucide
const icons = {
  home: House, layers: Layers, puzzle: Puzzle, settings: Settings, terminal: Terminal, play: Play,
  stop: CircleStop, plus: Plus, search: Search, folder: FolderOpen, trash: Trash, edit: Pencil,
  download: Download, check: Check, alert: TriangleAlert, user: User, logout: LogOut, x: X, minus: Minus,
  square: Square, copy: Copy, chevron: ChevronsUpDown, cpu: Cpu, palette: Palette, sparkles: Sparkles,
  upload: Upload, package: Package, image: ImagePlus, ghost: Ghost, clock: Clock, gauge: Gauge,
  boxes: Boxes, back: ArrowLeft, refresh: RefreshCw, archive: FileArchive, ram: MemoryStick, timer: Timer, shirt: Shirt, sound: Volume2, film: Film
}

export function Icon ({ name, size = 18, className = '', fill }) {
  const C = icons[name] || Ghost
  return <C className={`icon ${className}`} size={size} strokeWidth={2} aria-hidden="true" fill={fill || 'none'} />
}
