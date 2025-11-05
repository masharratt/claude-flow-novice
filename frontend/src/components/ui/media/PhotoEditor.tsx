import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '../button/Button';
import { cn } from '@/lib/utils';

export interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: number;
  sepia: number;
  hueRotate: number;
}

export interface CropSettings {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TransformSettings {
  rotate: number;
  scaleX: number;
  scaleY: number;
}

interface PhotoEditorProps {
  imageUrl: string;
  className?: string;
  onImageChange?: (editedImageUrl: string) => void;
  onSettingsChange?: (settings: {
    filter: FilterSettings;
    crop: CropSettings;
    transform: TransformSettings;
  }) => void;
  allowCrop?: boolean;
  allowFilters?: boolean;
  allowTransform?: boolean;
}

const DEFAULT_FILTERS: FilterSettings = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
  hueRotate: 0,
};

const DEFAULT_CROP: CropSettings = {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
};

const DEFAULT_TRANSFORM: TransformSettings = {
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
};

export const PhotoEditor: React.FC<PhotoEditorProps> = ({
  imageUrl,
  className,
  onImageChange,
  onSettingsChange,
  allowCrop = true,
  allowFilters = true,
  allowTransform = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const [filters, setFilters] = useState<FilterSettings>(DEFAULT_FILTERS);
  const [crop, setCrop] = useState<CropSettings>(DEFAULT_CROP);
  const [transform, setTransform] = useState<TransformSettings>(DEFAULT_TRANSFORM);
  const [activeTab, setActiveTab] = useState<'filters' | 'crop' | 'transform'>('filters');

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setOriginalImage(img);
      setIsLoading(false);
    };
    img.onerror = () => {
      setIsLoading(false);
    };
    setIsLoading(true);
    img.src = imageUrl;
  }, [imageUrl]);

  // Apply filters and transformations
  const applyEdits = useCallback(() => {
    if (!originalImage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = originalImage.width;
    canvas.height = originalImage.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Save context state
    ctx.save();

    // Apply transformations
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((transform.rotate * Math.PI) / 180);
    ctx.scale(transform.scaleX, transform.scaleY);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    // Apply filters
    const filterString = `
      brightness(${filters.brightness}%)
      contrast(${filters.contrast}%)
      saturate(${filters.saturation}%)
      blur(${filters.blur}px)
      grayscale(${filters.grayscale}%)
      sepia(${filters.sepia}%)
      hue-rotate(${filters.hueRotate}deg)
    `;
    ctx.filter = filterString;

    // Draw image
    ctx.drawImage(originalImage, 0, 0);

    // Restore context state
    ctx.restore();

    // Convert to data URL
    const editedImageUrl = canvas.toDataURL('image/png', 0.9);
    onImageChange?.(editedImageUrl);
  }, [originalImage, filters, transform, onImageChange]);

  // Apply edits when settings change
  useEffect(() => {
    applyEdits();
    onSettingsChange?.({ filters, crop, transform });
  }, [filters, crop, transform, applyEdits, onSettingsChange]);

  const handleFilterChange = (filterName: keyof FilterSettings, value: number) => {
    setFilters(prev => ({ ...prev, [filterName]: value }));
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setCrop(DEFAULT_CROP);
    setTransform(DEFAULT_TRANSFORM);
  };

  const handleRotate = (degrees: number) => {
    setTransform(prev => ({
      ...prev,
      rotate: (prev.rotate + degrees) % 360
    }));
  };

  const handleFlip = (axis: 'x' | 'y') => {
    setTransform(prev => ({
      ...prev,
      [`scale${axis.toUpperCase()}`]: prev[`scale${axis.toUpperCase()}` as keyof TransformSettings] * -1
    }));
  };

  const handleCropDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCrop(prev => ({
      ...prev,
      x: Math.max(0, Math.min(100 - prev.width, x - prev.width / 2)),
      y: Math.max(0, Math.min(100 - prev.height, y - prev.height / 2))
    }));
  };

  const handleCropResize = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    // Simplified resize handling
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;

    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setCrop(prev => {
      const newCrop = { ...prev };
      
      if (handle.includes('right')) {
        newCrop.width = Math.max(10, Math.min(100 - prev.x, x - prev.x));
      }
      if (handle.includes('bottom')) {
        newCrop.height = Math.max(10, Math.min(100 - prev.y, y - prev.y));
      }
      
      return newCrop;
    });
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <span className="ml-2">Loading image...</span>
      </div>
    );
  }

  return (
    <div className={cn('photo-editor bg-white rounded-lg shadow-lg', className)}>
      <div className="flex flex-col lg:flex-row">
        {/* Image Preview */}
        <div className="flex-1 p-4">
          <div className="relative bg-gray-100 rounded-lg overflow-hidden">
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Edit preview"
              className="w-full h-auto max-h-96 object-contain"
              style={{
                filter: `
                  brightness(${filters.brightness}%)
                  contrast(${filters.contrast}%)
                  saturate(${filters.saturation}%)
                  blur(${filters.blur}px)
                  grayscale(${filters.grayscale}%)
                  sepia(${filters.sepia}%)
                  hue-rotate(${filters.hueRotate}deg)
                `,
                transform: `
                  rotate(${transform.rotate}deg)
                  scaleX(${transform.scaleX})
                  scaleY(${transform.scaleY})
                `
              }}
            />

            {/* Crop Overlay */}
            {activeTab === 'crop' && allowCrop && (
              <div
                className="absolute inset-0 cursor-move"
                onMouseDown={(e) => {
                  setIsDragging(true);
                  setDragStart({ x: e.clientX, y: e.clientY });
                }}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                onMouseMove={handleCropDrag}
              >
                <div
                  className="absolute border-2 border-blue-500 bg-blue-500 bg-opacity-20"
                  style={{
                    left: `${crop.x}%`,
                    top: `${crop.y}%`,
                    width: `${crop.width}%`,
                    height: `${crop.height}%`
                  }}
                >
                  {/* Resize handles */}
                  <div
                    className="absolute w-3 h-3 bg-blue-500 border border-white -bottom-1 -right-1 cursor-se-resize"
                    onMouseDown={(e) => handleCropResize(e, 'bottom-right')}
                  />
                  <div
                    className="absolute w-3 h-3 bg-blue-500 border border-white -bottom-1 -left-1 cursor-sw-resize"
                    onMouseDown={(e) => handleCropResize(e, 'bottom-left')}
                  />
                  <div
                    className="absolute w-3 h-3 bg-blue-500 border border-white -top-1 -right-1 cursor-ne-resize"
                    onMouseDown={(e) => handleCropResize(e, 'top-right')}
                  />
                  <div
                    className="absolute w-3 h-3 bg-blue-500 border border-white -top-1 -left-1 cursor-nw-resize"
                    onMouseDown={(e) => handleCropResize(e, 'top-left')}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Hidden canvas for image processing */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Controls */}
        <div className="w-full lg:w-80 p-4 border-t lg:border-t-0 lg:border-l border-gray-200">
          <div className="space-y-4">
            {/* Tab Navigation */}
            <div className="flex space-x-2 border-b border-gray-200">
              {allowFilters && (
                <button
                  className={cn(
                    'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                    activeTab === 'filters'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                  onClick={() => setActiveTab('filters')}
                >
                  Filters
                </button>
              )}
              {allowCrop && (
                <button
                  className={cn(
                    'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                    activeTab === 'crop'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                  onClick={() => setActiveTab('crop')}
                >
                  Crop
                </button>
              )}
              {allowTransform && (
                <button
                  className={cn(
                    'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                    activeTab === 'transform'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                  onClick={() => setActiveTab('transform')}
                >
                  Transform
                </button>
              )}
            </div>

            {/* Filter Controls */}
            {activeTab === 'filters' && allowFilters && (
              <div className="space-y-3">
                {Object.entries(filters).map(([filterName, value]) => (
                  <div key={filterName}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {filterName.charAt(0).toUpperCase() + filterName.slice(1).replace(/([A-Z])/g, ' $1')}
                      <span className="ml-1 text-gray-500">({value}%)</span>
                    </label>
                    <input
                      type="range"
                      min={filterName === 'blur' ? 0 : 0}
                      max={filterName === 'blur' ? 20 : 200}
                      value={value}
                      onChange={(e) => handleFilterChange(filterName as keyof FilterSettings, Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      aria-label={`${filterName} adjustment`}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Crop Controls */}
            {activeTab === 'crop' && allowCrop && (
              <div className="space-y-3">
                <div className="text-sm text-gray-600">
                  Drag the crop area to position it. Drag corners to resize.
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="font-medium">X:</span> {crop.x.toFixed(1)}%
                  </div>
                  <div>
                    <span className="font-medium">Y:</span> {crop.y.toFixed(1)}%
                  </div>
                  <div>
                    <span className="font-medium">Width:</span> {crop.width.toFixed(1)}%
                  </div>
                  <div>
                    <span className="font-medium">Height:</span> {crop.height.toFixed(1)}%
                  </div>
                </div>
              </div>
            )}

            {/* Transform Controls */}
            {activeTab === 'transform' && allowTransform && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => handleRotate(-90)}
                    variant="outline"
                    size="sm"
                  >
                    Rotate Left
                  </Button>
                  <Button
                    onClick={() => handleRotate(90)}
                    variant="outline"
                    size="sm"
                  >
                    Rotate Right
                  </Button>
                  <Button
                    onClick={() => handleFlip('x')}
                    variant="outline"
                    size="sm"
                  >
                    Flip Horizontal
                  </Button>
                  <Button
                    onClick={() => handleFlip('y')}
                    variant="outline"
                    size="sm"
                  >
                    Flip Vertical
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rotation: {transform.rotate}°
                    </label>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={transform.rotate}
                      onChange={(e) => setTransform(prev => ({ ...prev, rotate: Number(e.target.value) }))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      aria-label="Rotation adjustment"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-4 border-t border-gray-200 space-y-2">
              <Button
                onClick={handleReset}
                variant="outline"
                className="w-full"
              >
                Reset All
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoEditor;