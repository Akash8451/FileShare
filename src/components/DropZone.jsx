import { useRef, useState, useCallback } from 'react';
import { HiOutlineCloudArrowUp } from 'react-icons/hi2';
import { formatBytes } from '../utils/helpers';
import './DropZone.css';

export default function DropZone({ onFilesSelected, disabled }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFiles(files);
      onFilesSelected(files);
    }
  }, [disabled, onFilesSelected]);

  const handleFileInput = useCallback((e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedFiles(files);
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  const handleClick = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const getFileTypeIcon = (file) => {
    if (!file) return '📎';
    const type = file.type;
    if (type.startsWith('image/')) return '🖼️';
    if (type.startsWith('video/')) return '🎬';
    if (type.startsWith('audio/')) return '🎵';
    if (type.includes('pdf')) return '📄';
    if (type.includes('zip') || type.includes('rar') || type.includes('tar')) return '📦';
    return '📎';
  };

  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);

  return (
    <div
      className={`dropzone ${isDragging ? 'dropzone--dragging' : ''} ${disabled ? 'dropzone--disabled' : ''} ${selectedFiles.length > 0 ? 'dropzone--has-file' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      id="file-dropzone"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="dropzone__input"
        onChange={handleFileInput}
        id="file-input"
      />

      {selectedFiles.length > 0 ? (
        <div className="dropzone__file-info animate-fade-in">
          {selectedFiles.length === 1 ? (
            <>
              <span className="dropzone__file-icon">{getFileTypeIcon(selectedFiles[0])}</span>
              <div className="dropzone__file-details">
                <span className="dropzone__file-name">{selectedFiles[0].name}</span>
                <span className="dropzone__file-size">{formatBytes(selectedFiles[0].size)}</span>
              </div>
            </>
          ) : (
            <>
              <span className="dropzone__file-icon">📦</span>
              <div className="dropzone__file-details">
                <span className="dropzone__file-name">{selectedFiles.length} files selected</span>
                <span className="dropzone__file-size">
                  {formatBytes(totalSize)} total
                </span>
                <div className="dropzone__file-list">
                  {selectedFiles.slice(0, 3).map((f, i) => (
                    <span key={i} className="dropzone__file-list-item">
                      {getFileTypeIcon(f)} {f.name}
                    </span>
                  ))}
                  {selectedFiles.length > 3 && (
                    <span className="dropzone__file-list-more">
                      +{selectedFiles.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
          <span className="dropzone__change-hint">Click to change</span>
        </div>
      ) : (
        <div className="dropzone__placeholder">
          <div className="dropzone__upload-icon">
            <HiOutlineCloudArrowUp size={32} />
          </div>
          <p className="dropzone__text">
            <strong>Drop files here</strong> or click to browse
          </p>
          <span className="dropzone__hint">Multiple files supported • No size limit</span>
        </div>
      )}
    </div>
  );
}
