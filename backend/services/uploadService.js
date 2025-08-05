const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer configuration for local storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    
    // Determine upload path based on file type
    if (file.fieldname === 'profilePicture') {
      uploadPath += 'profiles/';
    } else if (file.fieldname === 'storyMedia') {
      uploadPath += 'stories/';
    } else if (file.fieldname === 'messageMedia') {
      uploadPath += 'messages/';
    } else if (file.fieldname === 'voiceNote') {
      uploadPath += 'voice/';
    } else {
      uploadPath += 'documents/';
    }
    
    // Create directory if it doesn't exist
    const fullPath = path.join(__dirname, '..', uploadPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Define allowed file types
  const allowedTypes = {
    profilePicture: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    storyMedia: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'],
    messageMedia: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'],
    voiceNote: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a'],
    document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
  };
  
  const fieldAllowedTypes = allowedTypes[file.fieldname] || [];
  
  if (fieldAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type for ${file.fieldname}. Allowed types: ${fieldAllowedTypes.join(', ')}`), false);
  }
};

// Multer upload configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 10 // Maximum 10 files per request
  }
});

/**
 * Upload file to Cloudinary
 * @param {string} filePath - Local file path
 * @param {string} folder - Cloudinary folder
 * @param {string} resourceType - auto, image, video, raw
 * @returns {Promise<object>} - Cloudinary response
 */
const uploadToCloudinary = async (filePath, folder = 'chatapp', resourceType = 'auto') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: resourceType,
      quality: 'auto',
      fetch_format: 'auto'
    });
    
    // Delete local file after successful upload
    fs.unlinkSync(filePath);
    
    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      duration: result.duration
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    
    // Clean up local file on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - image, video, raw
 * @returns {Promise<object>} - Deletion result
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    
    return {
      success: result.result === 'ok',
      result: result.result
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Process image (resize, compress)
 * @param {string} inputPath - Input file path
 * @param {string} outputPath - Output file path
 * @param {object} options - Processing options
 * @returns {Promise<string>} - Output file path
 */
const processImage = async (inputPath, outputPath, options = {}) => {
  const Jimp = require('jimp');
  
  try {
    const image = await Jimp.read(inputPath);
    
    // Apply transformations
    if (options.width || options.height) {
      image.resize(options.width || Jimp.AUTO, options.height || Jimp.AUTO);
    }
    
    if (options.quality) {
      image.quality(options.quality);
    }
    
    // Save processed image
    await image.writeAsync(outputPath);
    
    return outputPath;
  } catch (error) {
    console.error('Image processing error:', error);
    throw error;
  }
};

/**
 * Process video (compress, thumbnail)
 * @param {string} inputPath - Input video path
 * @param {string} outputPath - Output video path
 * @param {object} options - Processing options
 * @returns {Promise<object>} - Processing result
 */
const processVideo = async (inputPath, outputPath, options = {}) => {
  const ffmpeg = require('fluent-ffmpeg');
  const ffmpegPath = require('ffmpeg-static');
  
  ffmpeg.setFfmpegPath(ffmpegPath);
  
  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);
    
    // Apply video processing options
    if (options.size) {
      command = command.size(options.size);
    }
    
    if (options.bitrate) {
      command = command.videoBitrate(options.bitrate);
    }
    
    // Generate thumbnail
    const thumbnailPath = outputPath.replace(path.extname(outputPath), '_thumb.jpg');
    
    command
      .screenshots({
        timestamps: ['00:00:01'],
        filename: path.basename(thumbnailPath),
        folder: path.dirname(thumbnailPath),
        size: '320x240'
      })
      .output(outputPath)
      .on('end', () => {
        resolve({
          videoPath: outputPath,
          thumbnailPath: thumbnailPath
        });
      })
      .on('error', (error) => {
        reject(error);
      })
      .run();
  });
};

/**
 * Get file info
 * @param {string} filePath - File path
 * @returns {object} - File information
 */
const getFileInfo = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const extension = path.extname(filePath).toLowerCase();
    
    return {
      size: stats.size,
      extension: extension,
      mimeType: getMimeType(extension),
      isImage: ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension),
      isVideo: ['.mp4', '.mov', '.avi', '.mkv'].includes(extension),
      isAudio: ['.mp3', '.wav', '.ogg', '.m4a'].includes(extension),
      isDocument: ['.pdf', '.doc', '.docx', '.txt'].includes(extension)
    };
  } catch (error) {
    return null;
  }
};

/**
 * Get MIME type from extension
 * @param {string} extension - File extension
 * @returns {string} - MIME type
 */
const getMimeType = (extension) => {
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
};

/**
 * Clean up old files
 * @param {string} directory - Directory to clean
 * @param {number} maxAge - Maximum age in milliseconds
 */
const cleanupOldFiles = (directory, maxAge = 7 * 24 * 60 * 60 * 1000) => {
  try {
    const files = fs.readdirSync(directory);
    const now = Date.now();
    
    files.forEach(file => {
      const filePath = path.join(directory, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Cleaned up old file: ${file}`);
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
  }
};

module.exports = {
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
  processImage,
  processVideo,
  getFileInfo,
  getMimeType,
  cleanupOldFiles
};
