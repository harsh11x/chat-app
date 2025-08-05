// lib/config/api_config.dart
class ApiConfig {
  // Your AWS EC2 Server IP
  static const String baseUrl = 'http://3.111.208.77:3000/api';
  static const String socketUrl = 'http://3.111.208.77:3000';
  
  // API Endpoints
  static const String sendOtp = '/auth/send-otp';
  static const String verifyOtp = '/auth/verify-otp';
  static const String completeProfile = '/auth/complete-profile';
  static const String refreshToken = '/auth/refresh-token';
  static const String logout = '/auth/logout';
  
  // User endpoints
  static const String userProfile = '/users/profile';
  static const String uploadAvatar = '/users/upload-avatar';
  static const String searchUsers = '/users/search';
  
  // Chat endpoints
  static const String chats = '/chats';
  static const String messages = '/messages';
  
  // Story endpoints
  static const String stories = '/stories';
  
  // Call endpoints
  static const String calls = '/calls';
  
  // Request timeout
  static const Duration timeout = Duration(seconds: 30);
  
  // File upload limits
  static const int maxFileSize = 10 * 1024 * 1024; // 10MB
  static const List<String> allowedImageTypes = ['jpg', 'jpeg', 'png', 'gif'];
  static const List<String> allowedVideoTypes = ['mp4', 'mov', 'avi'];
  
  // Server status
  static const String healthCheck = '/health';
  
  // WebSocket events
  static const String socketConnect = 'connect';
  static const String socketDisconnect = 'disconnect';
  static const String socketAuth = 'authenticate';
  static const String socketJoinChat = 'join_chat';
  static const String socketSendMessage = 'send_message';
  static const String socketNewMessage = 'new_message';
  static const String socketTyping = 'typing_start';
  static const String socketStopTyping = 'typing_stop';
}
