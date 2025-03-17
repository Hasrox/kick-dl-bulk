import { spawn } from 'child_process';
import pathToFfmpeg from 'ffmpeg-static';
import { DEFAULT_DOWNLOAD_OPTIONS } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import cliProgress from 'cli-progress';
import colors from '../lib/colors.js';

// Check if file exists
const fileExists = (filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
};

// Create directory if it doesn't exist
const ensureDirectoryExists = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

// Format file size to human-readable format
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
};

// Calculate download speed
const calculateSpeed = (bytesDownloaded, elapsedTime) => {
  const bytesPerSecond = bytesDownloaded / (elapsedTime / 1000);
  return formatFileSize(bytesPerSecond) + '/s';
};

// Generate simplified filename with original title, duration and views 
export const generateClipFileName = (username, originalTitle, durationSec, views) => {
  // Sanitize title minimally for safe filenames
  const sanitizedTitle = originalTitle
    .replace(/[<>:"/\\|?*]/g, '_') // Replace only illegal filename characters
    .trim();
  
  return `${username}_${sanitizedTitle}_${durationSec}sec_${views}views`;
};

export const Downloader = (
  confirm = false,
  url,
  options = DEFAULT_DOWNLOAD_OPTIONS,
  progressBar = null,
  batchInfo = null,
  forceDownload = false
) => {
  return new Promise((resolve, reject) => {
    if (!confirm) {
      resolve({
        status: false,
        message: 'Download canceled',
        filePath: null
      });
      return;
    }

    // Ensure output directory exists
    ensureDirectoryExists(options.outputDir);
    
    // Create full file path
    const filePath = path.join(options.outputDir, `${options.name}.mp4`);
    
    // Check if file already exists
    if (fileExists(filePath) && !forceDownload) {
      resolve({
        status: true,
        message: `File already exists: ${filePath}`,
        filePath,
        skipped: true
      });
      return;
    }

    const args = [
      '-y',
      '-i',
      url,
      '-threads',
      '0',
      '-c',
      'copy',
      '-progress',
      'pipe:1',
      filePath
    ];

    const command = pathToFfmpeg;
    const ffmpegProcess = spawn(command, args);
    
    let duration = 0;
    let started = false;
    let lastBytesProcessed = 0;
    let startTime = Date.now();
    let lastUpdateTime = startTime;
    let currentSpeed = '0 B/s';
    
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Extract duration information
      const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        duration = (hours * 3600) + (minutes * 60) + seconds;
      }
    });

    ffmpegProcess.stdout.on('data', (data) => {
      const output = data.toString();
      
      // Extract time and size information
      const timeMatch = output.match(/out_time=\s*(\d{2}):(\d{2}):(\d{2}\.\d{6})/);
      const sizeMatch = output.match(/total_size=\s*(\d+)/);
      
      if (timeMatch && duration > 0 && progressBar) {
        if (!started) {
          progressBar.start(Math.floor(duration), 0, {
            filename: options.name,
            speed: '0 B/s'
          });
          started = true;
        }
        
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const currentTime = (hours * 3600) + (minutes * 60) + seconds;
        
        // Calculate download speed
        const now = Date.now();
        if (sizeMatch && now - lastUpdateTime > 500) { // Update every 500ms
          const bytesProcessed = parseInt(sizeMatch[1]);
          const bytesDownloaded = bytesProcessed - lastBytesProcessed;
          const elapsedTime = now - lastUpdateTime;
          
          if (bytesDownloaded > 0 && elapsedTime > 0) {
            currentSpeed = calculateSpeed(bytesDownloaded, elapsedTime);
            lastBytesProcessed = bytesProcessed;
            lastUpdateTime = now;
          }
        }
        
        // Calculate remaining time for batch if batch info is provided
        if (batchInfo) {
          const elapsed = (now - batchInfo.startTime) / 1000;
          const progress = batchInfo.completed / batchInfo.total;
          if (progress > 0) {
            const estimatedTotal = elapsed / progress;
            batchInfo.eta = Math.max(0, Math.round(estimatedTotal - elapsed));
          }
        }
        
        progressBar.update(Math.min(Math.floor(currentTime), Math.floor(duration)), {
          filename: options.name.length > 25 ? options.name.substring(0, 22) + '...' : options.name,
          speed: currentSpeed
        });
      }
    });

    ffmpegProcess.on('close', (code) => {
      if (code !== 0) {
        reject({
          status: false,
          message: 'Download failed',
          filePath: null
        });
        return;
      }

      // Update batch info
      if (batchInfo) {
        batchInfo.completed++;
      }

      resolve({
        status: true,
        message: `Download completed: ${filePath}`,
        filePath
      });
    });

    ffmpegProcess.on('error', (error) => {
      reject({
        status: false,
        message: error.toString(),
        filePath: null
      });
    });
  });
};
