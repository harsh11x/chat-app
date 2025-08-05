const express = require('express');
const path = require('path');
const fs = require('fs');
const { upload, uploadToCloudinary, processImage, processVideo, getFileInfo } = require('../services/uploadService');
const User = require('../models/User');
const router = express.Router();

/**
 * Upload profile picture
 */
router.post('/profile-picture', upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const userId = req.user._id;
    const filePath = req.file.path;
    
    // Process image (resize and compress)
    const processedPath = path.join(path.dirname(filePath), `processed_${path.basename(filePath)}`);
    await processImage(filePath, processedPath, {
      width: 500,
      height: 500,
      quality: 80
    });

    // Upload to Cloudinary (optional)
    let cloudinaryResult = null;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      cloudinaryResult = await uploadToCloudinary(processedPath, 'chatapp/profiles', 'image');
    }

    // Update user profile
    const user = await User.findById(userId);
    const profilePictureData = {
      url: cloudinaryResult?.success ? cloudinaryResult.url : `/uploads/profiles/${req.file.filename}`,
      publicId: cloudinaryResult?.publicId,
      uploadedAt: new Date()
    };

    // Store previous profile picture for cleanup
    if (user.profilePicture?.url) {
      if (!user.profilePictureHistory) {
        user.profilePictureHistory = [];
      }
      user.profilePictureHistory.push(user.profilePicture);
    }

    user.profilePicture = profilePictureData;
    await user.save();

    // Broadcast profile update via Socket.IO
    if (req.io) {
      req.io.emit('profile_updated', {
        userId: userId.toString(),
        profilePicture: profilePictureData,
        timestamp: new Date()
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile picture uploaded successfully',
      data: {
        profilePicture: profilePictureData
      }
    });

  } catch (error) {
    console.error('Profile picture upload error:', error);
    
    // Clean up files on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload profile picture',
      error: error.message
    });
  }
});

/**
 * Upload story media
 */
router.post('/story', upload.single('storyMedia'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No media file uploaded'
      });
    }

    const userId = req.user._id;
    const filePath = req.file.path;
    const fileInfo = getFileInfo(filePath);
    
    let processedData = {
      url: `/uploads/stories/${req.file.filename}`,
      type: fileInfo.isImage ? 'image' : fileInfo.isVideo ? 'video' : 'unknown',
      size: fileInfo.size,
      mimeType: fileInfo.mimeType,
      uploadedAt: new Date()
    };

    // Process based on file type
    if (fileInfo.isImage) {
      const processedPath = path.join(path.dirname(filePath), `processed_${path.basename(filePath)}`);
      await processImage(filePath, processedPath, {
        width: 1080,
        height: 1920,
        quality: 85
      });
      
      // Upload to Cloudinary
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        const cloudinaryResult = await uploadToCloudinary(processedPath, 'chatapp/stories', 'image');
        if (cloudinaryResult.success) {
          processedData.url = cloudinaryResult.url;
          processedData.publicId = cloudinaryResult.publicId;
        }
      }
    } else if (fileInfo.isVideo) {
      const processedPath = path.join(path.dirname(filePath), `processed_${path.basename(filePath)}`);
      const videoResult = await processVideo(filePath, processedPath, {
        size: '1080x1920',
        bitrate: '1000k'
      });
      
      processedData.thumbnail = `/uploads/stories/${path.basename(videoResult.thumbnailPath)}`;
      
      // Upload to Cloudinary
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        const cloudinaryResult = await uploadToCloudinary(processedPath, 'chatapp/stories', 'video');
        if (cloudinaryResult.success) {
          processedData.url = cloudinaryResult.url;
          processedData.publicId = cloudinaryResult.publicId;
          processedData.duration = cloudinaryResult.duration;
        }
      }
    }

    // Create story in database
    const Story = require('../models/Story');
    const story = new Story({
      userId,
      content: {
        type: processedData.type,
        media: processedData
      },
      privacy: req.body.privacy || 'contacts',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    await story.save();

    // Broadcast new story via Socket.IO
    if (req.io) {
      req.io.emit('new_story', {
        storyId: story._id,
        userId: userId.toString(),
        content: story.content,
        timestamp: story.createdAt
      });
    }

    res.status(200).json({
      success: true,
      message: 'Story uploaded successfully',
      data: {
        storyId: story._id,
        media: processedData
      }
    });

  } catch (error) {
    console.error('Story upload error:', error);
    
    // Clean up files on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload story',
      error: error.message
    });
  }
});

/**
 * Upload message media (images, videos, documents)
 */
router.post('/message-media', upload.array('messageMedia', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const { chatId, messageType } = req.body;
    const uploadedFiles = [];

    for (const file of req.files) {
      const filePath = file.path;
      const fileInfo = getFileInfo(filePath);
      
      let processedData = {
        url: `/uploads/messages/${file.filename}`,
        filename: file.originalname,
        type: fileInfo.isImage ? 'image' : fileInfo.isVideo ? 'video' : fileInfo.isDocument ? 'document' : 'file',
        size: fileInfo.size,
        mimeType: fileInfo.mimeType,
        uploadedAt: new Date()
      };

      // Process based on file type
      if (fileInfo.isImage) {
        const processedPath = path.join(path.dirname(filePath), `processed_${path.basename(filePath)}`);
        await processImage(filePath, processedPath, {
          width: 1920,
          quality: 85
        });
        
        // Upload to Cloudinary
        if (process.env.CLOUDINARY_CLOUD_NAME) {
          const cloudinaryResult = await uploadToCloudinary(processedPath, 'chatapp/messages', 'image');
          if (cloudinaryResult.success) {
            processedData.url = cloudinaryResult.url;
            processedData.publicId = cloudinaryResult.publicId;
            processedData.width = cloudinaryResult.width;
            processedData.height = cloudinaryResult.height;
          }
        }
      } else if (fileInfo.isVideo) {
        const processedPath = path.join(path.dirname(filePath), `processed_${path.basename(filePath)}`);
        const videoResult = await processVideo(filePath, processedPath, {
          bitrate: '2000k'
        });
        
        processedData.thumbnail = `/uploads/messages/${path.basename(videoResult.thumbnailPath)}`;
        
        // Upload to Cloudinary
        if (process.env.CLOUDINARY_CLOUD_NAME) {
          const cloudinaryResult = await uploadToCloudinary(processedPath, 'chatapp/messages', 'video');
          if (cloudinaryResult.success) {
            processedData.url = cloudinaryResult.url;
            processedData.publicId = cloudinaryResult.publicId;
            processedData.duration = cloudinaryResult.duration;
          }
        }
      }

      uploadedFiles.push(processedData);
    }

    res.status(200).json({
      success: true,
      message: 'Files uploaded successfully',
      data: {
        files: uploadedFiles,
        chatId
      }
    });

  } catch (error) {
    console.error('Message media upload error:', error);
    
    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload files',
      error: error.message
    });
  }
});

/**
 * Upload voice note
 */
router.post('/voice-note', upload.single('voiceNote'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No voice note uploaded'
      });
    }

    const { chatId, duration } = req.body;
    const filePath = req.file.path;
    const fileInfo = getFileInfo(filePath);
    
    let voiceData = {
      url: `/uploads/voice/${req.file.filename}`,
      filename: req.file.originalname,
      type: 'audio',
      size: fileInfo.size,
      mimeType: fileInfo.mimeType,
      duration: parseInt(duration) || 0,
      uploadedAt: new Date()
    };

    // Upload to Cloudinary
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const cloudinaryResult = await uploadToCloudinary(filePath, 'chatapp/voice', 'auto');
      if (cloudinaryResult.success) {
        voiceData.url = cloudinaryResult.url;
        voiceData.publicId = cloudinaryResult.publicId;
        voiceData.duration = cloudinaryResult.duration || voiceData.duration;
      }
    }

    res.status(200).json({
      success: true,
      message: 'Voice note uploaded successfully',
      data: {
        voiceNote: voiceData,
        chatId
      }
    });

  } catch (error) {
    console.error('Voice note upload error:', error);
    
    // Clean up files on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to upload voice note',
      error: error.message
    });
  }
});

/**
 * Get file by ID (for serving uploaded files)
 */
router.get('/file/:type/:filename', (req, res) => {
  try {
    const { type, filename } = req.params;
    const allowedTypes = ['profiles', 'stories', 'messages', 'voice', 'documents'];
    
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type'
      });
    }

    const filePath = path.join(__dirname, '..', 'uploads', type, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Set appropriate headers
    const fileInfo = getFileInfo(filePath);
    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Length', fileInfo.size);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to serve file'
    });
  }
});

/**
 * Delete uploaded file
 */
router.delete('/file/:type/:filename', async (req, res) => {
  try {
    const { type, filename } = req.params;
    const allowedTypes = ['profiles', 'stories', 'messages', 'voice', 'documents'];
    
    if (!allowedTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type'
      });
    }

    const filePath = path.join(__dirname, '..', 'uploads', type, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    console.error('File delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file'
    });
  }
});

module.exports = router;
