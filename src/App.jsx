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
  Circle, // Daire ikonu (Yeni)
  Square, // Dikdörtgen ikonu (Yeni)
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

  // Dxf'den Entity'lerin temel verilerini ayıklar (LINE, CIRCLE, LWPOLYLINE, ARC)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === 'ENTITIES') isEntitySection = true;
    if (line === 'ENDSEC' && isEntitySection) isEntitySection = false;

    if (isEntitySection) {
      if (['LINE', 'CIRCLE', 'LWPOLYLINE', 'ARC'].includes(line)) {
        if (currentEntity) entities.push(currentEntity);
        
        // Benzersiz ID ekleyelim
        currentEntity = { type: line, layer: '0', id: crypto.randomUUID() };
        
        if (line === 'LWPOLYLINE') {
          currentEntity.vertices = [];
          currentEntity.closed = false;
        }
      } 
      else if (currentEntity) {
        const code = parseInt(line, 10);
        const value = lines[i + 1]?.trim();
        
        if (code === 8) currentEntity.layer = value; // Layer Name

        if (currentEntity.type === 'LINE') {
          if (code === 10) currentEntity.x1 = parseFloat(value);
          if (code === 20) currentEntity.y1 = parseFloat(value);
          if (code === 11) currentEntity.x2 = parseFloat(value);
          if (code === 21) currentEntity.y2 = parseFloat(value);
        }
        else if (currentEntity.type === 'CIRCLE') {
          if (code === 10) currentEntity.x = parseFloat(value);
          if (code === 20) currentEntity.y = parseFloat(value);
          if (code === 40) currentEntity.r = parseFloat(value);
        }
        else if (currentEntity.type === 'ARC') {
          if (code === 10) currentEntity.x = parseFloat(value);
          if (code === 20) currentEntity.y = parseFloat(value);
          if (code === 40) currentEntity.r = parseFloat(value);
          if (code === 50) currentEntity.startAngle = parseFloat(value);
          if (code === 51) currentEntity.endAngle = parseFloat(value);
        }
        else if (currentEntity.type === 'LWPOLYLINE') {
          if (code === 70) {
             currentEntity.closed = (parseInt(value) & 1) === 1;
          }
          if (code === 10) {
             currentEntity.vertices.push({ x: parseFloat(value), y: 0 });
          }
          if (code === 20) {
             const lastVertex = currentEntity.vertices[currentEntity.vertices.length - 1];
             if (lastVertex) lastVertex.y = parseFloat(value);
          }
        }
      }
    }
  }
  if (currentEntity) entities.push(currentEntity);
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
    else if (ent.type === 'RECTANGLE') { // Yeni Dikdörtgen tipi
        updateBounds(ent.x1, ent.y1);
        updateBounds(ent.x2, ent.y2);
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
    className={`p-3 rounded-lg transition-all duration-200 mb-2 
      ${active 
        ? 'bg-blue-600 text-white shadow-lg' 
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }
      ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
      `}
  >
    <Icon size={20} />
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
  
  // Mesafe hesaplayıcı (Piksel cinsinden)
  const distanceSq = (x1, y1, x2, y2) => (x1 - x2) ** 2 + (x1 - x2) ** 2;

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

  // --- DOSYA YÜKLEME HANDLER (Değişmedi) ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      try {
        const parsedEntities = parseDxfSimple(text);
        
        const validEntities = parsedEntities.filter(e => {
            if(e.type === 'LWPOLYLINE') return e.vertices.length > 1;
            return true;
        });

        const uniqueLayers = new Set(validEntities.map(e => e.layer || '0'));
        
        setEntities(validEntities);
        setLayers(uniqueLayers);
        
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
        setTimeout(() => fitToScreen(validEntities), 100);
        
      } catch (err) {
        setModalTitle("DXF Parse Hatası");
        setModalContent(`Dosya ayrıştırılırken bir hata oluştu. Dosya formatı desteklenmiyor olabilir. Detay: ${err.message}`);
        setShowModal(true);
        console.error(err);
      }
    };
    reader.readAsText(file);
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

    // 2. Grid
    drawGrid(ctx, canvas.width, canvas.height, scale, offset);

    // 3. Render Entities (Önce seçili olmayanları çiz)
    const renderEntity = (entity, isSelected = false) => {
      if (hiddenLayers.has(entity.layer)) return;
      
      ctx.beginPath();
      ctx.strokeStyle = isSelected ? '#facc15' : '#e0e0e0'; // Seçili ise sarı
      ctx.lineWidth = isSelected ? Math.max(2.5 / scale, 2.5) : Math.max(1 / scale, 1);
      
      // Katmana göre renk ayarı (seçili değilse)
      if (!isSelected) {
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
      else if (entity.type === 'RECTANGLE') { // Dikdörtgen Çizimi
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
      
      ctx.stroke();
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
            // Polyline
            ctx.beginPath();
            ctx.moveTo(toScreenX(currentPolyline[0].x), toScreenY(currentPolyline[0].y));
            
            for(let i = 1; i < currentPolyline.length; i++) {
                ctx.lineTo(toScreenX(currentPolyline[i].x), toScreenY(currentPolyline[i].y));
            }
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
    
    // 6. Seçim Kutusu Çizimi (Faz 1.2)
    if (selectionRect) {
        const { x, y, w, h } = selectionRect;
        
        // Renge ve Dolguya karar ver
        if (selectionMode === 'window') {
            // Soldan Sağa: Mavi (Window Selection)
            ctx.strokeStyle = '#60a5fa'; 
            ctx.fillStyle = 'rgba(96, 165, 250, 0.1)';
            ctx.setLineDash([]); // Kesik çizgiyi kapat
        } else {
            // Sağdan Sola: Yeşil (Crossing Selection)
            ctx.strokeStyle = '#34d399'; 
            ctx.fillStyle = 'rgba(52, 211, 153, 0.1)';
            ctx.setLineDash([4, 4]); // Kesik çizgi yap
        }

        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        
        ctx.setLineDash([]); // Çizgiyi sıfırla
    }

    return () => {
        window.removeEventListener('resize', setCanvasSize);
    };

  }, [entities, scale, offset, hiddenLayers, activeTool, currentPolyline, mouseWorldPos, activeSnap, selectedEntities, selectionRect, selectionMode, currentDrawingState, sidebarOpen]); // sidebarOpen'ı ekledim

  // --- YARDIMCI: GRID (Değişmedi) ---
  const drawGrid = (ctx, w, h, sc, off) => {
    ctx.strokeStyle = '#2a2a2a';
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
    
    // Origin Crosshair (0,0 noktası)
    const originX = off.x;
    const originY = off.y;
    ctx.strokeStyle = '#d32f2f'; // Kırmızı eksen
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(originX - 10, originY); ctx.lineTo(originX + 10, originY);
    ctx.moveTo(originX, originY - 10); ctx.lineTo(originX, originY + 10);
    ctx.stroke();
  };

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

  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // Dünya koordinatlarını hesapla
    const worldX = toWorldX(screenX);
    const worldY = toWorldY(screenY);
    
    // Sağ tık veya orta tık pan (kaydırma) için
    if (e.button === 1 || (activeTool === 'select' && e.button !== 0)) {
        setIsDragging(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });
        setActiveSnap(null);
        return;
    }
    
    // Sağ tık ile aktif çizimi iptal et
    if (e.button === 2 && activeTool !== 'select') {
        e.preventDefault();
        cancelActiveDrawing();
        return;
    }
    
    // Sol tık (Ana İşlem)
    if (e.button === 0) {
        
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
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // Mouse pozisyonunu dünya koordinatlarında kaydet (Aktif çizim için gereklidir)
    const worldX = toWorldX(screenX);
    const worldY = toWorldY(screenY);
    setMouseWorldPos({ x: worldX, y: worldY });

    if (isDragging) {
      // Kaydırma (Pan)
      const dx = e.clientX - lastMousePos.x;
      const dy = e.clientY - lastMousePos.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastMousePos({ x: e.clientX, y: e.clientY });
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
    if (['polyline', 'circle', 'rectangle'].includes(activeTool)) {
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
  }

  // --- Layer Management ---
  const toggleLayer = (layerName) => {
    const newHidden = new Set(hiddenLayers);
    if (newHidden.has(layerName)) newHidden.delete(layerName);
    else newHidden.add(layerName);
    setHiddenLayers(newHidden);
  };

  // --- Keyboard Shortcuts (Ctrl+Z / Ctrl+Y) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) { // Ctrl veya Cmd
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          handleUndo();
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);


  const canUndo = historyIndex >= 0;
  const canRedo = historyIndex < history.length - 1;


  return (
    <div className="flex h-screen bg-gray-900 overflow-hidden font-sans text-gray-200" onContextMenu={(e) => e.preventDefault()}>
      
      {/* TOOLBAR */}
      <div className="w-16 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-4 z-10">
        <div className="mb-6 bg-blue-600 p-2 rounded-lg"><span className="font-bold text-white text-xs">DXF</span></div>
        
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
                // Eğer polyline zaten aktifse, iptal et
                if (activeTool === 'polyline') {
                    cancelActiveDrawing();
                } else {
                    setActiveTool('polyline');
                    setCurrentDrawingState(null); // İlk tıklama handleMouseDown'da yapılacak
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
                className="p-2 mt-1 rounded-lg bg-green-600 hover:bg-green-700 text-white animate-pulse"
            >
                <PlusCircle size={20} />
            </button>
        )}
        
        <div className="mt-auto">
             <label className="cursor-pointer p-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white block mb-2" title="DXF Yükle">
                <Upload size={20} />
                <input type="file" accept=".dxf" className="hidden" onChange={handleFileUpload} />
             </label>
        </div>
      </div>

      {/* CANVAS */}
      <div 
        className="flex-1 relative bg-[#1a1a1a] overflow-hidden" 
        style={{ cursor: 
            activeTool === 'polyline' || activeTool === 'circle' || activeTool === 'rectangle' ? (activeSnap ? 'crosshair' : 'crosshair') : 
            (isDragging ? 'grabbing' : (isSelectionDragging ? (selectionMode === 'window' ? 'default' : 'default') : 'grab')) 
        }}
      >
        <div className="absolute top-4 left-4 bg-gray-800/80 px-4 py-2 rounded text-xs text-gray-400 pointer-events-none select-none z-10">
          Ent: {entities.length + (currentPolyline.length > 0 ? 1 : 0)} | Seçili: {selectedEntities.size} | Zoom: {scale.toExponential(2)} | World X: {mouseWorldPos.x.toFixed(2)} Y: {mouseWorldPos.y.toFixed(2)}
          {activeSnap && <span className="text-yellow-400 ml-3 font-semibold">| Snap: {activeSnap.type}</span>}
          {selectionMode && <span className={`ml-3 font-semibold ${selectionMode === 'window' ? 'text-blue-400' : 'text-green-400'}`}>| Mod: {selectionMode === 'window' ? 'Window (Tamamı)' : 'Crossing (Kesişim)'}</span>}
          {currentDrawingState && <span className="ml-3 font-semibold text-red-400">| Çizim: {currentDrawingState.type.toUpperCase()}</span>}
        </div>
        
        <canvas
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setIsDragging(false); setIsSelectionDragging(false); setSelectionRect(null); setSelectionMode(null); }}
          onDoubleClick={handleDoubleClick}
          className="w-full h-full block touch-none"
        />
      </div>

      {/* SIDEBAR */}
      {sidebarOpen && (
        <div className="w-64 bg-gray-800 border-l border-gray-700 flex flex-col z-10 shadow-xl">
          <div className="p-4 border-b border-gray-700 flex justify-between items-center">
            <h2 className="font-semibold text-sm text-gray-400">PROJE YÖNETİCİSİ</h2>
            <button onClick={() => setSidebarOpen(false)}><X size={16} /></button>
          </div>
          <div className="p-4 overflow-y-auto flex-1">
            {/* GEMINI ÖZELLİKLERİ */}
            <div className="mb-6 border-b border-gray-700 pb-4">
                <div className="flex items-center gap-2 mb-3 text-pink-400"><Sparkles size={16} /><h3 className="text-sm font-medium">AI Analiz Araçları</h3></div>
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
                    className="w-full flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white text-xs py-2 px-4 rounded mb-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                    className="w-full flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                <div className="flex items-center gap-2 mb-3 text-blue-400"><Layers size={16} /><h3 className="text-sm font-medium">Katmanlar ({layers.size})</h3></div>
                <div className="space-y-1">
                    {Array.from(layers).map(layer => (
                        <div key={layer} onClick={() => toggleLayer(layer)} className={`flex items-center gap-3 p-2 rounded cursor-pointer text-xs transition-opacity ${hiddenLayers.has(layer) ? 'opacity-50' : 'bg-gray-700/50 hover:bg-gray-700'}`}>
                            <div className={`w-3 h-3 rounded-full ${hiddenLayers.has(layer) ? 'bg-gray-500' : 'bg-green-500'}`}></div>
                            <span>{layer}</span>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* SEÇİLİ NESNE BİLGİSİ */}
            <div className="border-t border-gray-700 pt-4 mb-6">
                <div className="flex items-center gap-2 mb-3 text-yellow-400"><MousePointer2 size={16} /><h3 className="text-sm font-medium">Seçili Nesneler</h3></div>
                <p className="text-xs text-gray-400">
                    Toplam {selectedEntities.size} nesne seçili.
                    {selectedEntities.size > 0 && <button onClick={() => setSelectedEntities(new Set())} className="ml-2 text-red-400 hover:text-red-300 underline">Seçimi Kaldır</button>}
                </p>
            </div>

            <div className="border-t border-gray-700 pt-4">
                <div className="flex items-center gap-2 mb-3 text-blue-400"><Save size={16} /><h3 className="text-sm font-medium">İşlemler</h3></div>
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 px-4 rounded">JSON Olarak Aktar</button>
            </div>
          </div>
        </div>
      )}
      {/* Sidebar kapalıyken açma butonu */}
      {!sidebarOpen && 
        <button 
          onClick={() => setSidebarOpen(true)} 
          className="absolute top-4 right-4 p-2 bg-gray-800 rounded text-gray-300 hover:bg-gray-700 transition-colors z-20"
        >
          <Menu size={20} />
        </button>
      }
      
      {/* MODAL KOMPONENTİ */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl transform transition-all duration-300">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">{modalTitle}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 text-gray-300">
              {modalContent}
            </div>
            <div className="p-4 border-t border-gray-700 text-right">
              <button onClick={closeModal} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors">
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