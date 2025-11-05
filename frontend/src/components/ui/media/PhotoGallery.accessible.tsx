import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../button/Button';
import { cn } from '@/lib/utils';

interface Photo {
  id: string;
  src: string;
  alt: string;
  title?: string;
  description?: string;
}

interface PhotoGalleryProps {
  photos: Photo[];
  className?: string;
  onPhotoSelect?: (photo: Photo) => void;
  allowMultiple?: boolean;
  maxSelection?: number;
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  photos,
  className,
  onPhotoSelect,
  allowMultiple = false,
  maxSelection = 10
}) => {
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);
  const galleryRef = useRef<HTMLDivElement>(null);

  const handlePhotoClick = (photo: Photo, index: number) => {
    if (allowMultiple) {
      const newSelection = new Set(selectedPhotos);
      if (newSelection.has(photo.id)) {
        newSelection.delete(photo.id);
      } else if (newSelection.size < maxSelection) {
        newSelection.add(photo.id);
      }
      setSelectedPhotos(newSelection);
      
      const selectedPhoto = photos.find(p => p.id === photo.id);
      if (selectedPhoto) onPhotoSelect?.(selectedPhoto);
    } else {
      setSelectedPhotos(new Set([photo.id]));
      onPhotoSelect?.(photo);
    }
    setFocusedIndex(index);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % photos.length);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + photos.length) % photos.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handlePhotoClick(photos[index], index);
        break;
      case 'Escape':
        e.preventDefault();
        setSelectedPhotos(new Set());
        break;
    }
  };

  useEffect(() => {
    const focusedElement = galleryRef.current?.querySelector(
      `[data-index="${focusedIndex}"]`
    ) as HTMLElement;
    focusedElement?.focus();
  }, [focusedIndex]);

  const selectedCount = selectedPhotos.size;
  const isMaxSelected = allowMultiple && selectedCount >= maxSelection;

  return (
    <div
      ref={galleryRef}
      className={cn(
        'photo-gallery',
        'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4',
        'p-4',
        className
      )}
      role="grid"
      aria-label="Photo gallery"
      aria-rowcount={Math.ceil(photos.length / 4)}
      aria-colcount={4}
    >
      <div className="col-span-full mb-4">
        <div className="flex items-center justify-between">
          <h2 id="gallery-heading" className="text-xl font-semibold">
            Photo Gallery ({photos.length} photos)
          </h2>
          {allowMultiple && (
            <div 
              className="text-sm text-gray-600"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {selectedCount} of {maxSelection} selected
              {isMaxSelected && (
                <span className="ml-2 text-amber-600 font-medium">
                  (Maximum reached)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {photos.map((photo, index) => {
        const isSelected = selectedPhotos.has(photo.id);
        const row = Math.floor(index / 4) + 1;
        const col = (index % 4) + 1;

        return (
          <div
            key={photo.id}
            data-index={index}
            className={cn(
              'relative group cursor-pointer rounded-lg overflow-hidden',
              'border-2 transition-all duration-200',
              'focus:outline-none focus:ring-4 focus:ring-blue-500 focus:ring-opacity-50',
              isSelected
                ? 'border-blue-500 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-gray-300'
            )}
            role="gridcell"
            aria-rowindex={row}
            aria-colindex={col}
            aria-selected={isSelected}
            tabIndex={focusedIndex === index ? 0 : -1}
            onClick={() => handlePhotoClick(photo, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            aria-label={`${photo.title || photo.alt}, ${isSelected ? 'selected' : 'not selected'}`}
          >
            <div className="aspect-square relative">
              <img
                src={photo.src}
                alt={photo.alt}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              
              {/* Selection indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-200" />
            </div>

            {/* Photo info */}
            {(photo.title || photo.description) && (
              <div className="p-3 bg-white">
                {photo.title && (
                  <h3 className="font-medium text-sm text-gray-900 truncate">
                    {photo.title}
                  </h3>
                )}
                {photo.description && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {photo.description}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Empty state */}
      {photos.length === 0 && (
        <div className="col-span-full text-center py-12">
          <div
            className="text-gray-500"
            role="img"
            aria-label="No photos available"
          >
            <svg
              className="w-16 h-16 mx-auto mb-4 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p>No photos available</p>
          </div>
        </div>
      )}

      {/* Keyboard navigation help */}
      <div className="col-span-full mt-4">
        <div className="text-xs text-gray-500" role="note">
          Use arrow keys to navigate, Space or Enter to select, Escape to clear selection
        </div>
      </div>
    </div>
  );
};

export default PhotoGallery;