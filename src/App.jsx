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
  Eye, // Görüntüleme modu
  EyeOff, // Düzenleme modu
  MoreHorizontal, // Menü butonu (...)
} from 'lucide-react';

// ============================================
// Sabitler
// ============================================
const API_URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=";
const API_KEY = ""; // Canvas runtime'da otomatik sağlanacak
const SNAP_TOLERANCE_PX = 10; // Yakalama hassasiyeti (piksel cinsinden)

// AutoCAD Color Index (ACI) - Temel renkler
const ACI_COLORS = {
  1: '#FF0000',   // Kırmızı
  2: '#FFFF00',   // Sarı
  3: '#00FF00',   // Yeşil
  4: '#00FFFF',   // Cyan
  5: '#0000FF',   // Mavi
  6: '#FF00FF',   // Magenta
  7: '#FFFFFF',   // Beyaz
  8: '#808080',   // Gri
  9: '#C0C0C0',   // Açık Gri
  10: '#FF0000',  // Kırmızı
  11: '#FF7F7F',  // Açık Kırmızı
  12: '#CC0000',  // Koyu Kırmızı
  20: '#FF3F00',  // Turuncu-Kırmızı
  30: '#FF7F00',  // Turuncu
  40: '#FFBF00',  // Altın
  50: '#FFFF00',  // Sarı
  60: '#BFFF00',  // Sarı-Yeşil
  70: '#7FFF00',  // Açık Yeşil
  80: '#3FFF00',  // Yeşil
  90: '#00FF00',  // Parlak Yeşil
  100: '#00FF3F', // Yeşil-Cyan
  110: '#00FF7F', // Turkuaz
  120: '#00FFBF', // Açık Turkuaz
  130: '#00FFFF', // Cyan
  140: '#00BFFF', // Açık Mavi
  150: '#007FFF', // Gökyüzü Mavi
  160: '#003FFF', // Mavi
  170: '#0000FF', // Parlak Mavi
  180: '#3F00FF', // Mor-Mavi
  190: '#7F00FF', // Mor
  200: '#BF00FF', // Açık Mor
  210: '#FF00FF', // Magenta
  220: '#FF00BF', // Pembe-Magenta
  230: '#FF007F', // Pembe
  240: '#FF003F', // Kırmızı-Pembe
  250: '#333333', // Koyu Gri
  251: '#505050', // Gri
  252: '#696969', // Orta Gri
  253: '#828282', // Açık Gri
  254: '#BEBEBE', // Çok Açık Gri
  255: '#FFFFFF', // Beyaz
};

// Entity'den renk al
const getEntityColor = (entity, defaultColor = '#e0e0e0') => {
  // True Color varsa öncelikli
  if (entity.trueColor) {
    return `rgb(${entity.trueColor.r}, ${entity.trueColor.g}, ${entity.trueColor.b})`;
  }
  // ACI renk indeksi varsa
  if (entity.colorIndex !== undefined && entity.colorIndex > 0) {
    return ACI_COLORS[entity.colorIndex] || defaultColor;
  }
  return defaultColor;
};

// ============================================
// ÇEKİRDEK FONKSİYONLAR - DXF PARSER
// ============================================

const parseDxfSimple = (dxfString) => {
  console.log('[DEBUG] parseDxfSimple() çağrıldı, dxfString uzunluk:', dxfString?.length);
  const lines = dxfString.split(/\r?\n/);
  const entities = [];
  const blocks = new Map(); // BLOCK tanımları
  let currentEntity = null;
  let isEntitySection = false;
  let isBlockSection = false;
  let currentBlock = null;
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
          if (isBlockSection && currentBlock) {
            currentBlock.entities.push(currentEntity);
          } else {
            entities.push(currentEntity);
          }
        }
      }
    }
    else if (currentEntity.type === 'CIRCLE') {
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          currentEntity.r !== undefined && currentEntity.r > 0) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'ARC') {
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          currentEntity.r !== undefined && currentEntity.r > 0) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'LWPOLYLINE' || currentEntity.type === 'POLYLINE') {
      if (currentEntity.vertices && currentEntity.vertices.length >= 2) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'TEXT' || currentEntity.type === 'MTEXT' || currentEntity.type === 'ATTRIB' || currentEntity.type === 'ATTDEF') {
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          currentEntity.text && currentEntity.text.length > 0) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'INSERT') {
      if (currentEntity.x !== undefined && currentEntity.y !== undefined && currentEntity.blockName) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'POINT') {
      if (currentEntity.x !== undefined && currentEntity.y !== undefined) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'SOLID' || currentEntity.type === 'TRACE') {
      if (currentEntity.x1 !== undefined && currentEntity.y1 !== undefined) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'ELLIPSE') {
      if (currentEntity.x !== undefined && currentEntity.y !== undefined) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'SPLINE') {
      if (currentEntity.controlPoints && currentEntity.controlPoints.length >= 2) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'HATCH') {
      // Kalan path'i kaydet
      if (currentEntity.currentPath && currentEntity.currentPath.vertices.length > 0) {
        currentEntity.boundaryPaths.push(currentEntity.currentPath);
        delete currentEntity.currentPath;
      }
      // Hatch'i kaydet
      if (currentEntity.boundaryPaths && currentEntity.boundaryPaths.length > 0) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'DIMENSION') {
      // Dimension için gerçek ölçüm noktalarını kontrol et (x3,y3 ve x4,y4)
      // x1,y1 definition point genellikle 0,0 olur - kullanılmıyor
      const hasP3 = currentEntity.x3 !== undefined && currentEntity.y3 !== undefined &&
                    !isNaN(currentEntity.x3) && !isNaN(currentEntity.y3);
      const hasP4 = currentEntity.x4 !== undefined && currentEntity.y4 !== undefined &&
                    !isNaN(currentEntity.x4) && !isNaN(currentEntity.y4);
      
      if (hasP3 && hasP4) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'LEADER') {
      if (currentEntity.vertices && currentEntity.vertices.length >= 2) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'IMAGE') {
      // IMAGE için koordinat kontrolü
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          !isNaN(currentEntity.x) && !isNaN(currentEntity.y)) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'VIEWPORT') {
      // VIEWPORT için koordinat kontrolü
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          !isNaN(currentEntity.x) && !isNaN(currentEntity.y)) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'OLE2FRAME') {
      // OLE2FRAME için koordinat kontrolü
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          !isNaN(currentEntity.x) && !isNaN(currentEntity.y)) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'RTEXT') {
      // RTEXT için koordinat kontrolü
      if (currentEntity.x !== undefined && currentEntity.y !== undefined &&
          !isNaN(currentEntity.x) && !isNaN(currentEntity.y)) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
      }
    }
    else if (currentEntity.type === 'WIPEOUT') {
      // WIPEOUT için vertex kontrolü
      if (currentEntity.vertices && currentEntity.vertices.length >= 3) {
        if (isBlockSection && currentBlock) {
          currentBlock.entities.push(currentEntity);
        } else {
          entities.push(currentEntity);
        }
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
    
    // BLOCKS Section kontrolü
    if (code === 2 && value === 'BLOCKS') {
      isBlockSection = true;
      continue;
    }
    
    // Section kontrolü
    if (code === 2 && value === 'ENTITIES') {
      isBlockSection = false;
      isEntitySection = true;
      continue;
    }
    if (code === 0 && value === 'ENDSEC') {
      if (isEntitySection) {
        saveCurrentEntity();
        isEntitySection = false;
      }
      if (isBlockSection) {
        if (currentBlock) {
          blocks.set(currentBlock.name, currentBlock);
        }
        isBlockSection = false;
        currentBlock = null;
      }
      continue;
    }
    
    // BLOCK tanımı başlangıcı
    if (isBlockSection && code === 0 && value === 'BLOCK') {
      if (currentBlock) {
        blocks.set(currentBlock.name, currentBlock);
      }
      currentBlock = { name: '', baseX: 0, baseY: 0, entities: [] };
      continue;
    }
    
    // BLOCK tanımı sonu
    if (isBlockSection && code === 0 && value === 'ENDBLK') {
      saveCurrentEntity();
      currentEntity = null;
      if (currentBlock && currentBlock.name) {
        blocks.set(currentBlock.name, currentBlock);
      }
      currentBlock = { name: '', baseX: 0, baseY: 0, entities: [] };
      continue;
    }
    
    // BLOCK ismi ve base point
    if (isBlockSection && currentBlock && !currentEntity) {
      if (code === 2) currentBlock.name = value;
      else if (code === 10) currentBlock.baseX = parseFloat(value);
      else if (code === 20) currentBlock.baseY = parseFloat(value);
    }
    
    if (!isEntitySection && !isBlockSection) continue;
    
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
      else if (value === 'POLYLINE') {
        currentEntity = { type: 'POLYLINE', layer: '0', id: crypto.randomUUID(), vertices: [], closed: false };
      }
      else if (value === 'VERTEX') {
        // POLYLINE vertex'i - mevcut entity'ye ekle
        if (currentEntity && currentEntity.type === 'POLYLINE') {
          // Vertex bilgileri sonraki satırlarda gelecek
        }
      }
      else if (value === 'SEQEND') {
        // POLYLINE sonu
        saveCurrentEntity();
        currentEntity = null;
      }
      else if (value === 'TEXT') {
        currentEntity = { type: 'TEXT', layer: '0', id: crypto.randomUUID(), text: '', height: 2.5, rotation: 0 };
      }
      else if (value === 'MTEXT') {
        currentEntity = { type: 'MTEXT', layer: '0', id: crypto.randomUUID(), text: '', height: 2.5, rotation: 0, width: 0 };
      }
      else if (value === 'ATTRIB') {
        currentEntity = { type: 'ATTRIB', layer: '0', id: crypto.randomUUID(), text: '', height: 2.5, rotation: 0, tag: '' };
      }
      else if (value === 'ATTDEF') {
        currentEntity = { type: 'ATTDEF', layer: '0', id: crypto.randomUUID(), text: '', height: 2.5, rotation: 0, tag: '' };
      }
      else if (value === 'INSERT') {
        currentEntity = { type: 'INSERT', layer: '0', id: crypto.randomUUID(), blockName: '', scaleX: 1, scaleY: 1, rotation: 0 };
      }
      else if (value === 'POINT') {
        currentEntity = { type: 'POINT', layer: '0', id: crypto.randomUUID() };
      }
      else if (value === 'SOLID' || value === 'TRACE') {
        currentEntity = { type: value, layer: '0', id: crypto.randomUUID() };
      }
      else if (value === 'ELLIPSE') {
        currentEntity = { type: 'ELLIPSE', layer: '0', id: crypto.randomUUID(), ratio: 1, startAngle: 0, endAngle: Math.PI * 2 };
      }
      else if (value === 'SPLINE') {
        currentEntity = { type: 'SPLINE', layer: '0', id: crypto.randomUUID(), controlPoints: [], degree: 3 };
      }
      else if (value === 'HATCH') {
        currentEntity = { type: 'HATCH', layer: '0', id: crypto.randomUUID(), boundaryPaths: [], patternName: 'SOLID' };
      }
      else if (value === 'DIMENSION') {
        currentEntity = { type: 'DIMENSION', layer: '0', id: crypto.randomUUID(), dimType: 0 };
      }
      else if (value === 'LEADER') {
        currentEntity = { type: 'LEADER', layer: '0', id: crypto.randomUUID(), vertices: [] };
      }
      else if (value === 'IMAGE') {
        currentEntity = { type: 'IMAGE', layer: '0', id: crypto.randomUUID(), imagePath: '' };
      }
      else if (value === 'WIPEOUT') {
        currentEntity = { type: 'WIPEOUT', layer: '0', id: crypto.randomUUID(), vertices: [] };
      }
      else if (value === 'VIEWPORT') {
        currentEntity = { type: 'VIEWPORT', layer: '0', id: crypto.randomUUID() };
      }
      else if (value === 'OLE2FRAME') {
        currentEntity = { type: 'OLE2FRAME', layer: '0', id: crypto.randomUUID() };
      }
      else if (value === 'REGION') {
        currentEntity = { type: 'REGION', layer: '0', id: crypto.randomUUID() };
      }
      else if (value === '3DFACE') {
        currentEntity = { type: '3DFACE', layer: '0', id: crypto.randomUUID() };
      }
      else if (value === 'RTEXT') {
        currentEntity = { type: 'RTEXT', layer: '0', id: crypto.randomUUID(), text: '', height: 2.5 };
      }
      else {
        // Bilinmeyen entity türlerini de sakla
        currentEntity = { type: value, layer: '0', id: crypto.randomUUID(), _unknown: true };
      }
      continue;
    }
    
    if (!currentEntity) continue;
    
    // Ortak: Layer (kod 8)
    if (code === 8) {
      currentEntity.layer = value;
      continue;
    }
    
    // Ortak: Renk (kod 62 = ACI renk indeksi, kod 420 = True Color RGB)
    if (code === 62) {
      currentEntity.colorIndex = parseInt(value);
      continue;
    }
    if (code === 420) {
      // True color: 24-bit RGB değeri
      const rgb = parseInt(value);
      currentEntity.trueColor = {
        r: (rgb >> 16) & 0xFF,
        g: (rgb >> 8) & 0xFF,
        b: rgb & 0xFF
      };
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
    // POLYLINE (eski format)
    else if (currentEntity.type === 'POLYLINE') {
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
      else if (code === 7) currentEntity.style = value; // Text style
      else if (code === 72) currentEntity.hAlign = parseInt(value); // Horizontal alignment
      else if (code === 73) currentEntity.vAlign = parseInt(value); // Vertical alignment
    }
    // MTEXT
    else if (currentEntity.type === 'MTEXT') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 40) currentEntity.height = parseFloat(value);
      else if (code === 50) currentEntity.rotation = parseFloat(value);
      else if (code === 41) currentEntity.width = parseFloat(value);
      else if (code === 71) currentEntity.attachmentPoint = parseInt(value);
      else if (code === 1) currentEntity.text = value;
      else if (code === 3) currentEntity.text = (currentEntity.text || '') + value; // MTEXT devam satırları
    }
    // ATTRIB (Block attribute)
    else if (currentEntity.type === 'ATTRIB' || currentEntity.type === 'ATTDEF') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 40) currentEntity.height = parseFloat(value);
      else if (code === 50) currentEntity.rotation = parseFloat(value);
      else if (code === 1) currentEntity.text = value;
      else if (code === 2) currentEntity.tag = value;
      else if (code === 7) currentEntity.style = value;
    }
    // INSERT (Block reference)
    else if (currentEntity.type === 'INSERT') {
      if (code === 2) currentEntity.blockName = value;
      else if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 41) currentEntity.scaleX = parseFloat(value);
      else if (code === 42) currentEntity.scaleY = parseFloat(value);
      else if (code === 50) currentEntity.rotation = parseFloat(value);
    }
    // POINT
    else if (currentEntity.type === 'POINT') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
    }
    // SOLID / TRACE
    else if (currentEntity.type === 'SOLID' || currentEntity.type === 'TRACE') {
      if (code === 10) currentEntity.x1 = parseFloat(value);
      else if (code === 20) currentEntity.y1 = parseFloat(value);
      else if (code === 11) currentEntity.x2 = parseFloat(value);
      else if (code === 21) currentEntity.y2 = parseFloat(value);
      else if (code === 12) currentEntity.x3 = parseFloat(value);
      else if (code === 22) currentEntity.y3 = parseFloat(value);
      else if (code === 13) currentEntity.x4 = parseFloat(value);
      else if (code === 23) currentEntity.y4 = parseFloat(value);
    }
    // ELLIPSE
    else if (currentEntity.type === 'ELLIPSE') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 11) currentEntity.majorX = parseFloat(value);
      else if (code === 21) currentEntity.majorY = parseFloat(value);
      else if (code === 40) currentEntity.ratio = parseFloat(value);
      else if (code === 41) currentEntity.startAngle = parseFloat(value);
      else if (code === 42) currentEntity.endAngle = parseFloat(value);
    }
    // SPLINE
    else if (currentEntity.type === 'SPLINE') {
      if (code === 71) currentEntity.degree = parseInt(value);
      else if (code === 10) {
        currentVertexX = parseFloat(value);
      }
      else if (code === 20 && currentVertexX !== null) {
        const y = parseFloat(value);
        if (!isNaN(currentVertexX) && !isNaN(y)) {
          currentEntity.controlPoints.push({ x: currentVertexX, y: y });
        }
        currentVertexX = null;
      }
    }
    // HATCH
    else if (currentEntity.type === 'HATCH') {
      if (code === 2) currentEntity.patternName = value;
      else if (code === 70) currentEntity.solidFill = parseInt(value) === 1;
      else if (code === 91) {
        // Boundary path sayısı - yeni path başlat
        if (!currentEntity.currentPath) {
          currentEntity.currentPath = { vertices: [] };
        }
      }
      else if (code === 10) {
        currentVertexX = parseFloat(value);
      }
      else if (code === 20 && currentVertexX !== null) {
        const y = parseFloat(value);
        if (!isNaN(currentVertexX) && !isNaN(y)) {
          if (!currentEntity.currentPath) {
            currentEntity.currentPath = { vertices: [] };
          }
          currentEntity.currentPath.vertices.push({ x: currentVertexX, y: y });
        }
        currentVertexX = null;
      }
      else if (code === 97) {
        // Source boundary objects - path'i kaydet
        if (currentEntity.currentPath && currentEntity.currentPath.vertices.length > 0) {
          currentEntity.boundaryPaths.push(currentEntity.currentPath);
          currentEntity.currentPath = { vertices: [] };
        }
      }
    }
    // DIMENSION
    else if (currentEntity.type === 'DIMENSION') {
      if (code === 10) currentEntity.x1 = parseFloat(value);
      else if (code === 20) currentEntity.y1 = parseFloat(value);
      else if (code === 11) currentEntity.x2 = parseFloat(value);
      else if (code === 21) currentEntity.y2 = parseFloat(value);
      else if (code === 13) currentEntity.x3 = parseFloat(value);
      else if (code === 23) currentEntity.y3 = parseFloat(value);
      else if (code === 14) currentEntity.x4 = parseFloat(value);
      else if (code === 24) currentEntity.y4 = parseFloat(value);
      else if (code === 70) currentEntity.dimType = parseInt(value);
      else if (code === 1) currentEntity.text = value;
    }
    // LEADER
    else if (currentEntity.type === 'LEADER') {
      if (code === 10) {
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
    // IMAGE
    else if (currentEntity.type === 'IMAGE') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 11) currentEntity.uX = parseFloat(value); // U vektörü (genişlik yönü)
      else if (code === 21) currentEntity.uY = parseFloat(value);
      else if (code === 12) currentEntity.vX = parseFloat(value); // V vektörü (yükseklik yönü)
      else if (code === 22) currentEntity.vY = parseFloat(value);
      else if (code === 13) currentEntity.width = parseFloat(value); // Piksel genişliği
      else if (code === 23) currentEntity.height = parseFloat(value); // Piksel yüksekliği
      else if (code === 340) currentEntity.imageDefHandle = value; // IMAGEDEF referansı
    }
    // WIPEOUT
    else if (currentEntity.type === 'WIPEOUT') {
      if (code === 10) {
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
    // VIEWPORT
    else if (currentEntity.type === 'VIEWPORT') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 40) currentEntity.width = parseFloat(value);
      else if (code === 41) currentEntity.height = parseFloat(value);
    }
    // OLE2FRAME
    else if (currentEntity.type === 'OLE2FRAME') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 11) currentEntity.x2 = parseFloat(value);
      else if (code === 21) currentEntity.y2 = parseFloat(value);
    }
    // RTEXT
    else if (currentEntity.type === 'RTEXT') {
      if (code === 10) currentEntity.x = parseFloat(value);
      else if (code === 20) currentEntity.y = parseFloat(value);
      else if (code === 40) currentEntity.height = parseFloat(value);
      else if (code === 1) currentEntity.text = value;
    }
  }
  
  saveCurrentEntity();
  
  // INSERT'leri çöz - block entity'lerini ana listeye ekle
  const resolvedEntities = [];
  const processEntities = (ents, offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1, rotation = 0) => {
    for (const ent of ents) {
      if (ent.type === 'INSERT' && blocks.has(ent.blockName)) {
        const block = blocks.get(ent.blockName);
        const insX = ent.x || 0;
        const insY = ent.y || 0;
        const insScaleX = (ent.scaleX || 1) * scaleX;
        const insScaleY = (ent.scaleY || 1) * scaleY;
        const insRotation = (ent.rotation || 0) + rotation;
        
        // Block entity'lerini transform ederek ekle
        for (const blockEnt of block.entities) {
          const transformedEnt = transformEntity(blockEnt, insX, insY, insScaleX, insScaleY, insRotation, block.baseX, block.baseY);
          if (transformedEnt) {
            resolvedEntities.push(transformedEnt);
          }
        }
      } else if (ent.type !== 'INSERT') {
        resolvedEntities.push(ent);
      }
    }
  };
  
  processEntities(entities);
  
  // Debug: Bulunan entity türlerini konsola yaz
  const typeCounts = {};
  resolvedEntities.forEach(e => {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  });
  console.log('DXF Entity türleri:', typeCounts);
  console.log('Toplam entity sayısı:', resolvedEntities.length);
  
  return resolvedEntities.length > 0 ? resolvedEntities : entities;
};

// Entity'yi transform et (INSERT için)
const transformEntity = (ent, offsetX, offsetY, scaleX, scaleY, rotation, baseX = 0, baseY = 0) => {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  
  const transformPoint = (x, y) => {
    // Base point'i çıkar, scale uygula, rotate et, offset ekle
    const px = (x - baseX) * scaleX;
    const py = (y - baseY) * scaleY;
    return {
      x: px * cos - py * sin + offsetX,
      y: px * sin + py * cos + offsetY
    };
  };
  
  const newEnt = { ...ent, id: crypto.randomUUID() };
  
  if (ent.type === 'LINE') {
    const p1 = transformPoint(ent.x1, ent.y1);
    const p2 = transformPoint(ent.x2, ent.y2);
    newEnt.x1 = p1.x; newEnt.y1 = p1.y;
    newEnt.x2 = p2.x; newEnt.y2 = p2.y;
  }
  else if (ent.type === 'CIRCLE') {
    const p = transformPoint(ent.x, ent.y);
    newEnt.x = p.x; newEnt.y = p.y;
    newEnt.r = ent.r * Math.abs(scaleX); // Assume uniform scale for circle
  }
  else if (ent.type === 'ARC') {
    const p = transformPoint(ent.x, ent.y);
    newEnt.x = p.x; newEnt.y = p.y;
    newEnt.r = ent.r * Math.abs(scaleX);
    newEnt.startAngle = (ent.startAngle || 0) + rotation;
    newEnt.endAngle = (ent.endAngle || 360) + rotation;
  }
  else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
    newEnt.vertices = ent.vertices.map(v => transformPoint(v.x, v.y));
  }
  else if (ent.type === 'TEXT' || ent.type === 'MTEXT' || ent.type === 'ATTRIB' || ent.type === 'ATTDEF') {
    const p = transformPoint(ent.x, ent.y);
    newEnt.x = p.x; newEnt.y = p.y;
    newEnt.height = (ent.height || 2.5) * Math.abs(scaleY);
    newEnt.rotation = (ent.rotation || 0) + rotation;
  }
  else if (ent.type === 'POINT') {
    const p = transformPoint(ent.x, ent.y);
    newEnt.x = p.x; newEnt.y = p.y;
  }
  else if (ent.type === 'ELLIPSE') {
    const p = transformPoint(ent.x, ent.y);
    newEnt.x = p.x; newEnt.y = p.y;
    newEnt.majorX = ent.majorX * scaleX;
    newEnt.majorY = ent.majorY * scaleY;
  }
  else if (ent.type === 'SPLINE') {
    newEnt.controlPoints = ent.controlPoints.map(v => transformPoint(v.x, v.y));
  }
  else if (ent.type === 'SOLID' || ent.type === 'TRACE') {
    const p1 = transformPoint(ent.x1, ent.y1);
    const p2 = transformPoint(ent.x2, ent.y2);
    const p3 = transformPoint(ent.x3 || ent.x2, ent.y3 || ent.y2);
    const p4 = transformPoint(ent.x4 || ent.x3 || ent.x2, ent.y4 || ent.y3 || ent.y2);
    newEnt.x1 = p1.x; newEnt.y1 = p1.y;
    newEnt.x2 = p2.x; newEnt.y2 = p2.y;
    newEnt.x3 = p3.x; newEnt.y3 = p3.y;
    newEnt.x4 = p4.x; newEnt.y4 = p4.y;
  }
  else if (ent.type === 'LEADER') {
    newEnt.vertices = ent.vertices.map(v => transformPoint(v.x, v.y));
  }
  else if (ent.type === 'DIMENSION') {
    if (ent.x1 !== undefined) {
      const p1 = transformPoint(ent.x1, ent.y1);
      newEnt.x1 = p1.x; newEnt.y1 = p1.y;
    }
    if (ent.x2 !== undefined) {
      const p2 = transformPoint(ent.x2, ent.y2);
      newEnt.x2 = p2.x; newEnt.y2 = p2.y;
    }
    if (ent.x3 !== undefined) {
      const p3 = transformPoint(ent.x3, ent.y3);
      newEnt.x3 = p3.x; newEnt.y3 = p3.y;
    }
    if (ent.x4 !== undefined) {
      const p4 = transformPoint(ent.x4, ent.y4);
      newEnt.x4 = p4.x; newEnt.y4 = p4.y;
    }
  }
  else if (ent.type === 'HATCH') {
    if (ent.boundaryPaths) {
      newEnt.boundaryPaths = ent.boundaryPaths.map(path => {
        if (path.vertices) {
          return {
            ...path,
            vertices: path.vertices.map(v => transformPoint(v.x, v.y))
          };
        }
        return path;
      });
    }
  }
  else if (ent.type === 'IMAGE' || ent.type === 'VIEWPORT' || ent.type === 'OLE2FRAME') {
    if (ent.x !== undefined) {
      const p = transformPoint(ent.x, ent.y);
      newEnt.x = p.x; newEnt.y = p.y;
    }
    if (ent.x2 !== undefined) {
      const p2 = transformPoint(ent.x2, ent.y2);
      newEnt.x2 = p2.x; newEnt.y2 = p2.y;
    }
    if (ent.width !== undefined) newEnt.width = ent.width * Math.abs(scaleX);
    if (ent.height !== undefined) newEnt.height = ent.height * Math.abs(scaleY);
  }
  else if (ent.type === 'WIPEOUT') {
    if (ent.vertices) {
      newEnt.vertices = ent.vertices.map(v => transformPoint(v.x, v.y));
    }
  }
  else if (ent._unknown) {
    // Bilinmeyen tip ama sakla
    if (ent.x !== undefined) {
      const p = transformPoint(ent.x, ent.y || 0);
      newEnt.x = p.x; newEnt.y = p.y;
    }
  }
  else {
    return null; // Transform edilemeyen tip
  }
  
  return newEnt;
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
    else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
      if (ent.vertices) {
        ent.vertices.forEach(v => updateBounds(v.x, v.y));
      }
    }
    else if (ent.type === 'RECTANGLE') {
        updateBounds(ent.x1, ent.y1);
        updateBounds(ent.x2, ent.y2);
    }
    else if (ent.type === 'TEXT' || ent.type === 'MTEXT' || ent.type === 'ATTRIB' || ent.type === 'ATTDEF') {
      // Yazı için yaklaşık bounds hesapla
      const textWidth = (ent.text?.length || 1) * (ent.height || 2.5) * 0.6;
      updateBounds(ent.x, ent.y);
      updateBounds(ent.x + textWidth, ent.y + (ent.height || 2.5));
    }
    else if (ent.type === 'POINT') {
      updateBounds(ent.x, ent.y);
    }
    else if (ent.type === 'SOLID' || ent.type === 'TRACE') {
      updateBounds(ent.x1, ent.y1);
      updateBounds(ent.x2, ent.y2);
      if (ent.x3 !== undefined) updateBounds(ent.x3, ent.y3);
      if (ent.x4 !== undefined) updateBounds(ent.x4, ent.y4);
    }
    else if (ent.type === 'ELLIPSE') {
      const majorLength = Math.sqrt(ent.majorX * ent.majorX + ent.majorY * ent.majorY);
      updateBounds(ent.x - majorLength, ent.y - majorLength);
      updateBounds(ent.x + majorLength, ent.y + majorLength);
    }
    else if (ent.type === 'SPLINE') {
      if (ent.controlPoints) {
        ent.controlPoints.forEach(v => updateBounds(v.x, v.y));
      }
    }
    else if (ent.type === 'LEADER') {
      if (ent.vertices) {
        ent.vertices.forEach(v => updateBounds(v.x, v.y));
      }
    }
    else if (ent.type === 'DIMENSION') {
      // x1,y1 (def point) genellikle 0,0 olduğu için bounds'a dahil etme
      // if (ent.x1 !== undefined) updateBounds(ent.x1, ent.y1);
      
      // x2,y2 (text point) önemli
      if (ent.x2 !== undefined) updateBounds(ent.x2, ent.y2);
      
      // x3,y3 ve x4,y4 (ölçüm noktaları)
      if (ent.x3 !== undefined) updateBounds(ent.x3, ent.y3);
      if (ent.x4 !== undefined) updateBounds(ent.x4, ent.y4);
    }
    else if (ent.type === 'USER_IMAGE' || ent.type === 'IMAGE') {
      updateBounds(ent.x, ent.y);
      updateBounds(ent.x + (ent.width || 100), ent.y - (ent.height || 100));
    }
    else if (ent.type === 'HATCH') {
      if (ent.boundaryPaths) {
        ent.boundaryPaths.forEach(path => {
          if (path.vertices) {
            path.vertices.forEach(v => updateBounds(v.x, v.y));
          }
        });
      }
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
      min-w-11 min-h-11 flex items-center justify-center
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
  
  // Yüklenen resimler için cache (id -> Image object)
  const loadedImagesRef = useRef(new Map());
  
  // Viewport
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [extents, setExtents] = useState(null); 
  
  // Etkileşim
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState('select'); // 'select', 'polyline', 'circle', 'rectangle'
  const [sidebarOpen, setSidebarOpen] = useState(false); // Varsayılan kapalı
  const [viewMode, setViewMode] = useState(true); // true = sadece görüntüleme (read-only), false = düzenleme
  
  // Pinch-to-Zoom State'i
  const [lastPinchDistance, setLastPinchDistance] = useState(null);
  const [isPinching, setIsPinching] = useState(false);
  
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
  const toScreenX = (worldX) => {
    const result = (worldX * scale) + offset.x;
    // console.log('[DEBUG] toScreenX:', worldX, '->', result);
    return result;
  };
  const toScreenY = (worldY) => {
    const result = (-worldY * scale) + offset.y;
    // console.log('[DEBUG] toScreenY:', worldY, '->', result);
    return result;
  }; // Y flip

  // DÜNYA KOORDİNATLARINA DÖNÜŞÜM 
  const toWorldX = (screenX) => {
    const result = (screenX - offset.x) / scale;
    // console.log('[DEBUG] toWorldX:', screenX, '->', result);
    return result;
  };
  const toWorldY = (screenY) => {
    const result = -(screenY - offset.y) / scale;
    // console.log('[DEBUG] toWorldY:', screenY, '->', result);
    return result;
  };
  
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
      console.log('[DEBUG] executeCommand() çağrıldı, komut:', command?.constructor?.name || command);
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
      console.log('[DEBUG] handleUndo() çağrıldı, historyIndex:', historyIndex);
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
      console.log('[DEBUG] handleRedo() çağrıldı, historyIndex:', historyIndex);
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
    console.log('[DEBUG] getAllSnapPoints() çağrıldı, entities:', entities.length);
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
    console.log('[DEBUG] fitToScreen() çağrıldı, entity sayısı:', currentEntities.length);
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
    console.log('[DEBUG] handleFileUpload() çağrıldı');
    const file = event.target.files[0];
    if (!file) return;
    console.log('[DEBUG] Dosya adı:', file.name, 'Boyut:', file.size);

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
        const unknownTypes = [];
        parsedEntities.forEach(ent => {
          typeCounts[ent.type] = (typeCounts[ent.type] || 0) + 1;
          if (ent._unknown && !unknownTypes.includes(ent.type)) {
            unknownTypes.push(ent.type);
          }
        });
        console.log('Entity tipleri:', typeCounts);
        if (unknownTypes.length > 0) {
          console.warn('Bilinmeyen entity türleri:', unknownTypes);
        }
        
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

  // --- RESİM YÜKLEME HANDLER ---
  const handleImageUpload = (event) => {
    console.log('[DEBUG] handleImageUpload() çağrıldı');
    const file = event.target.files[0];
    if (!file) return;
    console.log('[DEBUG] Resim dosyası:', file.name, 'Tip:', file.type);

    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      setModalTitle("Desteklenmeyen Resim Formatı");
      setModalContent("Lütfen PNG, JPEG, GIF, WebP veya SVG formatında bir resim yükleyin.");
      setShowModal(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageDataUrl = e.target.result;
      
      // Resmi yükle ve boyutlarını al
      const img = new Image();
      img.onload = () => {
        // Ekranın ortasına yerleştir
        const canvas = canvasRef.current;
        const centerX = (canvas.width / 2 - offset.x) / scale;
        const centerY = (canvas.height / 2 - offset.y) / scale;
        
        // Resim boyutlarını ölçekle (max 500 birim)
        const maxSize = 500;
        let width = img.width;
        let height = img.height;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width *= ratio;
          height *= ratio;
        }
        
        const newImageEntity = {
          type: 'USER_IMAGE',
          layer: '0',
          id: crypto.randomUUID(),
          x: centerX - width / 2,
          y: centerY + height / 2, // DXF koordinat sistemi (Y yukarı)
          width: width,
          height: height,
          imageDataUrl: imageDataUrl, // Base64 resim verisi
          fileName: file.name
        };

        // Resmi cache'e ekle
        loadedImagesRef.current.set(newImageEntity.id, img);

        const newEntities = [...entities, newImageEntity];
        setEntities(newEntities);
        addToHistory(newEntities);
        
        setModalTitle("Resim Eklendi");
        setModalContent(`"${file.name}" başarıyla eklendi. Resmi seçip taşıyabilirsiniz.`);
        setShowModal(true);
      };
      img.src = imageDataUrl;
    };
    reader.readAsDataURL(file);
  };

  // --- ÇİZİM İŞLEMLERİ (Faz 2.1) ---
  
  // Polyline çizimini bitir
  const finishPolyline = () => {
    console.log('[DEBUG] finishPolyline() çağrıldı, nokta sayısı:', currentPolyline.length);
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
    console.log('[DEBUG] cancelActiveDrawing() çağrıldı');
    setCurrentDrawingState(null);
    setCurrentPolyline([]);
    setActiveTool('select');
    setActiveSnap(null);
  }, []);
  
  // Tek tıklama ile çizim başlangıcını ayarla
  const startDrawing = (type, worldX, worldY) => {
    console.log('[DEBUG] startDrawing() çağrıldı, tip:', type, 'worldX:', worldX, 'worldY:', worldY);
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
    console.log('[DEBUG] handleDoubleClick() çağrıldı, activeTool:', activeTool);
    if (activeTool === 'polyline' && currentPolyline.length >= 2) {
      finishPolyline();
    } else if (activeTool === 'polyline') {
      // Yetersiz nokta varsa çizimi iptal et
      cancelActiveDrawing();
    }
  }

  // --- SEÇİM HESAPLAMA (Faz 1.2) ---
  const calculateSelection = useCallback((finalRect, mode) => {
    console.log('[DEBUG] calculateSelection() çağrıldı, mode:', mode, 'rect:', finalRect);
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
      
      // DEBUG: Entity render başlangıcı
      console.log(`[renderEntity] type=${entity.type}, id=${entity.id?.substring(0,8) || 'N/A'}`, entity);
      
      ctx.beginPath();
      
      // Entity'nin kendi rengini al
      const entityColor = getEntityColor(entity, '#e0e0e0');
      
      // Seçili nesneler için daha belirgin görünüm
      if (isSelected) {
        ctx.strokeStyle = '#fbbf24'; // Sarı (parlak)
        ctx.lineWidth = Math.max(3 / scale, 2);
        // Shadow efektini kapat
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
      } else {
        // DXF'den gelen rengi kullan, yoksa varsayılan
        ctx.strokeStyle = entityColor;
        ctx.lineWidth = Math.max(1 / scale, 1);
        ctx.shadowBlur = 0;
        
        // Katmana göre renk ayarı (sadece DXF rengi yoksa)
        if (!entity.trueColor && !entity.colorIndex) {
          if (entity.layer === 'DUVAR' || entity.layer.includes('WALL')) {
            ctx.strokeStyle = '#fca5a5';
          } else if (entity.type === 'ARC' || entity.type === 'CIRCLE' || entity.type === 'RECTANGLE') {
            ctx.strokeStyle = '#60a5fa';
          }
        }
      }
      
      // Çizim geometrisi
      if (entity.type === 'LINE') {
        // Geçerli koordinat kontrolü
        const valid = entity.x1 !== undefined && entity.y1 !== undefined &&
                      entity.x2 !== undefined && entity.y2 !== undefined &&
                      !isNaN(entity.x1) && !isNaN(entity.y1) &&
                      !isNaN(entity.x2) && !isNaN(entity.y2) &&
                      isFinite(entity.x1) && isFinite(entity.y1) &&
                      isFinite(entity.x2) && isFinite(entity.y2);
        if (!valid) {
          // console.warn('[renderEntity] LINE invalid coords:', entity);
          return; // Geçersiz ise çizme ve return et
        }
        
        // 0,0 başlangıç kontrolü - şüpheli çizgileri FİLTRELE
        // Eğer bir uç 0,0 ise ve diğer uç 0,0'dan uzaksa (>100 birim), bu muhtemelen hatalı bir çizgidir.
        const isZero1 = Math.abs(entity.x1) < 0.001 && Math.abs(entity.y1) < 0.001;
        const isZero2 = Math.abs(entity.x2) < 0.001 && Math.abs(entity.y2) < 0.001;
        
        if (isZero1 || isZero2) {
           const dist = Math.sqrt(Math.pow(entity.x2 - entity.x1, 2) + Math.pow(entity.y2 - entity.y1, 2));
           if (dist > 100) {
             console.warn('[renderEntity] LINE from/to 0,0 filtered (suspicious):', entity);
             return; // Çizme
           }
        }
        
        ctx.moveTo(toScreenX(entity.x1), toScreenY(entity.y1));
        ctx.lineTo(toScreenX(entity.x2), toScreenY(entity.y2));
      } 
      else if (entity.type === 'CIRCLE') {
        const valid = entity.x !== undefined && entity.y !== undefined && 
                      entity.r !== undefined &&
                      !isNaN(entity.x) && !isNaN(entity.y) && !isNaN(entity.r) &&
                      isFinite(entity.x) && isFinite(entity.y) && isFinite(entity.r);
        if (!valid) return;
        ctx.arc(
            toScreenX(entity.x), 
            toScreenY(entity.y), 
            entity.r * scale, 
            0, 2 * Math.PI
        );
      }
      else if (entity.type === 'ARC') {
        const valid = entity.x !== undefined && entity.y !== undefined && 
                      entity.r !== undefined &&
                      !isNaN(entity.x) && !isNaN(entity.y) && !isNaN(entity.r) &&
                      isFinite(entity.x) && isFinite(entity.y) && isFinite(entity.r);
        if (!valid) return;
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
      else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
        if (!entity.vertices || entity.vertices.length === 0) return;
        // Geçerli vertices filtrele
        const validVerts = entity.vertices.filter(v => 
          v.x !== undefined && v.y !== undefined &&
          !isNaN(v.x) && !isNaN(v.y) &&
          isFinite(v.x) && isFinite(v.y)
        );
        if (validVerts.length === 0) return;
        
        // 0,0 olan vertexleri filtrele (eğer diğer noktalar uzaksa)
        // Sadece başlangıç değil, ARADAKİ 0,0 noktaları da sorun yaratabilir.
        const hasFarPoint = validVerts.some(v => Math.sqrt(v.x*v.x + v.y*v.y) > 100);
        
        let renderVerts = validVerts;
        if (hasFarPoint) {
            // Eğer çizim genel olarak 0,0'dan uzaksa, 0,0 olan vertexleri çıkar
            renderVerts = validVerts.filter(v => !(Math.abs(v.x) < 0.001 && Math.abs(v.y) < 0.001));
            
            if (renderVerts.length < validVerts.length) {
                console.warn('[renderEntity] POLYLINE 0,0 vertices filtered:', entity);
            }
        }
        
        if (renderVerts.length < 2) return;

        ctx.moveTo(toScreenX(renderVerts[0].x), toScreenY(renderVerts[0].y));
        for (let i = 1; i < renderVerts.length; i++) {
            ctx.lineTo(toScreenX(renderVerts[i].x), toScreenY(renderVerts[i].y));
        }
        if (entity.closed) {
            ctx.closePath();
        }
      }
      else if (entity.type === 'RECTANGLE') {
        const valid = entity.x1 !== undefined && entity.y1 !== undefined &&
                      entity.x2 !== undefined && entity.y2 !== undefined &&
                      !isNaN(entity.x1) && !isNaN(entity.y1) &&
                      !isNaN(entity.x2) && !isNaN(entity.y2) &&
                      isFinite(entity.x1) && isFinite(entity.y1) &&
                      isFinite(entity.x2) && isFinite(entity.y2);
        if (!valid) return;
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
      else if (entity.type === 'TEXT' || entity.type === 'MTEXT' || entity.type === 'ATTRIB' || entity.type === 'ATTDEF') {
        // Yazı için stroke yerine fill kullanacağız
        const valid = entity.x !== undefined && entity.y !== undefined &&
                      !isNaN(entity.x) && !isNaN(entity.y) &&
                      isFinite(entity.x) && isFinite(entity.y);
        if (!valid) return;
        
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
        // DXF'den gelen rengi kullan
        const textColor = getEntityColor(entity, '#e0e0e0');
        ctx.fillStyle = isSelected ? '#fbbf24' : textColor;
        ctx.textBaseline = 'bottom';
        
        // MTEXT formatlarını temizle (\\P = satır sonu, vb.)
        let displayText = entity.text || '';
        displayText = displayText.replace(/\\P/g, '\n').replace(/\\[^;]+;/g, '').replace(/\{|\}/g, '');
        
        // Çok satırlı yazı desteği
        const lines = displayText.split('\n');
        lines.forEach((line, idx) => {
          ctx.fillText(line, 0, -idx * fontSize);
        });
        
        ctx.restore();
        
        // TEXT için stroke atla
        return;
      }
      else if (entity.type === 'POINT') {
        // Nokta - küçük çarpı işareti olarak çiz
        const valid = entity.x !== undefined && entity.y !== undefined &&
                      !isNaN(entity.x) && !isNaN(entity.y) &&
                      isFinite(entity.x) && isFinite(entity.y);
        if (!valid) return;
        const screenX = toScreenX(entity.x);
        const screenY = toScreenY(entity.y);
        const pointSize = Math.max(3, 5 / scale);
        
        ctx.moveTo(screenX - pointSize, screenY - pointSize);
        ctx.lineTo(screenX + pointSize, screenY + pointSize);
        ctx.moveTo(screenX + pointSize, screenY - pointSize);
        ctx.lineTo(screenX - pointSize, screenY + pointSize);
      }
      else if (entity.type === 'SOLID' || entity.type === 'TRACE') {
        // Solid/Trace - dolu dörtgen (DXF rengi ile)
        // Geçerli koordinatları kontrol et
        const hasP1 = entity.x1 !== undefined && entity.y1 !== undefined && 
                      !isNaN(entity.x1) && !isNaN(entity.y1) &&
                      isFinite(entity.x1) && isFinite(entity.y1);
        const hasP2 = entity.x2 !== undefined && entity.y2 !== undefined && 
                      !isNaN(entity.x2) && !isNaN(entity.y2) &&
                      isFinite(entity.x2) && isFinite(entity.y2);
        const hasP3 = entity.x3 !== undefined && entity.y3 !== undefined && 
                      !isNaN(entity.x3) && !isNaN(entity.y3) &&
                      isFinite(entity.x3) && isFinite(entity.y3);
        const hasP4 = entity.x4 !== undefined && entity.y4 !== undefined && 
                      !isNaN(entity.x4) && !isNaN(entity.y4) &&
                      isFinite(entity.x4) && isFinite(entity.y4);
        
        if (!hasP1 || !hasP2) return; // En az 2 nokta gerekli
        
        // DXF SOLID vertex sırası: P1 -> P2 -> P4 -> P3 (bowtie/kelebek önleme)
        ctx.beginPath();
        ctx.moveTo(toScreenX(entity.x1), toScreenY(entity.y1));
        ctx.lineTo(toScreenX(entity.x2), toScreenY(entity.y2));
        
        if (hasP4 && hasP3) {
          // 4 noktalı dörtgen: 1 → 2 → 4 → 3
          ctx.lineTo(toScreenX(entity.x4), toScreenY(entity.y4));
          ctx.lineTo(toScreenX(entity.x3), toScreenY(entity.y3));
        } else if (hasP3) {
          // 3 noktalı üçgen
          ctx.lineTo(toScreenX(entity.x3), toScreenY(entity.y3));
        } else if (hasP4) {
          // Sadece P4 varsa
          ctx.lineTo(toScreenX(entity.x4), toScreenY(entity.y4));
        }
        
        ctx.closePath();
        
        // DXF'den gelen rengi kullan
        const solidColor = getEntityColor(entity, '#60a5fa');
        if (isSelected) {
          ctx.fillStyle = '#fbbf24';
          ctx.strokeStyle = '#fbbf24';
        } else {
          ctx.fillStyle = solidColor;
          ctx.strokeStyle = solidColor;
        }
        ctx.fill();
        ctx.stroke();
        return; // stroke() tekrar çağrılmasın
      }
      else if (entity.type === 'ELLIPSE') {
        // Elips - koordinat kontrolü
        const valid = entity.x !== undefined && entity.y !== undefined &&
                      entity.majorX !== undefined && entity.majorY !== undefined &&
                      !isNaN(entity.x) && !isNaN(entity.y) &&
                      !isNaN(entity.majorX) && !isNaN(entity.majorY) &&
                      isFinite(entity.x) && isFinite(entity.y) &&
                      isFinite(entity.majorX) && isFinite(entity.majorY);
        if (!valid) return;
        const screenX = toScreenX(entity.x);
        const screenY = toScreenY(entity.y);
        const majorLength = Math.sqrt(entity.majorX * entity.majorX + entity.majorY * entity.majorY) * scale;
        const minorLength = majorLength * (entity.ratio || 0.5);
        const rotation = Math.atan2(entity.majorY, entity.majorX);
        
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(-rotation);
        ctx.beginPath();
        ctx.ellipse(0, 0, majorLength, minorLength, 0, entity.startAngle || 0, entity.endAngle || Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        return;
      }
      else if (entity.type === 'SPLINE') {
        // Spline - kontrol noktalarından geçen eğri (basitleştirilmiş)
        if (!entity.controlPoints || entity.controlPoints.length < 2) return;
        // Geçerli control points filtrele
        const validCPs = entity.controlPoints.filter(p => 
          p.x !== undefined && p.y !== undefined &&
          !isNaN(p.x) && !isNaN(p.y) &&
          isFinite(p.x) && isFinite(p.y)
        );
        
        if (validCPs.length < 2) return;
        
        // 0,0 kontrolü - eğer ilk kontrol noktası 0,0 ise ve diğerleri uzaksa çizme
        const firstCP = validCPs[0];
        if (Math.abs(firstCP.x) < 0.001 && Math.abs(firstCP.y) < 0.001) {
           const hasFarPoint = validCPs.some(p => Math.sqrt(p.x*p.x + p.y*p.y) > 100);
           if (hasFarPoint) {
             console.warn('[renderEntity] SPLINE starts at 0,0 filtered:', entity);
             return;
           }
        }

        ctx.moveTo(toScreenX(validCPs[0].x), toScreenY(validCPs[0].y));
        
        if (validCPs.length === 2) {
          ctx.lineTo(toScreenX(validCPs[1].x), toScreenY(validCPs[1].y));
        } else if (validCPs.length === 3) {
          ctx.quadraticCurveTo(
            toScreenX(validCPs[1].x), toScreenY(validCPs[1].y),
            toScreenX(validCPs[2].x), toScreenY(validCPs[2].y)
          );
        } else {
          // Bezier eğrisi ile yaklaşık çiz
          for (let i = 1; i < validCPs.length - 2; i += 3) {
            const p1 = validCPs[i];
            const p2 = validCPs[i + 1];
            const p3 = validCPs[Math.min(i + 2, validCPs.length - 1)];
            ctx.bezierCurveTo(
              toScreenX(p1.x), toScreenY(p1.y),
              toScreenX(p2.x), toScreenY(p2.y),
              toScreenX(p3.x), toScreenY(p3.y)
            );
          }
        }
        ctx.stroke();
        return;
      }
      else if (entity.type === 'HATCH') {
        // HATCH - dolu alan
        if (!entity.boundaryPaths || entity.boundaryPaths.length === 0) return;
        const hatchColor = getEntityColor(entity, '#60a5fa');
        
        ctx.save();
        entity.boundaryPaths.forEach(path => {
          if (path.vertices && path.vertices.length >= 3) {
            // Geçerli vertices filtrele
            const validVerts = path.vertices.filter(v => 
              v.x !== undefined && v.y !== undefined && 
              !isNaN(v.x) && !isNaN(v.y) &&
              isFinite(v.x) && isFinite(v.y)
            );
            
            // 0,0 olan vertexleri filtrele (HATCH için de geçerli)
            const hasFarPoint = validVerts.some(v => Math.sqrt(v.x*v.x + v.y*v.y) > 100);
            let renderVerts = validVerts;
            
            if (hasFarPoint) {
                renderVerts = validVerts.filter(v => !(Math.abs(v.x) < 0.001 && Math.abs(v.y) < 0.001));
            }
            
            if (renderVerts.length >= 3) {
              ctx.beginPath();
              ctx.moveTo(toScreenX(renderVerts[0].x), toScreenY(renderVerts[0].y));
              for (let i = 1; i < renderVerts.length; i++) {
                ctx.lineTo(toScreenX(renderVerts[i].x), toScreenY(renderVerts[i].y));
              }
              ctx.closePath();
              
              if (isSelected) {
                ctx.fillStyle = '#fbbf2480';
                ctx.strokeStyle = '#fbbf24';
              } else {
                // Solid fill veya pattern
                if (entity.solidFill || entity.patternName === 'SOLID') {
                  ctx.fillStyle = hatchColor;
                } else {
                  ctx.fillStyle = hatchColor + '60'; // Semi-transparent
                }
                ctx.strokeStyle = hatchColor;
              }
              ctx.fill();
              ctx.lineWidth = Math.max(1 / scale, 0.5);
              ctx.stroke();
            }
          }
        });
        ctx.restore();
        return; // Ana stroke'u atla
      }
      else if (entity.type === 'LEADER') {
        // Leader - ok işaretli çizgi
        if (!entity.vertices || entity.vertices.length < 2) return;
        // Tüm vertices için NaN kontrolü
        const validVertices = entity.vertices.filter(v => 
          v.x !== undefined && v.y !== undefined && 
          !isNaN(v.x) && !isNaN(v.y) &&
          isFinite(v.x) && isFinite(v.y)
        );
        
        if (validVertices.length < 2) return;
        
        // 0,0 kontrolü - eğer ilk nokta 0,0 ise ve diğerleri uzaksa çizme
        const firstV = validVertices[0];
        if (Math.abs(firstV.x) < 0.001 && Math.abs(firstV.y) < 0.001) {
           // Diğer noktalara bak
           const hasFarPoint = validVertices.some(v => Math.sqrt(v.x*v.x + v.y*v.y) > 100);
           if (hasFarPoint) {
             console.warn('[renderEntity] LEADER starts at 0,0 filtered:', entity);
             return;
           }
        }

        ctx.moveTo(toScreenX(validVertices[0].x), toScreenY(validVertices[0].y));
        for (let i = 1; i < validVertices.length; i++) {
          ctx.lineTo(toScreenX(validVertices[i].x), toScreenY(validVertices[i].y));
        }
        
        // Ok ucu çiz
        const endX = toScreenX(validVertices[0].x);
        const endY = toScreenY(validVertices[0].y);
        const prevX = toScreenX(validVertices[1].x);
        const prevY = toScreenY(validVertices[1].y);
        
        const angle = Math.atan2(endY - prevY, endX - prevX);
        const arrowSize = 8;
        
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - arrowSize * Math.cos(angle - Math.PI / 6), endY - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - arrowSize * Math.cos(angle + Math.PI / 6), endY - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        return;
      }
      else if (entity.type === 'DIMENSION') {
        // DIMENSION - Karmaşık yapı, şimdilik sadece ölçü noktalarını çiz
        // DXF'de kod 10,20 = definition point (genellikle 0,0 olur - kullanmıyoruz)
        // Kod 13,23 = birinci ölçü noktası, Kod 14,24 = ikinci ölçü noktası
        
        const hasP3 = entity.x3 !== undefined && entity.y3 !== undefined && 
                      !isNaN(entity.x3) && !isNaN(entity.y3) &&
                      isFinite(entity.x3) && isFinite(entity.y3);
        const hasP4 = entity.x4 !== undefined && entity.y4 !== undefined && 
                      !isNaN(entity.x4) && !isNaN(entity.y4) &&
                      isFinite(entity.x4) && isFinite(entity.y4);
        
        // Sadece gerçek ölçü noktaları varsa çiz (P1/P2 definition point olduğu için kullanma)
        if (hasP3 && hasP4) {
          // 0,0 kontrolü - eğer ölçüm noktalarından biri 0,0 ise ve diğeri uzaksa çizme
          const isZero3 = Math.abs(entity.x3) < 0.001 && Math.abs(entity.y3) < 0.001;
          const isZero4 = Math.abs(entity.x4) < 0.001 && Math.abs(entity.y4) < 0.001;
          
          if (isZero3 || isZero4) {
             const dist = Math.sqrt(Math.pow(entity.x4 - entity.x3, 2) + Math.pow(entity.y4 - entity.y3, 2));
             if (dist > 100) {
               console.warn('[renderEntity] DIMENSION point at 0,0 filtered:', entity);
               return;
             }
          }

          ctx.moveTo(toScreenX(entity.x3), toScreenY(entity.y3));
          ctx.lineTo(toScreenX(entity.x4), toScreenY(entity.y4));
        } else {
          // Geçerli ölçü noktası yoksa çizme
          return;
        }
        
        // Dimension text
        if (entity.text && hasP3 && hasP4) {
          let textX, textY;
          
          // Eğer x2,y2 (text position) varsa onu kullan, yoksa orta noktayı hesapla
          if (entity.x2 !== undefined && entity.y2 !== undefined && 
              !isNaN(entity.x2) && !isNaN(entity.y2)) {
            textX = entity.x2;
            textY = entity.y2;
          } else {
            textX = (entity.x3 + entity.x4) / 2;
            textY = (entity.y3 + entity.y4) / 2;
          }
          
          const fontSize = Math.max(10, 2.5 * scale);
          ctx.font = `${fontSize}px Arial`;
          ctx.fillStyle = isSelected ? '#fbbf24' : '#e0e0e0';
          ctx.fillText(entity.text, toScreenX(textX), toScreenY(textY));
        }
        ctx.stroke();
        return;
      }
      else if (entity.type === 'USER_IMAGE') {
        // Kullanıcının yüklediği resim
        // Koordinat kontrolü
        if (entity.x === undefined || entity.y === undefined ||
            isNaN(entity.x) || isNaN(entity.y) ||
            !isFinite(entity.x) || !isFinite(entity.y)) return;
        if (!entity.width || !entity.height) return;
        
        const screenX = toScreenX(entity.x);
        const screenY = toScreenY(entity.y);
        const width = entity.width * scale;
        const height = entity.height * scale;
        
        ctx.save();
        
        // Cache'den resmi al veya yükle
        let img = loadedImagesRef.current.get(entity.id);
        if (!img && entity.imageDataUrl) {
          img = new Image();
          img.src = entity.imageDataUrl;
          loadedImagesRef.current.set(entity.id, img);
        }
        
        if (img && img.complete) {
          // Resmi çiz (Y ekseni ters - DXF koordinat sistemi)
          ctx.drawImage(img, screenX, screenY - height, width, height);
        } else {
          // Resim yüklenene kadar placeholder
          ctx.fillStyle = '#374151';
          ctx.fillRect(screenX, screenY - height, width, height);
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 2;
          ctx.strokeRect(screenX, screenY - height, width, height);
          
          const fontSize = Math.max(12, 10 * scale);
          ctx.font = `${fontSize}px Arial`;
          ctx.fillStyle = '#60a5fa';
          ctx.textAlign = 'center';
          ctx.fillText('⏳ Yükleniyor...', screenX + width / 2, screenY - height / 2);
        }
        
        // Seçili ise çerçeve çiz
        if (isSelected) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(screenX - 2, screenY - height - 2, width + 4, height + 4);
          ctx.setLineDash([]);
        }
        
        ctx.restore();
        return;
      }
      else if (entity.type === 'IMAGE') {
        // IMAGE - resim placeholder'ı göster
        // Koordinat kontrolü
        if (entity.x === undefined || entity.y === undefined ||
            isNaN(entity.x) || isNaN(entity.y) ||
            !isFinite(entity.x) || !isFinite(entity.y)) return;
            
        const screenX = toScreenX(entity.x);
        const screenY = toScreenY(entity.y);
        
        // U ve V vektörleriyle genişlik/yükseklik hesapla
        let width = 100 * scale;
        let height = 100 * scale;
        
        if (entity.uX !== undefined && entity.width !== undefined) {
          width = Math.abs(entity.uX) * entity.width * scale;
        }
        if (entity.vY !== undefined && entity.height !== undefined) {
          height = Math.abs(entity.vY) * entity.height * scale;
        }
        
        // Placeholder dikdörtgen
        ctx.save();
        ctx.strokeStyle = isSelected ? '#fbbf24' : '#a855f7'; // Mor
        ctx.lineWidth = Math.max(2 / scale, 1);
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(screenX, screenY - height, width, height);
        ctx.setLineDash([]);
        
        // Resim ikonu çiz (X işareti)
        ctx.beginPath();
        ctx.moveTo(screenX, screenY - height);
        ctx.lineTo(screenX + width, screenY);
        ctx.moveTo(screenX + width, screenY - height);
        ctx.lineTo(screenX, screenY);
        ctx.stroke();
        
        // "IMAGE" yazısı
        const fontSize = Math.max(12, 10 * scale);
        ctx.font = `${fontSize}px Arial`;
        ctx.fillStyle = isSelected ? '#fbbf24' : '#a855f7';
        ctx.textAlign = 'center';
        ctx.fillText('📷 IMAGE', screenX + width / 2, screenY - height / 2);
        ctx.textAlign = 'left';
        ctx.restore();
        return;
      }
      else if (entity.type === 'VIEWPORT') {
        // VIEWPORT - kesikli dikdörtgen
        // Koordinat kontrolü
        if (entity.x === undefined || entity.y === undefined ||
            isNaN(entity.x) || isNaN(entity.y) ||
            !isFinite(entity.x) || !isFinite(entity.y)) return;
            
        const screenX = toScreenX(entity.x);
        const screenY = toScreenY(entity.y);
        const width = (entity.width || 100) * scale;
        const height = (entity.height || 100) * scale;
        
        ctx.save();
        ctx.strokeStyle = isSelected ? '#fbbf24' : '#06b6d4'; // Cyan
        ctx.lineWidth = Math.max(1 / scale, 1);
        ctx.setLineDash([10, 5]);
        ctx.strokeRect(screenX - width / 2, screenY - height / 2, width, height);
        ctx.setLineDash([]);
        ctx.restore();
        return; // stroke atla
      }
      else if (entity.type === 'OLE2FRAME') {
        // OLE2FRAME - gömülü nesne placeholder'ı
        // Koordinat kontrolü
        if (entity.x === undefined || entity.y === undefined ||
            isNaN(entity.x) || isNaN(entity.y) ||
            !isFinite(entity.x) || !isFinite(entity.y)) return;
            
        const screenX1 = toScreenX(entity.x);
        const screenY1 = toScreenY(entity.y);
        const screenX2 = entity.x2 !== undefined ? toScreenX(entity.x2) : screenX1 + 100 * scale;
        const screenY2 = entity.y2 !== undefined ? toScreenY(entity.y2) : screenY1 + 100 * scale;
        
        const rectX = Math.min(screenX1, screenX2);
        const rectY = Math.min(screenY1, screenY2);
        const width = Math.abs(screenX2 - screenX1);
        const height = Math.abs(screenY2 - screenY1);
        
        ctx.save();
        ctx.strokeStyle = isSelected ? '#fbbf24' : '#f59e0b'; // Amber
        ctx.fillStyle = '#f59e0b20';
        ctx.lineWidth = Math.max(2 / scale, 1);
        ctx.setLineDash([8, 4]);
        ctx.strokeRect(rectX, rectY, width, height);
        ctx.fillRect(rectX, rectY, width, height);
        ctx.setLineDash([]);
        
        // "OLE" yazısı
        const fontSize = Math.max(12, 10 * scale);
        ctx.font = `${fontSize}px Arial`;
        ctx.fillStyle = isSelected ? '#fbbf24' : '#f59e0b';
        ctx.textAlign = 'center';
        ctx.fillText('📎 OLE Object', rectX + width / 2, rectY + height / 2);
        ctx.textAlign = 'left';
        ctx.restore();
        return;
      }
      else if (entity.type === 'WIPEOUT') {
        // WIPEOUT - beyaz alan (maskeleme)
        if (!entity.vertices || entity.vertices.length < 3) return;
        
        // Geçerli vertices filtrele
        const validVerts = entity.vertices.filter(v => 
          v.x !== undefined && v.y !== undefined &&
          !isNaN(v.x) && !isNaN(v.y) &&
          isFinite(v.x) && isFinite(v.y)
        );
        if (validVerts.length < 3) return;
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(toScreenX(validVerts[0].x), toScreenY(validVerts[0].y));
        for (let i = 1; i < validVerts.length; i++) {
          ctx.lineTo(toScreenX(validVerts[i].x), toScreenY(validVerts[i].y));
        }
        ctx.closePath();
        ctx.fillStyle = '#1e1e1e'; // Arka plan rengi ile aynı
        ctx.fill();
        if (isSelected) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      else if (entity.type === 'RTEXT') {
        // RTEXT - referanslı metin
        // Koordinat kontrolü
        if (entity.x === undefined || entity.y === undefined ||
            isNaN(entity.x) || isNaN(entity.y) ||
            !isFinite(entity.x) || !isFinite(entity.y)) return;
            
        const screenX = toScreenX(entity.x);
        const screenY = toScreenY(entity.y);
        const fontSize = (entity.height || 2.5) * scale;
        
        if (fontSize < 1) return;
        
        ctx.save();
        ctx.font = `${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = isSelected ? '#fbbf24' : '#22c55e'; // Yeşil
        ctx.textBaseline = 'bottom';
        ctx.fillText(entity.text || 'RTEXT', screenX, screenY);
        ctx.restore();
        return;
      }
      else {
        // Tanınmayan entity tipi - boş path çizme
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

  // Wheel event listener (passive: false ile) - zoom için preventDefault gerekli
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const wheelHandler = (e) => {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const zoomFactor = 1 - e.deltaY * zoomSensitivity;
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const newScale = scale * zoomFactor;
      
      if (newScale < 0.001 || newScale > 1000) return;

      const newOffsetX = mouseX - (mouseX - offset.x) * zoomFactor;
      const newOffsetY = mouseY - (mouseY - offset.y) * zoomFactor;

      setScale(newScale);
      setOffset({ x: newOffsetX, y: newOffsetY });
    };
    
    // passive: false ile ekle - bu preventDefault'un çalışmasını sağlar
    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    
    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [scale, offset]);


  // --- MOUSE HANDLERS ---
  
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

  // İki parmak arası mesafeyi hesapla
  const getPinchDistance = (touches) => {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // İki parmak ortasını hesapla
  const getPinchCenter = (touches, rect) => {
    if (touches.length < 2) return null;
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top
    };
  };

  // Touch Start Handler
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      // İki parmak - Pinch zoom başlat
      e.preventDefault();
      const distance = getPinchDistance(e.touches);
      setLastPinchDistance(distance);
      setIsPinching(true);
      setIsDragging(false);
    } else if (e.touches.length === 1) {
      // Tek parmak - Normal işlem
      setIsPinching(false);
      handleMouseDown(e);
    }
  };

  // Touch Move Handler
  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && isPinching) {
      // Pinch zoom
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const newDistance = getPinchDistance(e.touches);
      const center = getPinchCenter(e.touches, rect);
      
      if (lastPinchDistance && newDistance && center) {
        const scaleFactor = newDistance / lastPinchDistance;
        
        // Zoom merkezi etrafında scale
        const worldX = toWorldX(center.x);
        const worldY = toWorldY(center.y);
        
        const newScale = Math.max(0.001, Math.min(1000, scale * scaleFactor));
        
        // Yeni offset hesapla (zoom merkezi sabit kalacak şekilde)
        const newOffsetX = center.x - (worldX * newScale);
        const newOffsetY = center.y - (-worldY * newScale);
        
        setScale(newScale);
        setOffset({ x: newOffsetX, y: newOffsetY });
        setLastPinchDistance(newDistance);
      }
    } else if (e.touches.length === 1 && !isPinching) {
      // Tek parmak - Normal hareket
      handleMouseMove(e);
    }
  };

  // Touch End Handler
  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      setIsPinching(false);
      setLastPinchDistance(null);
    }
    if (e.touches.length === 0) {
      handleMouseUp(e);
    }
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
    
    // ViewMode aktifken sadece pan'a izin ver
    if (viewMode) {
      // İki parmakla veya orta tık ile pan
      if (button === 1 || isTouchEvent) {
        setIsDragging(true);
        setLastMousePos({ x: clientX, y: clientY });
      }
      return;
    }
    
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
      
      // ESC tuşu ile aktif çizimi veya seçimi iptal et
      if (e.key === 'Escape') {
        e.preventDefault();
        
        // Önce aktif çizim varsa iptal et
        if (activeTool !== 'select' || currentPolyline.length > 0 || currentDrawingState) {
          cancelActiveDrawing();
          return;
        }
        
        // Seçili entity varsa seçimi temizle
        if (selectedEntities.size > 0) {
          setSelectedEntities(new Set());
          return;
        }
        
        // Seçim kutusu çiziliyorsa iptal et
        if (isSelectionDragging) {
          setIsSelectionDragging(false);
          setSelectionRect(null);
          setSelectionStart(null);
          return;
        }
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
          // F12: Tarayıcı DevTools - engellemiyoruz (Console erişimi için)
          // e.preventDefault(); // DevTools açılabilsin
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
          <span className="text-xs text-gray-400">E:{entities.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Görüntüleme/Düzenleme Modu Toggle */}
          <button 
            onClick={() => setViewMode(prev => !prev)} 
            className={`p-2.5 rounded-lg touch-manipulation transition-all duration-300 ${
              viewMode 
                ? 'bg-blue-600 text-white shadow-lg' 
                : 'bg-orange-500 text-white shadow-lg'
            }`}
            title={viewMode ? "Görüntüleme Modu (Tıkla: Düzenleme)" : "Düzenleme Modu (Tıkla: Görüntüleme)"}
          >
            {viewMode ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          {/* Proje Yöneticisi butonu (...) */}
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="p-2.5 bg-gray-700/80 rounded-lg text-gray-300 active:bg-gray-600 touch-manipulation"
            title="Proje Yöneticisi"
          >
            <MoreHorizontal size={20} />
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
            disabled={selectedEntities.size === 0 || viewMode}
          />
          
          <ToolButton icon={Maximize} title="Ekrana Sığdır (Fit to Screen)" onClick={() => fitToScreen()} />
          <ToolButton icon={ZoomIn} title="Yakınlaştır" onClick={() => setScale(s => s * 1.2)} />
          <ToolButton icon={ZoomOut} title="Uzaklaştır" onClick={() => setScale(s => s / 1.2)} />
          <div className="h-px w-8 bg-gray-600 my-2"></div>
        
          {/* Polyline Çizim Aracı (Faz 2.1) */}
          <ToolButton 
              icon={PenTool} 
              title={viewMode ? "Görüntüleme modunda çizim yapılamaz" : "Polyline Çiz (Sağ Tık İptal, Çift Tık Bitir)"} 
              active={activeTool === 'polyline'} 
              disabled={viewMode}
              onClick={() => { 
                  if (viewMode) return;
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
              title={viewMode ? "Görüntüleme modunda çizim yapılamaz" : "Dikdörtgen Çiz (2 Tıkla: Başlangıç/Bitiş)"} 
              active={activeTool === 'rectangle'} 
              disabled={viewMode}
              onClick={() => { if (!viewMode) { setActiveTool('rectangle'); setCurrentDrawingState(null); setCurrentPolyline([]); } }} 
          />

          {/* Circle Çizim Aracı (Faz 2.1) */}
          <ToolButton 
              icon={Circle} 
              title={viewMode ? "Görüntüleme modunda çizim yapılamaz" : "Daire Çiz (2 Tıkla: Merkez/Yarıçap)"} 
              active={activeTool === 'circle'} 
              disabled={viewMode}
              onClick={() => { if (!viewMode) { setActiveTool('circle'); setCurrentDrawingState(null); setCurrentPolyline([]); } }} 
          />

          {/* Polyline'ı Bitir Butonu */}
          {currentPolyline.length > 0 && activeTool === 'polyline' && (
              <button 
                  title="Çizimi Bitir (Çift Tıklama Veya Bu Buton)"
                  onClick={finishPolyline}
                  className="p-3 rounded-xl text-white animate-pulse shadow-lg touch-manipulation transition-all duration-300 min-w-11 min-h-11 flex items-center justify-center"
                  style={{background: 'linear-gradient(135deg, #16a34a 0%, #059669 100%)', boxShadow: '0 10px 15px -3px rgba(34, 197, 94, 0.3)'}}
              >
                  <PlusCircle size={20} />
              </button>
          )}
          
          <div className="mt-auto flex flex-col gap-2">
               {/* View/Edit Mode Toggle */}
               <ToolButton 
                  icon={viewMode ? Eye : EyeOff} 
                  title={viewMode ? "Görüntüleme Modu (Tıkla: Düzenleme)" : "Düzenleme Modu (Tıkla: Görüntüleme)"} 
                  active={viewMode} 
                  onClick={() => setViewMode(prev => !prev)} 
                />
               
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
               <label className="cursor-pointer p-3 rounded-xl text-white flex items-center justify-center touch-manipulation shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl min-w-11 min-h-11" style={{background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'}} title="CAD Dosyası Yükle (DXF/DWG)">
                  <Upload size={20} />
                  <input 
                    type="file" 
                    accept=".dxf,.dwg" 
                    className="hidden" 
                    onChange={handleFileUpload} 
                    onClick={(e) => { e.target.value = null; }} 
                  />
               </label>
               
               {/* Resim Ekleme */}
               <label className={`cursor-pointer p-3 rounded-xl text-white flex items-center justify-center touch-manipulation shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl min-w-11 min-h-11 ${viewMode ? 'opacity-40 cursor-not-allowed' : ''}`} style={{background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}} title={viewMode ? "Görüntüleme modunda resim eklenemez" : "Resim Ekle (PNG, JPEG, GIF, WebP, SVG)"}>
                  <span className="text-lg">🖼️</span>
                  <input 
                    type="file" 
                    accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" 
                    className="hidden" 
                    onChange={handleImageUpload} 
                    onClick={(e) => { if (viewMode) { e.preventDefault(); return; } e.target.value = null; }} 
                    disabled={viewMode}
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
          {viewMode && <span className="ml-3 font-bold text-cyan-400">| 👁 GÖRÜNTÜLEME</span>}
          {!viewMode && <span className="ml-3 font-bold text-green-400">| ✏️ DÜZENLEME</span>}
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setIsDragging(false); setIsSelectionDragging(false); setSelectionRect(null); setSelectionMode(null); setIsPinching(false); }}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
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
          title="Proje Yöneticisi"
        >
          <MoreHorizontal size={22} />
        </button>
      }
      
      {/* MOBİL ALT TOOLBAR - Basitleştirilmiş */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-800/98 backdrop-blur-md border-t border-gray-700/50 px-3 py-3 z-20 safe-area-pb">
        {viewMode ? (
          /* GÖRÜNTÜLEME MODU - Sadece temel araçlar */
          <div className="flex items-center justify-around gap-2">
            {/* Sığdır */}
            <button 
              onClick={() => fitToScreen()}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gray-700/80 rounded-xl text-gray-200 active:bg-gray-600 touch-manipulation transition-all"
              title="Ekrana Sığdır"
            >
              <Maximize size={20} />
              <span className="text-sm font-medium">Sığdır</span>
            </button>
            
            {/* Yakınlaştır */}
            <button 
              onClick={() => setScale(s => s * 1.5)}
              className="p-3 bg-gray-700/80 rounded-xl text-gray-200 active:bg-gray-600 touch-manipulation min-w-12"
              title="Yakınlaştır"
            >
              <ZoomIn size={22} />
            </button>
            
            {/* Uzaklaştır */}
            <button 
              onClick={() => setScale(s => s / 1.5)}
              className="p-3 bg-gray-700/80 rounded-xl text-gray-200 active:bg-gray-600 touch-manipulation min-w-12"
              title="Uzaklaştır"
            >
              <ZoomOut size={22} />
            </button>
            
            {/* Dosya Yükle */}
            <label className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-white active:scale-95 touch-manipulation cursor-pointer transition-all" style={{background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'}} title="Dosya Yükle">
              <Upload size={20} />
              <span className="text-sm font-medium">Yükle</span>
              <input 
                type="file" 
                accept=".dxf,.dwg" 
                className="hidden" 
                onChange={handleFileUpload} 
                onClick={(e) => { e.target.value = null; }} 
              />
            </label>
          </div>
        ) : (
          /* DÜZENLEME MODU - Çizim araçları */
          <>
            <div className="flex items-center justify-around gap-1">
              {/* Seç */}
              <ToolButton icon={MousePointer2} title="Seç" active={activeTool === 'select'} onClick={cancelActiveDrawing} />
              
              {/* Sığdır */}
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
              
              {/* Sil */}
              <ToolButton 
                  icon={Trash2} 
                  title="Sil" 
                  disabled={selectedEntities.size === 0}
                  onClick={() => {
                    if (selectedEntities.size > 0) {
                      const remainingEntities = entities.filter(entity => !selectedEntities.has(entity.id));
                      setEntities(remainingEntities);
                      setSelectedEntities(new Set());
                      addToHistory(remainingEntities);
                    }
                  }} 
              />
              
              {/* Upload */}
              <label className="cursor-pointer p-3 rounded-xl text-white flex items-center justify-center touch-manipulation shadow-lg min-w-11 min-h-11 active:scale-95" style={{background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'}} title="Dosya Yükle">
                <Upload size={20} />
                <input 
                  type="file" 
                  accept=".dxf,.dwg" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                  onClick={(e) => { e.target.value = null; }} 
                />
              </label>
              
              {/* Resim Ekle */}
              <label className="cursor-pointer p-3 rounded-xl text-white flex items-center justify-center touch-manipulation shadow-lg min-w-11 min-h-11 active:scale-95" style={{background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'}} title="Resim Ekle">
                <span className="text-lg">🖼️</span>
                <input 
                  type="file" 
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" 
                  className="hidden" 
                  onChange={handleImageUpload} 
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
          </>
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