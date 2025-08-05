# 📱 Flutter Integration with AWS Backend

Complete guide to integrate your Flutter ChatApp with the AWS-hosted Node.js backend.

## 🔧 Flutter Dependencies

Add these to your `pubspec.yaml`:

```yaml
dependencies:
  # HTTP client
  dio: ^5.3.2
  
  # Socket.IO client
  socket_io_client: ^2.0.3+1
  
  # State management
  get: ^4.6.6
  
  # Local storage
  shared_preferences: ^2.2.2
  get_storage: ^2.1.1
  
  # Image handling
  image_picker: ^1.0.4
  cached_network_image: ^3.3.0
  
  # File handling
  file_picker: ^6.1.1
  path_provider: ^2.1.1
  
  # Permissions
  permission_handler: ^11.0.1
  
  # Push notifications
  firebase_messaging: ^14.6.9
  
  # Audio/Video calls (optional)
  flutter_webrtc: ^0.9.46
```

## 🌐 API Configuration

### 1. Create API Config
```dart
// lib/config/api_config.dart
class ApiConfig {
  // Replace with your AWS EC2 public IP or domain
  static const String baseUrl = 'http://YOUR_AWS_IP:3000/api';
  static const String socketUrl = 'http://YOUR_AWS_IP:3000';
  
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
}
```

### 2. Create HTTP Service
```dart
// lib/services/http_service.dart
import 'package:dio/dio.dart';
import 'package:get/get.dart' as getx;
import '../config/api_config.dart';
import '../controllers/auth_controller.dart';

class HttpService {
  static final HttpService _instance = HttpService._internal();
  factory HttpService() => _instance;
  HttpService._internal();

  late Dio _dio;

  void initialize() {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      connectTimeout: ApiConfig.timeout,
      receiveTimeout: ApiConfig.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    // Add interceptors
    _dio.interceptors.add(AuthInterceptor());
    _dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
      logPrint: (obj) => print('HTTP: $obj'),
    ));
  }

  Dio get dio => _dio;

  // GET request
  Future<Response> get(String path, {Map<String, dynamic>? queryParameters}) {
    return _dio.get(path, queryParameters: queryParameters);
  }

  // POST request
  Future<Response> post(String path, {dynamic data}) {
    return _dio.post(path, data: data);
  }

  // PUT request
  Future<Response> put(String path, {dynamic data}) {
    return _dio.put(path, data: data);
  }

  // DELETE request
  Future<Response> delete(String path) {
    return _dio.delete(path);
  }

  // Upload file
  Future<Response> uploadFile(String path, String filePath, {Map<String, dynamic>? data}) {
    FormData formData = FormData.fromMap({
      'file': MultipartFile.fromFileSync(filePath),
      ...?data,
    });
    
    return _dio.post(path, data: formData);
  }
}

// Auth interceptor to add JWT token
class AuthInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final authController = getx.Get.find<AuthController>();
    final token = authController.token.value;
    
    if (token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (err.response?.statusCode == 401) {
      // Token expired, redirect to login
      final authController = getx.Get.find<AuthController>();
      authController.logout();
    }
    
    handler.next(err);
  }
}
```

### 3. Create Socket Service
```dart
// lib/services/socket_service.dart
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:get/get.dart';
import '../config/api_config.dart';
import '../controllers/auth_controller.dart';
import '../controllers/chat_controller.dart';

class SocketService extends GetxController {
  static SocketService get instance => Get.find();
  
  IO.Socket? _socket;
  final RxBool _isConnected = false.obs;
  
  bool get isConnected => _isConnected.value;
  
  void connect() {
    final authController = Get.find<AuthController>();
    final token = authController.token.value;
    
    if (token.isEmpty) return;
    
    _socket = IO.io(ApiConfig.socketUrl, <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
      'auth': {'token': token},
    });
    
    _setupEventHandlers();
    _socket!.connect();
  }
  
  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _isConnected.value = false;
  }
  
  void _setupEventHandlers() {
    _socket!.onConnect((_) {
      print('🔌 Socket connected');
      _isConnected.value = true;
    });
    
    _socket!.onDisconnect((_) {
      print('🔌 Socket disconnected');
      _isConnected.value = false;
    });
    
    _socket!.on('authenticated', (data) {
      print('✅ Socket authenticated');
    });
    
    _socket!.on('authentication_error', (data) {
      print('❌ Socket authentication failed: $data');
      Get.find<AuthController>().logout();
    });
    
    // Chat events
    _socket!.on('new_message', (data) {
      Get.find<ChatController>().handleNewMessage(data);
    });
    
    _socket!.on('message_status_update', (data) {
      Get.find<ChatController>().handleMessageStatusUpdate(data);
    });
    
    _socket!.on('user_typing', (data) {
      Get.find<ChatController>().handleUserTyping(data);
    });
    
    _socket!.on('message_reaction', (data) {
      Get.find<ChatController>().handleMessageReaction(data);
    });
  }
  
  // Chat methods
  void joinChat(String chatId) {
    _socket?.emit('join_chat', {'chatId': chatId});
  }
  
  void leaveChat(String chatId) {
    _socket?.emit('leave_chat', {'chatId': chatId});
  }
  
  void sendMessage({
    required String chatId,
    required Map<String, dynamic> content,
    String? replyTo,
    List<String>? mentions,
    String? tempId,
  }) {
    _socket?.emit('send_message', {
      'chatId': chatId,
      'content': content,
      'replyTo': replyTo,
      'mentions': mentions,
      'tempId': tempId,
    });
  }
  
  void markMessageDelivered(String messageId) {
    _socket?.emit('message_delivered', {'messageId': messageId});
  }
  
  void markMessageRead(String messageId, String chatId) {
    _socket?.emit('message_read', {
      'messageId': messageId,
      'chatId': chatId,
    });
  }
  
  void startTyping(String chatId) {
    _socket?.emit('typing_start', {'chatId': chatId});
  }
  
  void stopTyping(String chatId) {
    _socket?.emit('typing_stop', {'chatId': chatId});
  }
  
  void addReaction(String messageId, String emoji) {
    _socket?.emit('add_reaction', {
      'messageId': messageId,
      'emoji': emoji,
    });
  }
  
  void removeReaction(String messageId) {
    _socket?.emit('remove_reaction', {'messageId': messageId});
  }
}
```

## 🔐 Authentication Service

### 1. Auth Service
```dart
// lib/services/auth_service.dart
import 'package:dio/dio.dart';
import '../config/api_config.dart';
import 'http_service.dart';

class AuthService {
  final HttpService _http = HttpService();
  
  // Send OTP
  Future<Map<String, dynamic>> sendOTP({
    required String phoneNumber,
    required String countryCode,
  }) async {
    try {
      final response = await _http.post(ApiConfig.sendOtp, data: {
        'phoneNumber': phoneNumber,
        'countryCode': countryCode,
      });
      
      return {
        'success': true,
        'data': response.data,
      };
    } on DioException catch (e) {
      return {
        'success': false,
        'message': e.response?.data['message'] ?? 'Failed to send OTP',
      };
    }
  }
  
  // Verify OTP
  Future<Map<String, dynamic>> verifyOTP({
    required String phoneNumber,
    required String otp,
  }) async {
    try {
      final response = await _http.post(ApiConfig.verifyOtp, data: {
        'phoneNumber': phoneNumber,
        'otp': otp,
      });
      
      return {
        'success': true,
        'data': response.data['data'],
      };
    } on DioException catch (e) {
      return {
        'success': false,
        'message': e.response?.data['message'] ?? 'Invalid OTP',
      };
    }
  }
  
  // Complete profile
  Future<Map<String, dynamic>> completeProfile({
    required String displayName,
    String? bio,
    String? username,
  }) async {
    try {
      final response = await _http.post(ApiConfig.completeProfile, data: {
        'displayName': displayName,
        'bio': bio,
        'username': username,
      });
      
      return {
        'success': true,
        'data': response.data['data'],
      };
    } on DioException catch (e) {
      return {
        'success': false,
        'message': e.response?.data['message'] ?? 'Failed to complete profile',
      };
    }
  }
  
  // Refresh token
  Future<Map<String, dynamic>> refreshToken() async {
    try {
      final response = await _http.post(ApiConfig.refreshToken);
      
      return {
        'success': true,
        'token': response.data['data']['token'],
      };
    } on DioException catch (e) {
      return {
        'success': false,
        'message': e.response?.data['message'] ?? 'Failed to refresh token',
      };
    }
  }
  
  // Logout
  Future<void> logout() async {
    try {
      await _http.post(ApiConfig.logout);
    } catch (e) {
      print('Logout error: $e');
    }
  }
}
```

### 2. Auth Controller
```dart
// lib/controllers/auth_controller.dart
import 'package:get/get.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/auth_service.dart';
import '../services/socket_service.dart';
import '../models/user_model.dart';

class AuthController extends GetxController {
  final AuthService _authService = AuthService();
  
  final RxString _token = ''.obs;
  final Rx<User?> _currentUser = Rx<User?>(null);
  final RxBool _isLoading = false.obs;
  
  String get token => _token.value;
  User? get currentUser => _currentUser.value;
  bool get isLoading => _isLoading.value;
  bool get isLoggedIn => _token.value.isNotEmpty && _currentUser.value != null;
  
  @override
  void onInit() {
    super.onInit();
    _loadTokenFromStorage();
  }
  
  Future<void> _loadTokenFromStorage() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token') ?? '';
    final userJson = prefs.getString('current_user');
    
    if (token.isNotEmpty) {
      _token.value = token;
      
      if (userJson != null) {
        _currentUser.value = User.fromJson(userJson);
        
        // Connect socket
        Get.find<SocketService>().connect();
      }
    }
  }
  
  Future<void> _saveTokenToStorage(String token, User user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
    await prefs.setString('current_user', user.toJson());
  }
  
  Future<void> _clearStorage() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    await prefs.remove('current_user');
  }
  
  // Send OTP
  Future<bool> sendOTP(String phoneNumber, String countryCode) async {
    _isLoading.value = true;
    
    final result = await _authService.sendOTP(
      phoneNumber: phoneNumber,
      countryCode: countryCode,
    );
    
    _isLoading.value = false;
    
    if (result['success']) {
      Get.snackbar('Success', 'OTP sent successfully');
      return true;
    } else {
      Get.snackbar('Error', result['message']);
      return false;
    }
  }
  
  // Verify OTP
  Future<bool> verifyOTP(String phoneNumber, String otp) async {
    _isLoading.value = true;
    
    final result = await _authService.verifyOTP(
      phoneNumber: phoneNumber,
      otp: otp,
    );
    
    _isLoading.value = false;
    
    if (result['success']) {
      final data = result['data'];
      _token.value = data['token'];
      _currentUser.value = User.fromMap(data['user']);
      
      await _saveTokenToStorage(_token.value, _currentUser.value!);
      
      // Connect socket
      Get.find<SocketService>().connect();
      
      Get.snackbar('Success', 'Phone verified successfully');
      return true;
    } else {
      Get.snackbar('Error', result['message']);
      return false;
    }
  }
  
  // Complete profile
  Future<bool> completeProfile({
    required String displayName,
    String? bio,
    String? username,
  }) async {
    _isLoading.value = true;
    
    final result = await _authService.completeProfile(
      displayName: displayName,
      bio: bio,
      username: username,
    );
    
    _isLoading.value = false;
    
    if (result['success']) {
      _currentUser.value = User.fromMap(result['data']['user']);
      await _saveTokenToStorage(_token.value, _currentUser.value!);
      
      Get.snackbar('Success', 'Profile completed successfully');
      return true;
    } else {
      Get.snackbar('Error', result['message']);
      return false;
    }
  }
  
  // Logout
  Future<void> logout() async {
    await _authService.logout();
    
    // Disconnect socket
    Get.find<SocketService>().disconnect();
    
    // Clear local data
    _token.value = '';
    _currentUser.value = null;
    await _clearStorage();
    
    // Navigate to login
    Get.offAllNamed('/login');
  }
}
```

## 💬 Chat Integration

### 1. Chat Service
```dart
// lib/services/chat_service.dart
import 'package:dio/dio.dart';
import '../config/api_config.dart';
import 'http_service.dart';

class ChatService {
  final HttpService _http = HttpService();
  
  // Get user chats
  Future<List<dynamic>> getChats() async {
    try {
      final response = await _http.get(ApiConfig.chats);
      return response.data['data'] ?? [];
    } catch (e) {
      print('Get chats error: $e');
      return [];
    }
  }
  
  // Get chat messages
  Future<List<dynamic>> getChatMessages(String chatId, {int page = 1}) async {
    try {
      final response = await _http.get('${ApiConfig.chats}/$chatId/messages', 
        queryParameters: {'page': page});
      return response.data['data'] ?? [];
    } catch (e) {
      print('Get messages error: $e');
      return [];
    }
  }
  
  // Create private chat
  Future<Map<String, dynamic>?> createPrivateChat(String userId) async {
    try {
      final response = await _http.post('${ApiConfig.chats}/private', 
        data: {'userId': userId});
      return response.data['data'];
    } catch (e) {
      print('Create chat error: $e');
      return null;
    }
  }
  
  // Upload media
  Future<String?> uploadMedia(String filePath) async {
    try {
      final response = await _http.uploadFile('/upload/media', filePath);
      return response.data['data']['url'];
    } catch (e) {
      print('Upload media error: $e');
      return null;
    }
  }
}
```

### 2. Update Login Screen
```dart
// lib/features/auth/screens/login_screen.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:country_code_picker/country_code_picker.dart';
import '../../../controllers/auth_controller.dart';
import '../../../core/theme/amoled_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _phoneController = TextEditingController();
  final AuthController _authController = Get.find<AuthController>();
  
  String _selectedCountryCode = '+1';
  String _selectedCountryName = 'United States';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AmoledTheme.backgroundColor,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 60),
              
              // Title
              const Text(
                'Welcome to\nChatApp',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: AmoledTheme.textPrimary,
                  height: 1.2,
                ),
              ),
              
              const SizedBox(height: 12),
              
              Text(
                'Enter your phone number to get started\nConnected to AWS server',
                style: TextStyle(
                  fontSize: 16,
                  color: AmoledTheme.textSecondary,
                ),
              ),
              
              const SizedBox(height: 60),
              
              // Phone Input with Country Code
              Container(
                decoration: BoxDecoration(
                  color: AmoledTheme.cardColor,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: AmoledTheme.dividerColor,
                    width: 1,
                  ),
                ),
                child: Row(
                  children: [
                    // Country Code Picker
                    CountryCodePicker(
                      onChanged: (country) {
                        setState(() {
                          _selectedCountryCode = country.dialCode!;
                          _selectedCountryName = country.name!;
                        });
                      },
                      initialSelection: 'US',
                      textStyle: const TextStyle(
                        color: AmoledTheme.primaryColor,
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                      dialogBackgroundColor: AmoledTheme.cardColor,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                    ),
                    
                    // Divider
                    Container(
                      height: 30,
                      width: 1,
                      color: AmoledTheme.dividerColor,
                    ),
                    
                    // Phone Number Input
                    Expanded(
                      child: TextField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        style: const TextStyle(
                          color: AmoledTheme.textPrimary,
                          fontSize: 16,
                        ),
                        decoration: InputDecoration(
                          hintText: 'Phone number',
                          hintStyle: TextStyle(
                            color: AmoledTheme.textSecondary,
                          ),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.all(20),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              
              const SizedBox(height: 40),
              
              // Send OTP Button
              Obx(() => GestureDetector(
                onTap: _authController.isLoading ? null : _sendOTP,
                child: Container(
                  width: double.infinity,
                  height: 56,
                  decoration: BoxDecoration(
                    color: _authController.isLoading 
                        ? AmoledTheme.primaryColor.withOpacity(0.6)
                        : AmoledTheme.primaryColor,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Center(
                    child: _authController.isLoading
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text(
                            'Send OTP',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                  ),
                ),
              )),
              
              const Spacer(),
              
              // Server Status
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AmoledTheme.surfaceColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Colors.green,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'Connected to AWS Server',
                      style: TextStyle(
                        color: AmoledTheme.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _sendOTP() async {
    if (_phoneController.text.trim().isEmpty) {
      Get.snackbar('Error', 'Please enter your phone number');
      return;
    }

    final success = await _authController.sendOTP(
      _phoneController.text.trim(),
      _selectedCountryCode,
    );

    if (success) {
      Get.to(() => OTPVerificationScreen(
        phoneNumber: _selectedCountryCode + _phoneController.text.trim(),
        countryName: _selectedCountryName,
      ));
    }
  }
}
```

## 🚀 App Initialization

### 1. Main App Setup
```dart
// lib/main.dart
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'controllers/auth_controller.dart';
import 'services/http_service.dart';
import 'services/socket_service.dart';
import 'features/auth/screens/login_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize services
  HttpService().initialize();
  
  // Initialize controllers
  Get.put(AuthController(), permanent: true);
  Get.put(SocketService(), permanent: true);
  
  runApp(const ChatApp());
}

class ChatApp extends StatelessWidget {
  const ChatApp({super.key});

  @override
  Widget build(BuildContext context) {
    return GetMaterialApp(
      title: 'ChatApp - AWS Backend',
      theme: ThemeData.dark(),
      home: const AuthWrapper(),
    );
  }
}

class AuthWrapper extends StatelessWidget {
  const AuthWrapper({super.key});

  @override
  Widget build(BuildContext context) {
    return GetBuilder<AuthController>(
      builder: (authController) {
        return Obx(() {
          if (authController.isLoggedIn) {
            return const MainScreen(); // Your main chat screen
          } else {
            return const LoginScreen();
          }
        });
      },
    );
  }
}
```

## 🔧 Configuration Steps

### 1. Update API Config
Replace `YOUR_AWS_IP` in `api_config.dart` with your actual AWS EC2 public IP:

```dart
static const String baseUrl = 'http://54.123.45.67:3000/api';
static const String socketUrl = 'http://54.123.45.67:3000';
```

### 2. Test Connection
Add a health check method:

```dart
// lib/services/health_service.dart
class HealthService {
  static Future<bool> checkServerHealth() async {
    try {
      final response = await HttpService().get('/health');
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
```

### 3. Handle Network Errors
```dart
// lib/utils/error_handler.dart
class ErrorHandler {
  static void handleError(dynamic error) {
    if (error is DioException) {
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
          Get.snackbar('Error', 'Connection timeout. Check your internet.');
          break;
        case DioExceptionType.receiveTimeout:
          Get.snackbar('Error', 'Server response timeout.');
          break;
        case DioExceptionType.connectionError:
          Get.snackbar('Error', 'Cannot connect to server.');
          break;
        default:
          Get.snackbar('Error', 'Network error occurred.');
      }
    }
  }
}
```

Your Flutter app is now ready to connect to your AWS-hosted backend! 🚀📱

The integration provides:
- ✅ Real-time messaging via Socket.IO
- ✅ Phone authentication with OTP
- ✅ File upload capabilities
- ✅ Error handling and retry logic
- ✅ Token management and refresh
- ✅ Connection status monitoring

Your ChatApp can now connect to your AWS server from any device worldwide! 🌍
