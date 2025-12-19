import { 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut 
} from 'firebase/auth';

class AuthManager {
  constructor(appState, auth, router) {
    this.appState = appState;
    this.auth = auth;
    this.router = router;
    this.setupAuthEvents();
  }
  
  // 设置认证相关事件监听
  setupAuthEvents() {
    // 登录/注册选项卡切换
    document.getElementById('showLogin').addEventListener('click', () => this.showLoginForm());
    document.getElementById('showRegister').addEventListener('click', () => this.showRegisterForm());
    
    // 登录按钮
    document.getElementById('loginBtn').addEventListener('click', () => this.handleEmailLogin());
    
    // Google登录
    document.getElementById('googleLoginBtn').addEventListener('click', () => this.handleGoogleLogin());
    
    // 注册按钮
    document.getElementById('registerBtn').addEventListener('click', () => this.handleRegistration());
    
    // 管理员登录链接
    document.getElementById('showAdminLogin').addEventListener('click', () => {
      this.router.navigate('/adminlogin');
    });
    
    // 返回用户登录
    document.getElementById('backToUserLogin').addEventListener('click', () => {
      this.router.navigate('/login');
    });
    
    // 管理员登录表单提交
    document.getElementById('adminLoginFormElement').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAdminLogin();
    });
    
    // 用户登出
    document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
    document.getElementById('mobileLogoutBtn').addEventListener('click', () => this.handleLogout());
    
    // 管理员登出
    document.getElementById('adminLogoutBtn').addEventListener('click', () => this.handleAdminLogout());
    document.getElementById('mobileAdminLogoutBtn').addEventListener('click', () => this.handleAdminLogout());
  }
  
  // 显示登录表单
  showLoginForm() {
    document.getElementById('showLogin').classList.add('bg-monkey-blue', 'text-white');
    document.getElementById('showLogin').classList.remove('text-gray-300');
    document.getElementById('showRegister').classList.remove('bg-monkey-blue', 'text-white');
    document.getElementById('showRegister').classList.add('text-gray-300');
    
    document.getElementById('emailLoginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('adminLoginForm').classList.add('hidden');
  }
  
  // 显示注册表单
  showRegisterForm() {
    document.getElementById('showRegister').classList.add('bg-monkey-blue', 'text-white');
    document.getElementById('showRegister').classList.remove('text-gray-300');
    document.getElementById('showLogin').classList.remove('bg-monkey-blue', 'text-white');
    document.getElementById('showLogin').classList.add('text-gray-300');
    
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('emailLoginForm').classList.add('hidden');
    document.getElementById('adminLoginForm').classList.add('hidden');
  }
  
  // Firebase邮箱登录
  handleEmailLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const rememberMe = document.querySelector('input[type="checkbox"]').checked;
    
    const authError = document.getElementById('authError');
    const authErrorMsg = document.getElementById('authErrorMsg');
    
    if (!email || !password) {
      authErrorMsg.textContent = this.appState.getTranslation('authLoginErrorEmpty');
      authError.classList.remove('hidden');
      return;
    }
    
    signInWithEmailAndPassword(this.auth, email, password)
      .then((userCredential) => {
        // 登录成功，由auth状态监听处理
        authError.classList.add('hidden');
        this.router.navigate('/dashboard');
      })
      .catch((error) => {
        authErrorMsg.textContent = this.appState.getFirebaseErrorMsg(error.code);
        authError.classList.remove('hidden');
      });
  }
  
  // Firebase Google登录
  handleGoogleLogin() {
    const provider = new GoogleAuthProvider();
    
    signInWithPopup(this.auth, provider)
      .then((result) => {
        // 登录成功，由auth状态监听处理
        document.getElementById('authError').classList.add('hidden');
        this.router.navigate('/dashboard');
      })
      .catch((error) => {
        const authError = document.getElementById('authError');
        const authErrorMsg = document.getElementById('authErrorMsg');
        authErrorMsg.textContent = this.appState.getFirebaseErrorMsg(error.code);
        authError.classList.remove('hidden');
      });
  }
  
  // 处理注册逻辑
  handleRegistration() {
    // 实现注册逻辑，这里简化处理
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();
    const username = document.getElementById('registerUsername').value.trim();
    
    // 简单验证
    if (!email || !password || !username) {
      // 显示错误信息
      return;
    }
    
    // 创建用户
    createUserWithEmailAndPassword(this.auth, email, password)
      .then((userCredential) => {
        // 更新用户资料
        const user = userCredential.user;
        return user.updateProfile({ displayName: username });
      })
      .then(() => {
        // 发送验证邮件
        return sendEmailVerification(this.auth.currentUser);
      })
      .then(() => {
        // 显示验证提示
        document.getElementById('verificationModal').classList.remove('hidden');
      })
      .catch((error) => {
        // 处理错误
        console.error('Registration error:', error);
      });
  }
  
  // 管理员登录处理
  handleAdminLogin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    const errorElement = document.getElementById('adminLoginError');
    const errorMsgElement = document.getElementById('adminLoginErrorMsg');
    
    if (username === this.appState.adminUsername && password === this.appState.adminPassword) {
      // 登录成功
      errorElement.classList.add('hidden');
      
      // 保存管理员登录状态 (12小时有效期)
      const expiry = new Date().getTime() + (12 * 60 * 60 * 1000);
      sessionStorage.setItem('monkeyPocketAdmin', JSON.stringify({
        adminUsername: username,
        expiry: expiry
      }));
      
      this.appState.currentAdmin = { username };
      this.router.navigate('/dashboard');
    } else {
      // 登录失败
      errorMsgElement.textContent = '管理员账号或密码不正确';
      errorElement.classList.remove('hidden');
    }
  }
  
  // 用户登出
  handleLogout() {
    signOut(this.auth).then(() => {
      this.appState.currentUser = null;
      localStorage.removeItem('monkeyPocketAutoLogin');
      this.router.navigate('/login');
    }).catch((error) => {
      console.error('Logout error:', error);
    });
  }
  
  // 管理员登出
  handleAdminLogout() {
    this.appState.currentAdmin = null;
    sessionStorage.removeItem('monkeyPocketAdmin');
    this.router.navigate('/login');
  }
}

export default AuthManager;