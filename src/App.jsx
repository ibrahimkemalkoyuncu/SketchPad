// ============================================
// MODÜL İMPORTLARI VE TİP TANIMLARI
// Konum: src/App.jsx
// React, UI ikonları ve stil kütüphaneleri
// ============================================

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Upload, 
  ZoomIn, 
  ZoomOut, 
  Move, 
  Layers, 
  MousePointer2, 
  PenTool,
  Save,
  Menu,
  X,
  Maximize,
  Sparkles,
  Pencil,
  RefreshCw,
  PlusCircle,
  Minimize2, 
  CornerUpLeft, 
  CornerUpRight,
  Circle, // Daire ikonu
  Square, // Dikdörtgen ikonu
  Grid3x3, // Grid ikonu (F7)
  Magnet, // Snap ikonu (F3)
  Trash2, // Sil ikonu (Delete)
} from 'lucide-react';

// ============================================
// Sabitler
// ============================================
const API_URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=";
const API_KEY = ""; // Canvas runtime'da otomatik sağlanacak
const SNAP_TOLERANCE_PX = 10; // Yakalama hassasiyeti (piksel cinsinden)

// ============================================
// ÇEKİRDEK FONKSİYONLAR - DXF PARSER
// ============================================

const parseDxfSimple = (dxfString) => {
  const lines = dxfString.split(/\r?\n/);
  const entities = [];
  let currentEntity = null;
  let isEntitySection = false;
  let currentVertexX = null;

  // Entity'yi kaydetmeden önce doğrula
  const saveCurrentEntity = () => {
    if (!currentEntity) return;
    
    if (currentEntity.type === 'LINE') {
      if (currentEntity.x1 !== undefined && currentEntity.y1 !== undefined &&
          currentEntity.x2 !== undefined && currentEntity.y2 !== undefined &&
          !isNaN(currentEntity.x1) && !isNaN(currentEntity.y1) &&
          !isNaN(currentEntity.x2) && !isNaN(currentEntity.y2)) {
        if (currentEntity.x1 !== currentEntity.x2 || currentEntity.y1 !== currentEntity.y2) {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'CIRCLE') {
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          currentEntity.r !== undefined && currentEntity.r > 0) {
        entities.push(currentEntity);
      }
    }
    else if (currentEntity.type === 'ARC') {
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          currentEntity.r !== undefined && currentEntity.r > 0) {
        entities.push(currentEntity);
      }
    }
    else if (currentEntity.type === 'LWPOLYLINE') {
      if (currentEntity.vertices && currentEntity.vertices.length >= 2) {
        entities.push(currentEntity);
      }
    }
    else if (currentEntity.type === 'TEXT' || currentEntity.type === 'MTEXT') {
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          currentEntity.text && currentEntity.text.length > 0) {
        entities.push(currentEntity);
      }
    }
  };

  // DXF'i kod-değer çiftleri olarak parse et
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1]?.trim();
    
    if (isNaN(code) || value === undefined) {
      i--; // Tek satır atla, çift olmayan satır olabilir
      continue;
    }
    
    // Section kontrolü
    if (code === 2 && value === 'ENTITIES') {
      isEntitySection = true;
      continue;
    }
    if (code === 0 && value === 'ENDSEC') {
      if (isEntitySection) {
        saveCurrentEntity();
        isEntitySection = false;
      }
      continue;
    }
    
    if (!isEntitySection) continue;
    
    // Entity tipi (kod 0)
    if (code === 0) {
      saveCurrentEntity();
      currentEntity = null;
      currentVertexX = null;
      
      if (value === 'LINE') {
        currentEntity = { type: 'LINE', layer: '0', id: crypto.randomUUID() };
      }
      else if (value === 'CIRCLE') {
        currentEntity = { type: 'CIRCLE', layer: '0', id: crypto.randomUUID() };
      }
      else if (value === 'ARC') {
        currentEntity = { type: 'ARC', layer: '0', id: crypto.randomUUID() };
      }
      else if (value === 'LWPOLYLINE') {
        currentEntity = { type: 'LWPOLYLINE', layer: '0', id: crypto.randomUUID(), vertices: [], closed: false };
      }
      else if (value === 'TEXT') {
        currentEntity = { type: 'TEXT', layer: '0', id: crypto.randomUUID(), text: '', height: 2.5, rotation: 0 };
      }
      else if (value === 'MTEXT') {
        currentEntity = { type: 'MTEXT', layer: '0', id: crypto.randomUUID(), text: '', height: 2.5, rotation: 0 };
      }
      continue;
    }
    
    if (!currentEntity) continue;
    
    // Ortak: Layer (kod 8)
    if (code === 8) {
      currentEntity.layer = value;
      continue;
    }
    
    // LINE
    if (currentEntity.type === 'LINE') {
      if (code === 10) currentEntity.x1 = parseFloat(value);
      else if (code === 20) currentEntity.y1 = parseFloat(value);
      else if (code === 11) currentEntity.x2 = parseFloat(value);
      else if (code === 21) currentEntity.y2 = parseFloat(value);
    }
    // CIRCLE
    else if (currentEntity.type === 'CIRCLE') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 40) currentEntity.r = parseFloat(value);
    }
    // ARC
    else if (currentEntity.type === 'ARC') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 40) currentEntity.r = parseFloat(value);
      else if (code === 50) currentEntity.startAngle = parseFloat(value);
      else if (code === 51) currentEntity.endAngle = parseFloat(value);
    }
    // LWPOLYLINE
    else if (currentEntity.type === 'LWPOLYLINE') {
      if (code === 70) {
        currentEntity.closed = (parseInt(value) & 1) === 1;
      }
      else if (code === 10) {
        currentVertexX = parseFloat(value);
      }
      else if (code === 20 && currentVertexX !== null) {
        const y = parseFloat(value);
        if (!isNaN(currentVertexX) && !isNaN(y)) {
          currentEntity.vertices.push({ x: currentVertexX, y: y });
        }
        currentVertexX = null;
      }
    }
    // TEXT
    else if (currentEntity.type === 'TEXT') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 40) currentEntity.height = parseFloat(value);
      else if (code === 50) currentEntity.rotation = parseFloat(value);
      else if (code === 1) currentEntity.text = value;
    }
    // MTEXT
    else if (currentEntity.type === 'MTEXT') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 40) currentEntity.height = parseFloat(value);
      else if (code === 50) currentEntity.rotation = parseFloat(value);
      else if (code === 1) currentEntity.text = value;
      else if (code === 3) currentEntity.text = (currentEntity.text || '') + value; // MTEXT devam satırları
    }
  }
  
  saveCurrentEntity();
  return entities;
};

// ============================================
// YARDIMCI FONKSİYONLAR - GEOMETRİ & BOUNDS
// ============================================

// Çizimin sınırlarını hesapla (AABB: Axis-Aligned Bounding Box)
const getEntityBounds = (ent) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const updateBounds = (x, y) => {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };

    if (ent.type === 'LINE') {
      updateBounds(ent.x1, ent.y1);
      updateBounds(ent.x2, ent.y2);
    } 
    else if (ent.type === 'CIRCLE' || ent.type === 'ARC') {
      updateBounds(ent.x - ent.r, ent.y - ent.r);
      updateBounds(ent.x + ent.r, ent.y + ent.r);
    }
    else if (ent.type === 'LWPOLYLINE') {
      ent.vertices.forEach(v => updateBounds(v.x, v.y));
    }
    else if (ent.type === 'RECTANGLE') {
        updateBounds(ent.x1, ent.y1);
        updateBounds(ent.x2, ent.y2);
    }
    else if (ent.type === 'TEXT' || ent.type === 'MTEXT') {
      // Yazı için yaklaşık bounds hesapla
      const textWidth = (ent.text?.length || 1) * ent.height * 0.6;
      updateBounds(ent.x, ent.y);
      updateBounds(ent.x + textWidth, ent.y + ent.height);
    }
    
    // Geçerli sınırlar bulunamazsa varsayılan döndür
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
};

// Çizimin genel sınırlarını hesapla
const calculateExtents = (entities) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  entities.forEach(ent => {
    const bounds = getEntityBounds(ent);
    if(bounds) {
        if (bounds.minX < minX) minX = bounds.minX;
        if (bounds.maxX > maxX) maxX = bounds.maxX;
        if (bounds.minY < minY) minY = bounds.minY;
        if (bounds.maxY > maxY) maxY = bounds.maxY;
    }
  });

  if (minX === Infinity) return { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
};

// Çarpışma Kontrolü (Box Selection - Window vs Crossing)
// Kaynak: AABB Intersection/Containment Test
const checkCollision = (entity, selectionRect, mode) => {
    const bounds = getEntityBounds(entity);
    if (!bounds) return false;

    // Seçim kutusu dünya koordinatlarında (SelectionRect: {wMinX, wMinY, wMaxX, wMaxY})
    const { wMinX, wMinY, wMaxX, wMaxY } = selectionRect;
    
    // AABB çarpışma testi (Hem Window hem Crossing için temel)
    const isIntersecting = (
        bounds.minX <= wMaxX &&
        bounds.maxX >= wMinX &&
        bounds.minY <= wMaxY &&
        bounds.maxY >= wMinY
    );
    
    if (!isIntersecting) return false;

    if (mode === 'crossing') {
        // Crossing Selection (Yeşil): Kesişme YETERLİDİR.
        return true;
    } else if (mode === 'window') {
        // Window Selection (Mavi): Nesne tamamen kutu İÇİNDE olmalıdır.
        const isFullyContained = (
            bounds.minX >= wMinX &&
            bounds.maxX <= wMaxX &&
            bounds.minY >= wMinY &&
            bounds.maxY <= wMaxY
        );
        return isFullyContained;
    }
    
    return false; // Varsayılan: Kesişmiyor
}

// Mesafe hesaplayıcı (Dünya koordinatlarında)
const distance = (x1, y1, x2, y2) => Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);


// ============================================
// KOMUT DESENİ (COMMAND PATTERN) TANIMLARI
// ============================================

/**
 * Soyut Komut Sınıfı
 */
class Command {
    execute() { throw new Error("execute() metodu uygulanmalı."); }
    undo() { throw new Error("undo() metodu uygulanmalı."); }
}

/**
 * Entity Ekleme Komutu için Ortak Sınıf (LWPolyline, Circle, Rectangle vb.)
 */
class AddEntityCommand extends Command {
    constructor(newEntity, setEntities, setLayers) {
        super();
        this.newEntity = newEntity;
        this.setEntities = setEntities;
        this.setLayers = setLayers;
    }

    execute() {
        // Nesneyi ekle
        this.setEntities(prev => [...prev, this.newEntity]);
        // Katmanı ekle (varsa)
        if (this.newEntity.layer) {
            this.setLayers(prev => new Set([...prev, this.newEntity.layer]));
        }
    }

    undo() {
        // Nesneyi ID'sine göre sil
        this.setEntities(prev => prev.filter(e => e.id !== this.newEntity.id));
    }
}

// LWPolyline için AddEntityCommand'ı kullanacağız

/**
 * Daire Ekleme Komutu (AddEntityCommand'dan türetildi)
 */
class AddCircleCommand extends AddEntityCommand {}

/**
 * Dikdörtgen Ekleme Komutu (AddEntityCommand'dan türetildi)
 */
class AddRectangleCommand extends AddEntityCommand {}


// ============================================
// UI BİLEŞENİ - TOOLBAR BUTONU
// ============================================

const ToolButton = ({ icon: Icon, active, onClick, title, disabled = false }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    style={active ? {
      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
      boxShadow: '0 0 20px rgba(59, 130, 246, 0.5), 0 4px 6px -1px rgba(0, 0, 0, 0.1)'
    } : {}}
    className={`p-3 md:p-3 rounded-xl transition-all duration-300 touch-manipulation relative overflow-hidden group
      min-w-[44px] min-h-[44px] flex items-center justify-center
      ${active 
        ? 'text-white scale-105' 
        : 'bg-gray-700/80 backdrop-blur-sm text-gray-300 hover:bg-gray-600/90 hover:text-white hover:shadow-md border border-gray-600/30 hover:border-gray-500/50 active:bg-gray-500/90 active:scale-95'
      }
      ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:scale-105'}
      `}
  >
    <Icon size={20} className={`transition-transform duration-300 ${active ? '' : 'group-hover:rotate-12'}`} />
  </button>
);

// ============================================
// ANA UYGULAMA - DXF EDITOR
// ============================================

const App = () => {
  // --- STATE YÖNETİMİ ---
  const canvasRef = useRef(null);
  const [entities, setEntities] = useState([]); 
  const [layers, setLayers] = useState(new Set(['0'])); 
  const [hiddenLayers, setHiddenLayers] = useState(new Set()); 
  
  // Viewport
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [extents, setExtents] = useState(null); 
  
  // Etkileşim
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState('select'); // 'select', 'polyline', 'circle', 'rectangle'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Çizim State'i
  const [currentDrawingState, setCurrentDrawingState] = useState(null); // { startX, startY, type: 'circle'/'rectangle' }
  const [currentPolyline, setCurrentPolyline] = useState([]); 
  const [mouseWorldPos, setMouseWorldPos] = useState({ x: 0, y: 0 });
  
  // Snap State'i
  const [activeSnap, setActiveSnap] = useState(null); 
  const [snapEnabled, setSnapEnabled] = useState(true); // F3/F9 ile açma/kapatma
  
  // Grid State'i
  const [gridVisible, setGridVisible] = useState(true); // F7 ile açma/kapatma
  
  // Ortogonal Mod (AutoCAD F8 / ALT tuşu)
  const [isOrthoMode, setIsOrthoMode] = useState(false);
  
  // Seçim State'i
  const [selectedEntities, setSelectedEntities] = useState(new Set()); 
  const [selectionStart, setSelectionStart] = useState(null); 
  const [selectionRect, setSelectionRect] = useState(null); 
  const [isSelectionDragging, setIsSelectionDragging] = useState(false);
  const [selectionMode, setSelectionMode] = useState(null); 
  
  // Undo/Redo State'i (Faz 1.3)
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1); 
  
  // Gemini State
  const [analysisReport, setAnalysisReport] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [layerSuggestions, setLayerSuggestions] = useState(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalContent, setModalContent] = useState('');

  // --- KOORDİNAT DÖNÜŞÜMLERİ ---
  const toScreenX = (worldX) => (worldX * scale) + offset.x;
  const toScreenY = (worldY) => (-worldY * scale) + offset.y; // Y flip

  // DÜNYA KOORDİNATLARINA DÖNÜŞÜM 
  const toWorldX = (screenX) => (screenX - offset.x) / scale;
  const toWorldY = (screenY) => -(screenY - offset.y) / scale;
  
  // Ortogonal koordinat hesaplama (AutoCAD F8 modu)
  const applyOrthoMode = useCallback((currentX, currentY, baseX, baseY) => {
    if (!isOrthoMode) return { x: currentX, y: currentY };
    
    const dx = Math.abs(currentX - baseX);
    const dy = Math.abs(currentY - baseY);
    
    // Yatay mı dikey mi daha yakın?
    if (dx > dy) {
      // Yatay kilitle
      return { x: currentX, y: baseY };
    } else {
      // Dikey kilitle
      return { x: baseX, y: currentY };
    }
  }, [isOrthoMode]);
  
  // Mesafe hesaplayıcı (Piksel cinsinden)
  const distanceSq = (x1, y1, x2, y2) => (x1 - x2) ** 2 + (y1 - y2) ** 2;

  // --- KOMUT YÖNETİMİ (Faz 1.3) ---
  const executeCommand = useCallback((command) => {
      // 1. İlerideki (Redo) komutları sil (Yeni komut geldiği için)
      const newHistory = history.slice(0, historyIndex + 1);
      
      // 2. Komutu yürüt
      try {
          command.execute();
      } catch (error) {
          console.error("Komut yürütülürken hata oluştu:", error);
          return;
      }
      
      // 3. Yığına ekle ve index'i güncelle
      newHistory.push(command);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);
  
  const handleUndo = useCallback(() => {
      if (historyIndex < 0) return;
      
      const command = history[historyIndex];
      try {
          command.undo();
      } catch (error) {
          console.error("Geri alma işlemi sırasında hata oluştu:", error);
          return;
      }
      
      setHistoryIndex(prev => prev - 1);
      setSelectedEntities(new Set()); // İşlem sonrası seçimi temizle
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
      if (historyIndex >= history.length - 1) return;
      
      const command = history[historyIndex + 1];
      try {
          command.execute();
      } catch (error) {
          console.error("Yineleme işlemi sırasında hata oluştu:", error);
          return;
      }
      
      setHistoryIndex(prev => prev + 1);
      setSelectedEntities(new Set()); // İşlem sonrası seçimi temizle
  }, [history, historyIndex]);

  // --- SNAP NOKTASI HESAPLAMA (Faz 1.1) ---
  const getAllSnapPoints = useCallback(() => {
    const points = [];
    
    // Polyline çizimi devam ederken kendi noktalarını da yakalamalı
    const allEntities = [...entities];
    if (currentPolyline.length > 0) {
        // Geçici polyline'ı entity olarak ekleyelim ki kendi noktalarını yakalasın
        allEntities.push({ type: 'LWPOLYLINE', vertices: currentPolyline });
    }
    
    allEntities.forEach((ent) => {
      // 1. LINE ve LWPOLYLINE uç noktaları ve orta noktaları
      if (ent.type === 'LINE' || ent.type === 'RECTANGLE') {
        const x1 = ent.type === 'LINE' ? ent.x1 : ent.x1;
        const y1 = ent.type === 'LINE' ? ent.y1 : ent.y1;
        const x2 = ent.type === 'LINE' ? ent.x2 : ent.x2;
        const y2 = ent.type === 'LINE' ? ent.y2 : ent.y2;
        
        // Endpoint 1 (Start point of Line/Rectangle corner 1)
        points.push({ x: x1, y: y1, type: 'Endpoint' });
        // Endpoint 2 (End point of Line/Rectangle corner 2)
        points.push({ x: x2, y: y2, type: 'Endpoint' });
        
        // Dikdörtgenin diğer 2 köşesini de ekleyelim
        if (ent.type === 'RECTANGLE') {
             points.push({ x: x1, y: y2, type: 'Endpoint' });
             points.push({ x: x2, y: y1, type: 'Endpoint' });
        }
        
        // Midpoint (Sadece temel LINE için, Dikdörtgen için segmentler gerek)
        if (ent.type === 'LINE') {
            points.push({ 
              x: (x1 + x2) / 2, 
              y: (y1 + y2) / 2, 
              type: 'Midpoint' 
            });
        }
      }
      else if (ent.type === 'LWPOLYLINE' && ent.vertices.length > 0) {
        for (let i = 0; i < ent.vertices.length; i++) {
          const p1 = ent.vertices[i];
          const nextIndex = (i + 1) % ent.vertices.length;
          const p2 = ent.vertices[nextIndex];
          
          // Endpoint (Her vertex aynı zamanda bir segmentin uç noktasıdır)
          points.push({ x: p1.x, y: p1.y, type: 'Endpoint' });
          
          // Midpoint (Sadece mevcut segmentler için)
          if (i < ent.vertices.length - 1 || ent.closed) {
             points.push({ 
               x: (p1.x + p2.x) / 2, 
               y: (p1.y + p2.y) / 2, 
               type: 'Midpoint' 
             });
          }
        }
      }
      // 2. CIRCLE ve ARC merkezleri
      else if (ent.type === 'CIRCLE' || ent.type === 'ARC') {
        points.push({ x: ent.x, y: ent.y, type: 'Center' });
      }
    });

    return points;
  }, [entities, currentPolyline]); 

  // --- GEMINI API HELPERS (Değişmedi) ---
  const callGeminiApi = useCallback(async (prompt, systemPrompt, jsonSchema = null) => {
    let retries = 0;
    const maxRetries = 3;
    let delay = 1000;
    
    // Exponential backoff ile retry mekanizması
    while (retries < maxRetries) {
      try {
        const payload = {
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ google_search: {} }],
        };
        
        let headers = { 'Content-Type': 'application/json' };

        if (jsonSchema) {
          payload.generationConfig = {
            responseMimeType: "application/json",
            responseSchema: jsonSchema
          };
        }

        const response = await fetch(API_URL_GEMINI + API_KEY, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`API call failed: ${response.statusText}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (jsonSchema) {
            // JSON parse etmeyi dene
            return JSON.parse(text);
        }

        return text;

      } catch (error) {
        console.error(`Attempt ${retries + 1} failed:`, error);
        retries++;
        if (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // Gecikmeyi iki katına çıkar
        } else {
          throw new Error("Tüm yeniden denemeler başarısız oldu.");
        }
      }
    }
  }, []);
  
  // Modal kapatma fonksiyonu
  const closeModal = () => {
    setShowModal(false);
    setModalTitle('');
    setModalContent('');
  };

  // --- EKRANA SIĞDIRMA (FIT TO SCREEN) (Değişmedi) ---
  const fitToScreen = (currentEntities = entities) => {
    if (currentEntities.length === 0) return;

    const bounds = calculateExtents(currentEntities);
    setExtents(bounds);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    
    const padding = 0.9;
    
    const scaleX = w / bounds.width;
    const scaleY = h / bounds.height;
    const newScale = Math.min(scaleX, scaleY) * padding;
    
    const centerX = bounds.minX + bounds.width / 2;
    const centerY = bounds.minY + bounds.height / 2;
    
    // Y koordinatını ters çevirerek merkezleme yap
    const newOffsetX = (w / 2) - (centerX * newScale);
    const newOffsetY = (h / 2) - (-centerY * newScale);

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  // --- DOSYA YÜKLEME HANDLER ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.split('.').pop();

    // DWG dosyası kontrolü
    if (fileExtension === 'dwg') {
      setModalTitle("DWG Formatı Desteklenmiyor");
      setModalContent(
        "DWG dosyaları ikili (binary) formatta olduğu için doğrudan açılamaz.\n\n" +
        "Çözüm önerileri:\n" +
        "• AutoCAD veya benzeri bir programda dosyayı DXF formatına çevirin\n" +
        "• Online DWG to DXF dönüştürücü kullanın (örn: convertio.co, cloudconvert.com)\n" +
        "• LibreCAD gibi ücretsiz bir yazılımla DXF'e kaydedin\n\n" +
        "DXF formatındaki dosyayı yükleyebilirsiniz."
      );
      setShowModal(true);
      return;
    }

    // DXF dosyası işleme
    if (fileExtension !== 'dxf') {
      setModalTitle("Desteklenmeyen Format");
      setModalContent(`"${fileExtension}" formatı desteklenmiyor. Lütfen .dxf uzantılı bir dosya yükleyin.`);
      setShowModal(true);
      return;
    }

    // Türkçe karakter düzeltme fonksiyonu (Windows-1254 → UTF-8)
    const fixTurkishChars = (text) => {
      // DXF dosyalarında sık görülen Türkçe karakter sorunları
      const replacements = {
        '\u0080': 'Ç', '\u0081': 'ü', '\u0082': 'é', '\u0083': 'â',
        '\u0084': 'ä', '\u0085': 'à', '\u0086': 'å', '\u0087': 'ç',
        '\u0088': 'ê', '\u0089': 'ë', '\u008A': 'è', '\u008B': 'ï',
        '\u008C': 'î', '\u008D': 'ı', '\u008E': 'Ä', '\u008F': 'Å',
        '\u0090': 'É', '\u0091': 'æ', '\u0092': 'Æ', '\u0093': 'ô',
        '\u0094': 'ö', '\u0095': 'ò', '\u0096': 'û', '\u0097': 'ù',
        '\u0098': 'ÿ', '\u0099': 'Ö', '\u009A': 'Ü', '\u009B': 'ø',
        '\u009C': '£', '\u009D': 'Ø', '\u009E': 'ş', '\u009F': 'Ş',
        'Ý': 'İ', 'ý': 'ı', 'Þ': 'Ş', 'þ': 'ş', 
        'Ð': 'Ğ', 'ð': 'ğ', 'Ü': 'Ü', 'ü': 'ü',
        '\u00D0': 'Ğ', '\u00F0': 'ğ', '\u00DD': 'İ', '\u00FD': 'ı',
        '\u00DE': 'Ş', '\u00FE': 'ş',
      };
      
      let result = text;
      for (const [from, to] of Object.entries(replacements)) {
        result = result.split(from).join(to);
      }
      return result;
    };

    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target.result;
      
      // Türkçe karakter düzeltmesi uygula
      text = fixTurkishChars(text);
      
      console.log('Dosya okundu, boyut:', text.length, 'karakter');
      
      try {
        const parsedEntities = parseDxfSimple(text);
        console.log('Parse edildi, entity sayısı:', parsedEntities.length);
        
        // Debug: Entity tiplerini say
        const typeCounts = {};
        parsedEntities.forEach(ent => {
          typeCounts[ent.type] = (typeCounts[ent.type] || 0) + 1;
        });
        console.log('Entity tipleri:', typeCounts);
        
        // Debug: İlk 5 LINE entity'sini göster
        const lineEntities = parsedEntities.filter(e => e.type === 'LINE').slice(0, 5);
        console.log('İlk 5 LINE:', lineEntities);
        
        // Debug: İlk 5 LWPOLYLINE entity'sini göster  
        const polyEntities = parsedEntities.filter(e => e.type === 'LWPOLYLINE').slice(0, 5);
        console.log('İlk 5 LWPOLYLINE:', polyEntities);
        
        if (parsedEntities.length === 0) {
          setModalTitle("DXF Boş veya Desteklenmeyen");
          setModalContent("Dosya okundu ancak desteklenen entity bulunamadı (LINE, CIRCLE, ARC, LWPOLYLINE).");
          setShowModal(true);
          return;
        }
        
        // Parser zaten doğrulama yapıyor, ek filtre gerekmez
        const uniqueLayers = new Set(parsedEntities.map(e => e.layer || '0'));
        
        setEntities(parsedEntities);
        setLayers(uniqueLayers);
        
        // Yükleme bilgisi
        console.log(`DXF yüklendi: ${parsedEntities.length} entity, ${uniqueLayers.size} katman`);
        
        // Önceki analiz ve önerileri temizle
        setAnalysisReport(null);
        setLayerSuggestions(null);
        closeModal();
        
        // Seçimi temizle
        setSelectedEntities(new Set());
        
        // History'yi temizle (Yeni bir dosya yüklenince geri alma yapılamaz)
        setHistory([]);
        setHistoryIndex(-1);
        
        // Yükleme sonrası hemen fit et
        setTimeout(() => fitToScreen(parsedEntities), 100);
        
      } catch (err) {
        setModalTitle("DXF Parse Hatası");
        setModalContent(`Dosya ayrıştırılırken bir hata oluştu. Dosya formatı desteklenmiyor olabilir. Detay: ${err.message}`);
        setShowModal(true);
        console.error(err);
      }
    };
    
    // Önce Windows-1254 (Türkçe) encoding ile okumayı dene
    reader.readAsText(file, 'windows-1254');
  };

  // --- ÇİZİM İŞLEMLERİ (Faz 2.1) ---
  
  // Polyline çizimini bitir
  const finishPolyline = () => {
    if (currentPolyline.length < 2) {
      setCurrentPolyline([]);
      setActiveTool('select');
      setActiveSnap(null);
      return;
    }

    const newPolyline = {
      type: 'LWPOLYLINE',
      layer: '0', 
      id: crypto.randomUUID(),
      vertices: currentPolyline.map(p => ({ x: p.x, y: p.y })), 
      closed: false,
    };

    const command = new AddEntityCommand(newPolyline, setEntities, setLayers);
    executeCommand(command);

    setCurrentPolyline([]);
    setActiveTool('select');
    setActiveSnap(null);
  };
  
  // Aktif çizimi (circle, rectangle, polyline) iptal et
  const cancelActiveDrawing = useCallback(() => {
    setCurrentDrawingState(null);
    setCurrentPolyline([]);
    setActiveTool('select');
    setActiveSnap(null);
  }, []);
  
  // Tek tıklama ile çizim başlangıcını ayarla
  const startDrawing = (type, worldX, worldY) => {
    // Snap varsa snap noktasını kullan
    const startX = activeSnap ? activeSnap.x : worldX;
    const startY = activeSnap ? activeSnap.y : worldY;
    
    setCurrentDrawingState({ 
        type: type, 
        startX: startX, 
        startY: startY 
    });
    
    // Polyline için ilk noktayı da hemen ekle
    if (type === 'polyline') {
        setCurrentPolyline([{ x: startX, y: startY }]);
    }
  };
  
  // Çift tıklama ile çizimi sonlandır
  const handleDoubleClick = (e) => {
    if (activeTool === 'polyline' && currentPolyline.length >= 2) {
      finishPolyline();
    } else if (activeTool === 'polyline') {
      // Yetersiz nokta varsa çizimi iptal et
      cancelActiveDrawing();
    }
  }

  // --- SEÇİM HESAPLAMA (Faz 1.2) ---
  const calculateSelection = useCallback((finalRect, mode) => {
    const canvas = canvasRef.current;
    if (!canvas || !finalRect) return;

    // 1. Ekran koordinatlarını Dünya Koordinatlarına dönüştür
    const wMinX = toWorldX(Math.min(finalRect.x, finalRect.x + finalRect.w));
    const wMaxX = toWorldX(Math.max(finalRect.x, finalRect.x + finalRect.w));
    const wMaxY = toWorldY(Math.min(finalRect.y, finalRect.y + finalRect.h)); // Y ters
    const wMinY = toWorldY(Math.max(finalRect.y, finalRect.y + finalRect.h)); // Y ters

    const worldRect = { wMinX, wMinY, wMaxX, wMaxY };
    
    // 2. Çarpışma Testi
    const newSelectedIds = new Set();
    
    entities.forEach(entity => {
      // Gizli katmanlardaki nesneleri seçme
      if (hiddenLayers.has(entity.layer)) return; 
      
      if (checkCollision(entity, worldRect, mode)) {
        newSelectedIds.add(entity.id);
      }
    });
    
    setSelectedEntities(newSelectedIds);
  }, [entities, hiddenLayers, toWorldX, toWorldY]);


  // --- CANVAS RENDER MOTORU ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Canvas boyutlarını responsive yap
    const setCanvasSize = () => {
        canvas.width = window.innerWidth;
        // Sidebar açıksa yüksekliği ayarla
        if (sidebarOpen) {
            canvas.height = window.innerHeight;
            canvas.width = window.innerWidth - (window.innerWidth >= 640 ? 64 + 256 : 64); // Toolbar + Sidebar
        } else {
            canvas.height = window.innerHeight;
            canvas.width = window.innerWidth - 64; // Sadece Toolbar
        }
        
    };
    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);

    const ctx = canvas.getContext('2d');
    
    // 1. Temizle
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawGrid = (ctx, w, h, sc, off) => {
        // F7 ile grid açma/kapatma kontrolü
        if (!gridVisible) return;
        
        ctx.strokeStyle = '#3a3a3a';
        ctx.lineWidth = 0.5;
        
        let gridSize = 50 * sc;
        while(gridSize < 20) gridSize *= 2;
        while(gridSize > 100) gridSize /= 2;

        const startX = off.x % gridSize;
        const startY = off.y % gridSize;
        
        ctx.beginPath();
        for(let x = startX; x < w; x+= gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
        for(let y = startY; y < h; y+= gridSize) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
        ctx.stroke();
        
        // Origin Crosshair (0,0 noktası) - Daha büyük ve belirgin
        const originX = off.x;
        const originY = off.y;
        ctx.strokeStyle = '#ef4444'; // Parlak kırmızı eksen
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(originX - 20, originY); ctx.lineTo(originX + 20, originY);
        ctx.moveTo(originX, originY - 20); ctx.lineTo(originX, originY + 20);
        ctx.stroke();
    };

    // 2. Grid
    drawGrid(ctx, canvas.width, canvas.height, scale, offset);

    // 3. Render Entities (Canvas sınırları içinde)
    // Canvas sınırlarını ayarla
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth, canvasHeight);
    ctx.clip(); // Canvas dışına çizim yapma
    
    const renderEntity = (entity, isSelected = false) => {
      if (hiddenLayers.has(entity.layer)) return;
      
      ctx.beginPath();
      
      // Seçili nesneler için daha belirgin görünüm
      if (isSelected) {
        ctx.strokeStyle = '#fbbf24'; // Sarı (parlak)
        ctx.lineWidth = Math.max(3 / scale, 2);
        // Shadow efektini kapat
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = Math.max(1 / scale, 1);
        ctx.shadowBlur = 0;
        
        // Katmana göre renk ayarı
        if (entity.layer === 'DUVAR' || entity.layer.includes('WALL')) {
          ctx.strokeStyle = '#fca5a5';
        } else if (entity.type === 'ARC' || entity.type === 'CIRCLE' || entity.type === 'RECTANGLE') {
          ctx.strokeStyle = '#60a5fa';
        }
      }
      
      // Çizim geometrisi
      if (entity.type === 'LINE') {
        ctx.moveTo(toScreenX(entity.x1), toScreenY(entity.y1));
        ctx.lineTo(toScreenX(entity.x2), toScreenY(entity.y2));
      } 
      else if (entity.type === 'CIRCLE') {
        ctx.arc(
            toScreenX(entity.x), 
            toScreenY(entity.y), 
            entity.r * scale, 
            0, 2 * Math.PI
        );
      }
      else if (entity.type === 'ARC') {
        const startRad = -(entity.startAngle * Math.PI / 180);
        const endRad = -(entity.endAngle * Math.PI / 180);
        
        ctx.arc(
            toScreenX(entity.x), 
            toScreenY(entity.y), 
            entity.r * scale, 
            startRad, 
            endRad,
            true
        );
      }
      else if (entity.type === 'LWPOLYLINE' && entity.vertices.length > 0) {
        ctx.moveTo(toScreenX(entity.vertices[0].x), toScreenY(entity.vertices[0].y));
        for (let i = 1; i < entity.vertices.length; i++) {
            ctx.lineTo(toScreenX(entity.vertices[i].x), toScreenY(entity.vertices[i].y));
        }
        if (entity.closed) {
            ctx.closePath();
        }
      }
      else if (entity.type === 'RECTANGLE') {
        const screenX1 = toScreenX(entity.x1);
        const screenY1 = toScreenY(entity.y1);
        const screenX2 = toScreenX(entity.x2);
        const screenY2 = toScreenY(entity.y2);
        
        const rectX = Math.min(screenX1, screenX2);
        const rectY = Math.min(screenY1, screenY2);
        const rectW = Math.abs(screenX1 - screenX2);
        const rectH = Math.abs(screenY1 - screenY2);
        
        ctx.rect(rectX, rectY, rectW, rectH);
      }
      else if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
        // Yazı için stroke yerine fill kullanacağız
        const screenX = toScreenX(entity.x);
        const screenY = toScreenY(entity.y);
        const fontSize = entity.height * scale; // Scale ile orantılı
        
        // Çok küçük yazıları çizme (performans için)
        if (fontSize < 1) {
          return;
        }
        
        ctx.save();
        ctx.translate(screenX, screenY);
        if (entity.rotation) {
          ctx.rotate(-entity.rotation * Math.PI / 180);
        }
        
        ctx.font = `${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = isSelected ? '#fbbf24' : '#e0e0e0';
        ctx.textBaseline = 'bottom';
        
        // MTEXT formatlarını temizle (\\P = satır sonu, vb.)
        let displayText = entity.text || '';
        displayText = displayText.replace(/\\P/g, '\n').replace(/\\[^;]+;/g, '');
        
        // Çok satırlı yazı desteği
        const lines = displayText.split('\n');
        lines.forEach((line, idx) => {
          ctx.fillText(line, 0, -idx * fontSize);
        });
        
        ctx.restore();
        
        // TEXT için stroke atla
        return;
      }
      
      ctx.stroke();
      
      // Shadow'u sıfırla
      if (isSelected) {
        ctx.shadowBlur = 0;
      }
    };

    // Tüm nesneleri render et
    entities.forEach(entity => {
      if (!selectedEntities.has(entity.id)) {
        renderEntity(entity, false);
      }
    });
    // Seçili nesneleri en üstte render et (Vurgu)
    entities.forEach(entity => {
      if (selectedEntities.has(entity.id)) {
        renderEntity(entity, true);
      }
    });
    
    ctx.restore(); // Clipping'i kaldır
    
    // 4. Aktif Çizim Önizlemesi (Polyline/Circle/Rectangle)
    if (currentDrawingState) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = Math.max(2 / scale, 2);
        ctx.setLineDash([5 / scale, 5 / scale]);

        const startScreenX = toScreenX(currentDrawingState.startX);
        const startScreenY = toScreenY(currentDrawingState.startY);
        const currentScreenX = toScreenX(mouseWorldPos.x);
        const currentScreenY = toScreenY(mouseWorldPos.y);

        if (currentDrawingState.type === 'polyline' && currentPolyline.length > 0) {
            // Polyline - sadece en az 1 nokta varsa çiz
            ctx.strokeStyle = '#10b981'; // Yeşil
            ctx.beginPath();
            ctx.moveTo(toScreenX(currentPolyline[0].x), toScreenY(currentPolyline[0].y));
            
            for(let i = 1; i < currentPolyline.length; i++) {
                ctx.lineTo(toScreenX(currentPolyline[i].x), toScreenY(currentPolyline[i].y));
            }
            // Son noktadan mouse pozisyonuna preview çizgisi
            ctx.lineTo(currentScreenX, currentScreenY);
            ctx.stroke();
            
            // Polyline noktalarını vurgula
            ctx.fillStyle = '#10b981';
            currentPolyline.forEach(point => {
                ctx.beginPath();
                ctx.arc(toScreenX(point.x), toScreenY(point.y), 5, 0, 2 * Math.PI);
                ctx.fill();
            });
            
        } else if (currentDrawingState.type === 'circle') {
            // Circle (Daire)
            const rWorld = distance(currentDrawingState.startX, currentDrawingState.startY, mouseWorldPos.x, mouseWorldPos.y);
            
            ctx.beginPath();
            ctx.arc(startScreenX, startScreenY, rWorld * scale, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (currentDrawingState.type === 'rectangle') {
            // Rectangle (Dikdörtgen)
            const wScreen = currentScreenX - startScreenX;
            const hScreen = currentScreenY - startScreenY;
            
            ctx.beginPath();
            ctx.rect(startScreenX, startScreenY, wScreen, hScreen);
            ctx.stroke();
        }

        ctx.setLineDash([]);
    }
    
    // 5. Aktif Snap Vurgulama (Faz 1.1)
    if (activeSnap) {
        const sx = toScreenX(activeSnap.x);
        const sy = toScreenY(activeSnap.y);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#facc15'; // Parlak sarı
        
        ctx.beginPath();
        if (activeSnap.type === 'Endpoint') {
            // Endpoint: Kare
            ctx.rect(sx - 7, sy - 7, 14, 14);
        } else if (activeSnap.type === 'Midpoint') {
            // Midpoint: Çember
            ctx.arc(sx, sy, 7, 0, 2 * Math.PI); 
            ctx.fillStyle = '#facc15';
            ctx.fill();
            ctx.stroke();
            return;
        } else if (activeSnap.type === 'Center') {
            // Center: Çember
            ctx.arc(sx, sy, 7, 0, 2 * Math.PI);
        }
        ctx.stroke();
    }
    
    // 6. Seçim Kutusu Çizimi (Faz 1.2) - Canvas sınırları içinde
    if (selectionRect) {
        const { x, y, w, h } = selectionRect;
        
        // Canvas sınırlarını al
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        
        // Seçim kutusunu canvas içinde sınırla
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, canvasWidth, canvasHeight);
        ctx.clip(); // Canvas dışına çizim yapma
        
        // Renge ve Dolguya karar ver (AutoCAD tarzı)
        if (selectionMode === 'window') {
            // Soldan Sağa: Mavi (Window Selection)
            ctx.strokeStyle = '#3b82f6'; 
            ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
            ctx.lineWidth = 1;
            ctx.setLineDash([]); // Solid line
        } else {
            // Sağdan Sola: Yeşil (Crossing Selection)
            ctx.strokeStyle = '#10b981'; 
            ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]); // Kesikli çizgi
        }

        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        
        ctx.restore(); // Clip'i kaldır
    }

    return () => {
        window.removeEventListener('resize', setCanvasSize);
    };

  }, [entities, scale, offset, hiddenLayers, activeTool, currentPolyline, mouseWorldPos, activeSnap, selectedEntities, selectionRect, selectionMode, currentDrawingState, sidebarOpen, gridVisible]);



  // --- MOUSE HANDLERS ---
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const zoomFactor = 1 - e.deltaY * zoomSensitivity;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const newScale = scale * zoomFactor;
    
    if (newScale < 0.001 || newScale > 1000) return;

    const newOffsetX = mouseX - (mouseX - offset.x) * zoomFactor;
    const newOffsetY = mouseY - (mouseY - offset.y) * zoomFactor;

    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  // Mouse/Touch koordinatlarını normalize et
  const getEventCoordinates = (e) => {
    let clientX, clientY;
    
    if (e.touches && e.touches.length > 0) {
      // Touch event
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      // Touch end event
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    return { clientX, clientY };
  };

  const handleMouseDown = (e) => {
    const { clientX, clientY } = getEventCoordinates(e);
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    
    // Dünya koordinatlarını hesapla
    const worldX = toWorldX(screenX);
    const worldY = toWorldY(screenY);
    
    // Sağ tık veya orta tık pan (kaydırma) için
    // Touch event'te button olmadığı için kontrol ekle
    const button = e.button !== undefined ? e.button : 0;
    const isTouchEvent = e.type.startsWith('touch');
    
    if (button === 1 || (activeTool === 'select' && button !== 0 && !isTouchEvent)) {
        setIsDragging(true);
        setLastMousePos({ x: clientX, y: clientY });
        setActiveSnap(null);
        return;
    }
    
    // Sağ tık ile aktif çizimi iptal et (touch'ta yok)
    if (button === 2 && activeTool !== 'select' && !isTouchEvent) {
        e.preventDefault();
        cancelActiveDrawing();
        return;
    }
    
    // Sol tık veya Touch (Ana İşlem)
    if (button === 0 || isTouchEvent) {
        
        // --- ÇİZİM MODLARI ---
        if (['circle', 'rectangle'].includes(activeTool)) {
             // 1. Tıklama (Başlangıç noktası)
             if (!currentDrawingState) {
                 startDrawing(activeTool, worldX, worldY);
             } 
             // 2. Tıklama (Bitirme noktası - Dikdörtgen ve Daire için)
             else {
                 const finalX = activeSnap ? activeSnap.x : worldX;
                 const finalY = activeSnap ? activeSnap.y : worldY;
                 
                 if (currentDrawingState.type === 'rectangle') {
                     // Dikdörtgeni bitir ve komutu yürüt
                     const newRectangle = {
                         type: 'RECTANGLE',
                         layer: '0',
                         id: crypto.randomUUID(),
                         x1: currentDrawingState.startX,
                         y1: currentDrawingState.startY,
                         x2: finalX,
                         y2: finalY,
                     };
                     const command = new AddRectangleCommand(newRectangle, setEntities, setLayers);
                     executeCommand(command);
                 } else if (currentDrawingState.type === 'circle') {
                     // Daireyi bitir ve komutu yürüt
                     const r = distance(currentDrawingState.startX, currentDrawingState.startY, finalX, finalY);
                     
                     if (r > 0) {
                          const newCircle = {
                              type: 'CIRCLE',
                              layer: '0',
                              id: crypto.randomUUID(),
                              x: currentDrawingState.startX,
                              y: currentDrawingState.startY,
                              r: r,
                          };
                          const command = new AddCircleCommand(newCircle, setEntities, setLayers);
                          executeCommand(command);
                     }
                 }
                 
                 // Çizimi bitirdikten sonra aracı temizle ve seçime dön
                 cancelActiveDrawing();
             }
             return;
        } 
        
        // --- POLYLINE DEVAM ETME ---
        else if (activeTool === 'polyline') {
            const startX = activeSnap ? activeSnap.x : worldX;
            const startY = activeSnap ? activeSnap.y : worldY;
            
            if (currentPolyline.length === 0) {
                 startDrawing('polyline', worldX, worldY);
            } else {
                 // Yeni noktayı ekle
                 setCurrentPolyline(prev => [...prev, { x: startX, y: startY }]);
            }
            return;
        }

        // --- SEÇİM MODU ---
        if (activeTool === 'select') {
            // Sol tık ile seçim başlangıcı
            setIsSelectionDragging(true);
            setSelectionStart({ x: screenX, y: screenY });
            setLastMousePos({ x: e.clientX, y: e.clientY });
            
            // Tek tıklama ile seçim temizleme (Sürükleme hemen başlamazsa)
            if (selectedEntities.size > 0 && e.shiftKey === false) {
                 setSelectedEntities(new Set());
            }
        }
    }
  };

  const handleMouseMove = (e) => {
    const { clientX, clientY } = getEventCoordinates(e);
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    
    // Mouse pozisyonunu dünya koordinatlarında kaydet (Aktif çizim için gereklidir)
    let worldX = toWorldX(screenX);
    let worldY = toWorldY(screenY);
    
    // Ortogonal mod aktifse ve çizim yapılıyorsa koordinatları kısıtla
    if (isOrthoMode && (activeTool === 'polyline' || activeTool === 'line')) {
      if (currentPolyline.length > 0) {
        // Son noktaya göre ortogonal kilitle
        const lastPoint = currentPolyline[currentPolyline.length - 1];
        const ortho = applyOrthoMode(worldX, worldY, lastPoint.x, lastPoint.y);
        worldX = ortho.x;
        worldY = ortho.y;
      } else if (currentDrawingState && currentDrawingState.startX !== undefined) {
        // Çizgi başlangıcına göre ortogonal kilitle
        const ortho = applyOrthoMode(worldX, worldY, currentDrawingState.startX, currentDrawingState.startY);
        worldX = ortho.x;
        worldY = ortho.y;
      }
    }
    
    setMouseWorldPos({ x: worldX, y: worldY });

    if (isDragging) {
      // Kaydırma (Pan)
      const dx = clientX - lastMousePos.x;
      const dy = clientY - lastMousePos.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: clientX, y: clientY });
      setActiveSnap(null); 
      setSelectionRect(null); // Kaydırma sırasında seçim kutusunu temizle
      return;
    }
    
    // Seçim Kutusu Çizimi (Faz 1.2)
    if (isSelectionDragging && activeTool === 'select') {
        const startX = selectionStart.x;
        const startY = selectionStart.y;
        
        const currentX = screenX;
        const currentY = screenY;
        
        const w = currentX - startX;
        const h = currentY - startY;
        
        // Seçim Modunu Belirle (Soldan sağa: Window, Sağdan sola: Crossing)
        const mode = w > 0 ? 'window' : 'crossing';
        setSelectionMode(mode);
        
        const currentSelectionRect = {
            x: startX,
            y: startY,
            w: w,
            h: h,
        };
        setSelectionRect(currentSelectionRect);
        
        // Mouse hareket ettikçe anlık seçimi hesapla ve vurgula (Opsiyonel ama iyi UX)
        // Her harekette hesaplama performans düşüklüğüne neden olabilir, isteğe bağlı
        // calculateSelection(currentSelectionRect, mode); 
        return;
    }
    
    // --- SNAP KONTROLÜ (Faz 1.1) ---
    if (['polyline', 'circle', 'rectangle'].includes(activeTool) && snapEnabled) {
      const allSnaps = getAllSnapPoints();
      let closestSnap = null;
      let minDistanceSq = SNAP_TOLERANCE_PX ** 2; // Piksel karesi cinsinden tolerans
      
      for (const snap of allSnaps) {
        const snapScreenX = toScreenX(snap.x);
        const snapScreenY = toScreenY(snap.y);
        
        const distSq = distanceSq(screenX, screenY, snapScreenX, snapScreenY);
        
        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          closestSnap = snap;
        }
      }
      
      setActiveSnap(closestSnap);
    } else {
        setActiveSnap(null);
    }
  };

  const handleMouseUp = (e) => {
      setIsDragging(false);

      if (isSelectionDragging) {
          setIsSelectionDragging(false);
          
          if (selectionRect) {
              // Son seçim işlemini tetikle
              calculateSelection(selectionRect, selectionMode);
          } else if (activeTool === 'select' && e.button === 0) {
              // Tek tıklama durumunda yapılacaklar (şimdilik boş)
          }
          
          // Seçim kutusu görselini temizle
          setSelectionRect(null);
          setSelectionMode(null);
      }
  };

  // --- Layer Management ---
  const toggleLayer = (layerName) => {
    const newHidden = new Set(hiddenLayers);
    if (newHidden.has(layerName)) newHidden.delete(layerName);
    else newHidden.add(layerName);
    setHiddenLayers(newHidden);
  };

  // --- Keyboard Shortcuts (AutoCAD Fonksiyon Tuşları) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      // ALT tuşu - Ortogonal mod (AutoCAD F8 benzeri)
      if (e.key === 'Alt') {
        e.preventDefault();
        setIsOrthoMode(true);
        return;
      }
      
      // ESC tuşu ile aktif çizimi iptal et
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeTool !== 'select' || currentPolyline.length > 0 || currentDrawingState) {
          cancelActiveDrawing();
        }
        return;
      }
      
      // AutoCAD Fonksiyon Tuşları
      switch(e.key) {
        case 'F2':
          e.preventDefault();
          // F2: Komut geçmişi/konsol açma (gelecekte eklenebilir)
          console.log('F2: Komut geçmişi (özellik gelecekte eklenecek)');
          break;
          
        case 'F3':
          e.preventDefault();
          // F3: Snap açma/kapatma
          setSnapEnabled(prev => !prev);
          break;
          
        case 'F7':
          e.preventDefault();
          // F7: Grid açma/kapatma
          setGridVisible(prev => !prev);
          break;
          
        case 'F8':
          e.preventDefault();
          // F8: Ortogonal mod toggle
          setIsOrthoMode(prev => !prev);
          break;
          
        case 'F9':
          e.preventDefault();
          // F9: Snap grid açma/kapatma (şimdilik F3 ile aynı)
          setSnapEnabled(prev => !prev);
          break;
          
        case 'F10':
          e.preventDefault();
          // F10: Polar tracking (gelecekte eklenebilir)
          console.log('F10: Polar tracking (özellik gelecekte eklenecek)');
          break;
          
        case 'F11':
          e.preventDefault();
          // F11: Object snap tracking (gelecekte eklenebilir)
          console.log('F11: Object snap tracking (özellik gelecekte eklenecek)');
          break;
          
        case 'F12':
          e.preventDefault();
          // F12: Dynamic input (gelecekte eklenebilir)
          console.log('F12: Dynamic input (özellik gelecekte eklenecek)');
          break;
      }
      
      // Ctrl/Cmd kısayolları
      if (e.ctrlKey || e.metaKey) {
        switch(e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            handleUndo();
            break;
          case 'y':
            e.preventDefault();
            handleRedo();
            break;
          case 'a':
            e.preventDefault();
            // Ctrl+A: Tümünü seç
            setSelectedEntities(new Set(entities.map(entity => entity.id)));
            setActiveTool('select');
            break;
          case 'd':
            e.preventDefault();
            // Ctrl+D: Seçimi kaldır
            setSelectedEntities(new Set());
            break;
        }
      }
      
      // Del tuşu - Seçili nesneleri sil
      if (e.key === 'Delete' && selectedEntities.size > 0) {
        e.preventDefault();
        const remainingEntities = entities.filter(entity => !selectedEntities.has(entity.id));
        setEntities(remainingEntities);
        setSelectedEntities(new Set());
        addToHistory(remainingEntities);
      }
    };

    const handleKeyUp = (e) => {
      // ALT tuşu bırakıldığında ortogonal modu kapat (sadece ALT basılı tutma modu için)
      // F8 ile açılmışsa kapanmasın
      if (e.key === 'Alt') {
        e.preventDefault();
        // Not: F8 ile toggle edildiğinde ALT bırakınca kapanmamalı
        // Bu yüzden basit bir state kontrolü gerekebilir, şimdilik ALT basılı tutma modu olarak bırakıyoruz
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleUndo, handleRedo, activeTool, currentPolyline, currentDrawingState, cancelActiveDrawing, entities, selectedEntities]);


  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;

  // Canvas cursor hesaplama
  const canvasCursor = useMemo(() => {
    if (activeTool === 'polyline' || activeTool === 'circle' || activeTool === 'rectangle') {
      return 'crosshair';
    }
    if (isDragging) return 'grabbing';
    if (isSelectionDragging) return 'default';
    return 'grab';
  }, [activeTool, isDragging, isSelectionDragging]);

  return (
    <div 
      className="flex flex-col h-screen overflow-hidden font-sans text-gray-200" 
      style={{background: 'linear-gradient(to bottom right, #111827, #111827, #1f2937)'}} 
      onContextMenu={(e) => e.preventDefault()}
    >
      
      {/* HEADER - Sadece mobilde görünür, logo ve menu */}
      <div className="md:hidden flex items-center justify-between px-3 py-2 bg-gray-800/95 backdrop-blur-sm border-b border-gray-700/50 z-30">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg shadow-lg" style={{background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'}}>
            <span className="font-bold text-white text-xs tracking-wider">DXF</span>
          </div>
          <span className="text-xs text-gray-400">E:{entities.length} S:{selectedEntities.size}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom info */}
          <span className="text-xs text-gray-400 bg-gray-700/50 px-2 py-1 rounded">Z:{scale.toFixed(1)}</span>
          {/* Menu butonu */}
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2.5 bg-gray-700/80 rounded-lg text-gray-300 active:bg-gray-600 touch-manipulation"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
      
      {/* ANA İÇERİK - Canvas ve Desktop Toolbar */}
      <div className="flex flex-1 min-h-0 md:flex-row">
        
        {/* TOOLBAR - Masaüstünde solda dikey */}
        <div className="hidden md:flex w-16 bg-gray-800/95 backdrop-blur-sm border-r border-gray-700/50 flex-col items-center py-4 z-20 shadow-xl">
          <div className="mb-6 p-2 rounded-lg shadow-lg transition-all duration-300" style={{background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'}}><span className="font-bold text-white text-xs tracking-wider">DXF</span></div>
        
          {/* Undo / Redo Butonları (Faz 1.3) */}
          <ToolButton 
              icon={CornerUpLeft} 
              title="Geri Al (Ctrl+Z)" 
              onClick={handleUndo} 
              disabled={!canUndo} 
          />
          <ToolButton 
              icon={CornerUpRight} 
              title="Yinele (Ctrl+Y)" 
              onClick={handleRedo} 
              disabled={!canRedo} 
          />
          <div className="h-px w-8 bg-gray-600 my-2"></div>

          <ToolButton icon={MousePointer2} title="Seç/Kaydır" active={activeTool === 'select'} onClick={cancelActiveDrawing} />
          
          {/* Seçili nesneleri sil (Delete tuşu) */}
          <ToolButton 
            icon={Trash2} 
            title={`Seçili Nesneleri Sil (${selectedEntities.size} seçili)`}
            onClick={() => {
              if (selectedEntities.size > 0) {
                const remainingEntities = entities.filter(entity => !selectedEntities.has(entity.id));
                setEntities(remainingEntities);
                setSelectedEntities(new Set());
                addToHistory(remainingEntities);
              }
            }}
            disabled={selectedEntities.size === 0}
          />
          
          <ToolButton icon={Maximize} title="Ekrana Sığdır (Fit to Screen)" onClick={() => fitToScreen()} />
          <ToolButton icon={ZoomIn} title="Yakınlaştır" onClick={() => setScale(s => s * 1.2)} />
          <ToolButton icon={ZoomOut} title="Uzaklaştır" onClick={() => setScale(s => s / 1.2)} />
          <div className="h-px w-8 bg-gray-600 my-2"></div>
        
          {/* Polyline Çizim Aracı (Faz 2.1) */}
          <ToolButton 
              icon={PenTool} 
              title="Polyline Çiz (Sağ Tık İptal, Çift Tık Bitir)" 
              active={activeTool === 'polyline'} 
              onClick={() => { 
                  if (activeTool === 'polyline') {
                      cancelActiveDrawing();
                  } else {
                      setActiveTool('polyline');
                      setCurrentDrawingState(null);
                  }
              }} 
          />
          
          {/* Rectangle Çizim Aracı (Faz 2.1) */}
          <ToolButton 
              icon={Square} 
              title="Dikdörtgen Çiz (2 Tıkla: Başlangıç/Bitiş)" 
              active={activeTool === 'rectangle'} 
              onClick={() => { setActiveTool('rectangle'); setCurrentDrawingState(null); setCurrentPolyline([]); }} 
          />

          {/* Circle Çizim Aracı (Faz 2.1) */}
          <ToolButton 
              icon={Circle} 
              title="Daire Çiz (2 Tıkla: Merkez/Yarıçap)" 
              active={activeTool === 'circle'} 
              onClick={() => { setActiveTool('circle'); setCurrentDrawingState(null); setCurrentPolyline([]); }} 
          />

          {/* Polyline'ı Bitir Butonu */}
          {currentPolyline.length > 0 && activeTool === 'polyline' && (
              <button 
                  title="Çizimi Bitir (Çift Tıklama Veya Bu Buton)"
                  onClick={finishPolyline}
                  className="p-3 rounded-xl text-white animate-pulse shadow-lg touch-manipulation transition-all duration-300 min-w-[44px] min-h-[44px] flex items-center justify-center"
                  style={{background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)', boxShadow: '0 10px 15px -3px rgba(34, 197, 94, 0.3)'}}
              >
                  <PlusCircle size={20} />
              </button>
          )}
          
          <div className="mt-auto flex flex-col gap-2">
               {/* Grid Toggle (F7) */}
               <ToolButton 
                  icon={Grid3x3} 
                  title="Grid Açma/Kapatma (F7)" 
                  active={gridVisible} 
                  onClick={() => setGridVisible(prev => !prev)} 
                />
               
               {/* Snap Toggle (F3/F9) */}
               <ToolButton 
                  icon={Magnet} 
                  title="Snap Açma/Kapatma (F3)" 
                  active={snapEnabled} 
                  onClick={() => setSnapEnabled(prev => !prev)} 
                />
               
               {/* DXF/DWG Dosya Yükleme */}
               <label className="cursor-pointer p-3 rounded-xl text-white flex items-center justify-center touch-manipulation shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl min-w-[44px] min-h-[44px]" style={{background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'}} title="CAD Dosyası Yükle (DXF/DWG)">
                  <Upload size={20} />
                  <input 
                    type="file" 
                    accept=".dxf,.dwg" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                    onClick={(e) => { e.target.value = null; }} 
                  />
               </label>
          </div>
        </div>

      {/* CANVAS */}
      <div 
        className="flex-1 relative overflow-hidden min-h-0 canvas-container" 
        style={{
          background: 'linear-gradient(to bottom right, #030712, #111827, #030712)',
          cursor: canvasCursor
        }}
      >
        {/* Desktop info bar */}
        <div className="hidden md:block absolute top-4 left-4 bg-gray-800/90 backdrop-blur-md px-4 py-2 rounded-lg border border-gray-700/50 text-xs text-gray-300 pointer-events-none select-none z-10 shadow-xl">
          <span>Ent: {entities.length + (currentPolyline.length > 0 ? 1 : 0)} | Seçili: {selectedEntities.size} | Zoom: {scale.toExponential(2)} | World X: {mouseWorldPos.x.toFixed(2)} Y: {mouseWorldPos.y.toFixed(2)}</span>
          {!gridVisible && <span className="ml-3 font-semibold text-gray-500">| GRID:OFF</span>}
          {!snapEnabled && <span className="ml-3 font-semibold text-gray-500">| SNAP:OFF</span>}
          {activeSnap && snapEnabled && <span className="text-yellow-400 ml-3 font-semibold">| {activeSnap.type}</span>}
          {isOrthoMode && <span className="ml-3 font-bold text-cyan-400 animate-pulse">| ORTHO</span>}
          {selectionMode && <span className={`ml-3 font-semibold ${selectionMode === 'window' ? 'text-blue-400' : 'text-green-400'}`}>| {selectionMode === 'window' ? 'W' : 'C'}</span>}
          {currentDrawingState && <span className="ml-3 font-semibold text-red-400">| {currentDrawingState.type.toUpperCase()}</span>}
          {(currentPolyline.length > 0 || currentDrawingState) && <span className="ml-3 text-orange-400 animate-pulse">| ESC: İptal</span>}
        </div>
        
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setIsDragging(false); setIsSelectionDragging(false); setSelectionRect(null); setSelectionMode(null); }}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          className="w-full h-full block touch-none"
        />
      </div>

      {/* SIDEBAR - Mobilde slide-in panel, masaüstünde normal */}
      {sidebarOpen && (
        <>
          {/* Mobilde arkaplan overlay */}
          <div 
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed md:relative inset-y-0 right-0 w-[85%] max-w-[320px] md:w-64 md:max-w-none bg-gray-800/98 backdrop-blur-md border-l border-gray-700/50 flex flex-col z-40 md:z-30 shadow-2xl transform transition-transform duration-300 animate-slide-in-right">
            <div className="p-4 border-b border-gray-700/50 flex justify-between items-center" style={{background: 'linear-gradient(90deg, rgba(51, 65, 85, 0.5) 0%, rgba(55, 65, 81, 0.3) 100%)'}}>
              <h2 className="font-semibold text-sm" style={{background: 'linear-gradient(90deg, #60a5fa 0%, #22d3ee 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>PROJE YÖNETİCİSİ</h2>
              <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-gray-700 active:bg-gray-600 rounded-lg touch-manipulation"><X size={22} /></button>
            </div>
          <div className="p-4 overflow-y-auto flex-1">
            {/* GEMINI ÖZELLİKLERİ */}
            <div className="mb-6 border-b border-gray-700 pb-4">
                <div className="flex items-center gap-2 mb-3"><Sparkles size={16} className="text-pink-400 animate-pulse" /><h3 className="text-sm font-medium" style={{background: 'linear-gradient(90deg, #f472b6 0%, #a855f7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>AI Analiz Araçları</h3></div>
                <button 
                    onClick={async () => {
                      if (entities.length === 0) {
                          setModalTitle("Hata");
                          setModalContent("Lütfen önce bir DXF dosyası yükleyin.");
                          setShowModal(true);
                          return;
                      }
                      
                      setIsAnalyzing(true);
                      setAnalysisReport(null);
                      setModalTitle("✨ Yapı Analizi Raporu");
                      setModalContent(
                          <div className="flex items-center justify-center py-8">
                              <RefreshCw className="animate-spin mr-3 text-blue-400" size={24} />
                              <span className="text-gray-300">DXF verileri analiz ediliyor...</span>
                          </div>
                      );
                      setShowModal(true);
                      
                      const summary = entities.slice(0, 100).map(e => {
                          if (e.type === 'LINE' || e.type === 'LWPOLYLINE' || e.type === 'RECTANGLE') {
                              return `${e.type} (Layer: ${e.layer}, VtxCount: ${e.vertices?.length || (e.type === 'LINE' ? 2 : 4)})`;
                          } else if (e.type === 'CIRCLE' || e.type === 'ARC') {
                              return `${e.type} (Layer: ${e.layer}, R: ${e.r.toFixed(2)})`;
                          }
                          return `${e.type} (Layer: ${e.layer})`;
                      }).join('; ');
                      
                      const layerList = Array.from(layers).join(', ');

                      const prompt = `Ben bir DXF (CAD) dosyasını inceleyen bir mühendisim. Dosya, bir mimari çizim (bina kat planı) içeriyor. Sadece ilk 100 geometrik nesnenin özeti şöyledir: [${summary}]. Tüm katmanlar ise şunlardır: [${layerList}]. Bu özet ve katman listesine dayanarak:
                      1. Bu çizimin mimari mi, mekanik mi yoksa elektrik çizimi mi olduğunu tahmin et.
                      2. Çizimde olası eksik veya standart dışı geometriler (örneğin kapı/pencere işaretleri) hakkında yorum yap.
                      3. Analizini 2-3 paragraf halinde, teknik ama anlaşılır bir dille özetle.`;

                      const systemPrompt = "Sen, bir CAD dosyasını inceleyen, uzman ve kritik bir gözle analiz sunan bir yapay zeka mühendisisin. Yanıtını sadece Türkçe ve Markdown formatında, açıklayıcı bir başlık ile vermelisin.";

                      try {
                          const report = await callGeminiApi(prompt, systemPrompt);
                          setAnalysisReport(report);
                          setModalContent(
                              <div className="p-4 bg-gray-700/50 rounded-lg max-h-96 overflow-y-auto whitespace-pre-wrap">
                                  {report}
                              </div>
                          );
                      } catch (error) {
                          setModalContent(<p className="text-red-400">Analiz sırasında bir hata oluştu: {error.message}</p>);
                          console.error(error);
                      } finally {
                          setIsAnalyzing(false);
                      }
                  }} 
                    disabled={isAnalyzing || entities.length === 0}
                    className="w-full flex items-center justify-center text-white text-xs py-2.5 md:py-2 px-3 md:px-4 rounded-lg mb-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 touch-manipulation shadow-lg"
                    style={{background: 'linear-gradient(90deg, #9333ea 0%, #ec4899 100%)'}}
                >
                    {isAnalyzing ? (
                        <RefreshCw className="animate-spin mr-2" size={14} />
                    ) : (
                        <Sparkles size={14} className="mr-2" />
                    )}
                    Yapı Analizi Yap
                </button>
                <button 
                    onClick={async () => {
                      if (layers.size <= 1) {
                          setModalTitle("Hata");
                          setModalContent("Katman önerisi için yeterli katman bulunamadı.");
                          setShowModal(true);
                          return;
                      }
                      
                      setIsSuggesting(true);
                      setLayerSuggestions(null);
                      setModalTitle("✨ Katman İsimlendirme Önerileri");
                      setModalContent(
                          <div className="flex items-center justify-center py-8">
                              <RefreshCw className="animate-spin mr-3 text-blue-400" size={24} />
                              <span className="text-gray-300">Standart isimler (AIA, ISO) aranıyor...</span>
                          </div>
                      );
                      setShowModal(true);
                      
                      const layerList = Array.from(layers).join(', ');

                      const prompt = `Aşağıdaki CAD katman isimlerini incele: [${layerList}]. Bu katmanları endüstri standardı (örneğin AIA veya ISO) mimari çizim standartlarına göre daha anlamlı, kısa ve büyük harfli yeni isimlerle eşleştir. Cevabını SADECE bir JSON dizisi olarak döndür.`;
                      
                      // JSON Şema Tanımı
                      const layerSchema = {
                          type: "ARRAY",
                          items: {
                              type: "OBJECT",
                              properties: {
                                  currentName: { type: "STRING", description: "Mevcut katman ismi." },
                                  suggestedName: { type: "STRING", description: "Önerilen endüstri standardı ismi. Örneğin 'A-WALL' veya 'A-DOOR'." },
                                  reason: { type: "STRING", description: "Neden bu ismin önerildiğine dair kısa açıklama." }
                              },
                              required: ["currentName", "suggestedName", "reason"]
                          }
                      };

                      const systemPrompt = "Sen, CAD standartları konusunda uzmanlaşmış bir isimlendirme botusun. Sadece talep edilen JSON formatını kesinlikle üret.";

                      try {
                          const suggestions = await callGeminiApi(prompt, systemPrompt, layerSchema);
                          setLayerSuggestions(suggestions);
                          
                          setModalContent(
                              <div className="p-4 max-h-[70vh] overflow-y-auto">
                                  <p className="mb-4 text-sm text-gray-400">Aşağıdaki tabloda mevcut katman isimleriniz ve endüstri standardına uygun öneriler yer almaktadır. Uygulamak istediğiniz katmanları seçin.</p>
                                  {suggestions && (
                                      <table className="min-w-full divide-y divide-gray-600">
                                          <thead className="bg-gray-700/50 sticky top-0">
                                              <tr>
                                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Mevcut İsim</th>
                                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Önerilen İsim</th>
                                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Açıklama</th>
                                              </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-700">
                                              {suggestions.map((item, index) => (
                                                  <tr key={index} className="hover:bg-gray-700 transition-colors duration-150">
                                                      <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-300">{item.currentName}</td>
                                                      <td className="px-3 py-2 whitespace-nowrap text-sm text-blue-300 font-mono">{item.suggestedName}</td>
                                                      <td className="px-3 py-2 text-sm text-gray-400">{item.reason}</td>
                                                  </tr>
                                              ))}
                                          </tbody>
                                      </table>
                                  )}
                              </div>
                          );

                      } catch (error) {
                          setModalContent(<p className="text-red-400">Öneri alınırken bir hata oluştu: {error.message}</p>);
                          console.error(error);
                      } finally {
                          setIsSuggesting(false);
                      }
                  }} 
                    disabled={isSuggesting || layers.size <= 1}
                    className="w-full flex items-center justify-center text-white text-xs py-2.5 md:py-2 px-3 md:px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 touch-manipulation shadow-lg"
                    style={{background: 'linear-gradient(90deg, #4f46e5 0%, #3b82f6 100%)'}}
                >
                    {isSuggesting ? (
                        <RefreshCw className="animate-spin mr-2" size={14} />
                    ) : (
                        <Pencil size={14} className="mr-2" />
                    )}
                    Katman İsim Önerisi
                </button>
            </div>
            {/* KATMAN YÖNETİMİ */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3"><Layers size={16} className="text-blue-400" /><h3 className="text-sm font-medium" style={{background: 'linear-gradient(90deg, #60a5fa 0%, #22d3ee 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>Katmanlar ({layers.size})</h3></div>
                <div className="space-y-1.5">
                    {Array.from(layers).map(layer => (
                        <div key={layer} onClick={() => toggleLayer(layer)} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer text-sm transition-all duration-200 touch-manipulation active:scale-95 ${hiddenLayers.has(layer) ? 'opacity-50 grayscale' : 'bg-gray-700/50 hover:bg-gray-600/70 hover:shadow-md'}`}>
                            <div className={`w-3 h-3 rounded-full ${hiddenLayers.has(layer) ? 'bg-gray-500' : 'bg-green-500'}`}></div>
                            <span className="truncate">{layer}</span>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* SEÇİLİ NESNE BİLGİSİ */}
            <div className="border-t border-gray-700/50 pt-4 mb-6">
                <div className="flex items-center gap-2 mb-3"><MousePointer2 size={16} className="text-yellow-400" /><h3 className="text-sm font-medium" style={{background: 'linear-gradient(90deg, #fbbf24 0%, #fb923c 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>Seçili Nesneler</h3></div>
                <p className="text-sm text-gray-300">
                    Toplam <span className="font-semibold text-yellow-400">{selectedEntities.size}</span> nesne seçili.
                    {selectedEntities.size > 0 && <button onClick={() => setSelectedEntities(new Set())} className="ml-2 text-red-400 hover:text-red-300 underline hover:no-underline transition-all touch-manipulation">Seçimi Kaldır</button>}
                </p>
            </div>

            <div className="border-t border-gray-700/50 pt-4">
                <div className="flex items-center gap-2 mb-3"><Save size={16} className="text-blue-400" /><h3 className="text-sm font-medium" style={{background: 'linear-gradient(90deg, #60a5fa 0%, #22d3ee 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>İşlemler</h3></div>
                <button className="w-full text-white text-sm py-3 px-4 rounded-lg touch-manipulation shadow-lg transition-all duration-300 active:scale-95" style={{background: 'linear-gradient(90deg, #2563eb 0%, #06b6d4 100%)'}}>JSON Olarak Aktar</button>
            </div>
          </div>
        </div>
        </>
      )}
      {/* Sidebar kapalıyken açma butonu - sadece desktop */}
      {!sidebarOpen && 
        <button 
          onClick={() => setSidebarOpen(true)} 
          className="hidden md:block fixed md:absolute top-4 right-4 p-2 bg-gray-800/95 backdrop-blur-sm rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white active:bg-gray-600 transition-all duration-300 z-20 shadow-xl hover:shadow-glow border border-gray-700/50 touch-manipulation"
        >
          <Menu size={22} />
        </button>
      }
      
      {/* MOBİL ALT TOOLBAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800/98 backdrop-blur-md border-t border-gray-700/50 px-2 py-2 z-20 safe-area-pb">
        <div className="flex items-center justify-around gap-1">
          {/* Seç */}
          <ToolButton icon={MousePointer2} title="Seç" active={activeTool === 'select'} onClick={cancelActiveDrawing} />
          
          {/* Fit */}
          <ToolButton icon={Maximize} title="Sığdır" onClick={() => fitToScreen()} />
          
          {/* Polyline */}
          <ToolButton 
              icon={PenTool} 
              title="Polyline" 
              active={activeTool === 'polyline'} 
              onClick={() => { 
                  if (activeTool === 'polyline') {
                      cancelActiveDrawing();
                  } else {
                      setActiveTool('polyline');
                      setCurrentDrawingState(null);
                  }
              }} 
          />
          
          {/* Rectangle */}
          <ToolButton 
              icon={Square} 
              title="Dikdörtgen" 
              active={activeTool === 'rectangle'} 
              onClick={() => { setActiveTool('rectangle'); setCurrentDrawingState(null); setCurrentPolyline([]); }} 
          />

          {/* Circle */}
          <ToolButton 
              icon={Circle} 
              title="Daire" 
              active={activeTool === 'circle'} 
              onClick={() => { setActiveTool('circle'); setCurrentDrawingState(null); setCurrentPolyline([]); }} 
          />
          
          {/* Grid */}
          <ToolButton 
            icon={Grid3x3} 
            title="Grid" 
            active={gridVisible} 
            onClick={() => setGridVisible(prev => !prev)} 
          />
          
          {/* Upload */}
          <label className="cursor-pointer p-3 rounded-xl text-white flex items-center justify-center touch-manipulation shadow-lg min-w-[44px] min-h-[44px] active:scale-95" style={{background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'}} title="Dosya Yükle">
            <Upload size={20} />
            <input 
              type="file" 
              accept=".dxf,.dwg" 
              className="hidden" 
              onChange={handleFileUpload} 
              onClick={(e) => { e.target.value = null; }} 
            />
          </label>
        </div>
        
        {/* Polyline bitirme butonu */}
        {currentPolyline.length > 0 && activeTool === 'polyline' && (
          <div className="mt-2 flex justify-center">
            <button 
                title="Çizimi Bitir"
                onClick={finishPolyline}
                className="px-6 py-2.5 rounded-xl text-white animate-pulse shadow-lg touch-manipulation transition-all duration-300 flex items-center gap-2 text-sm font-medium"
                style={{background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)', boxShadow: '0 10px 15px -3px rgba(34, 197, 94, 0.3)'}}
            >
                <PlusCircle size={18} />
                Çizimi Bitir
            </button>
          </div>
        )}
      </div>
      </div>
      
      {/* MODAL KOMPONENTİ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4 animate-fade-in">
          <div className="bg-gray-800/95 backdrop-blur-md border border-gray-700/50 rounded-2xl shadow-2xl w-full max-w-full md:max-w-2xl max-h-[90vh] overflow-hidden transform transition-all duration-300 flex flex-col animate-slide-in">
            <div className="p-3 md:p-4 border-b border-gray-700/50 flex justify-between items-center shrink-0" style={{background: 'linear-gradient(90deg, rgba(51, 65, 85, 0.5) 0%, rgba(55, 65, 81, 0.3) 100%)'}}>
              <h3 className="text-base md:text-lg font-semibold truncate pr-2" style={{background: 'linear-gradient(90deg, #ffffff 0%, #d1d5db 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text'}}>{modalTitle}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white transition-colors p-1 touch-manipulation shrink-0">
                <X size={22} />
              </button>
            </div>
            <div className="p-4 md:p-6 text-gray-300 overflow-y-auto flex-1">
              {modalContent}
            </div>
            <div className="p-3 md:p-4 border-t border-gray-700 text-right shrink-0">
              <button onClick={closeModal} className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-2.5 md:py-2 px-4 md:px-6 rounded-lg transition-colors touch-manipulation text-sm md:text-base">
                Kapat
              </button>
              {/* Önerilen Katmanları Uygula butonu eklenebilir. */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;