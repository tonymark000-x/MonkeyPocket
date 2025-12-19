import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut 
} from 'firebase/auth';

import './styles.css';
import translations from './translations.json';

// 简化的环境变量获取函数（只支持Webpack）
const getEnvVariable = (key) => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return '';
};

// 检查并加载 Firebase 配置的函数
function checkFirebaseConfig() {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  };

  // 检查必填字段
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const missingFields = requiredFields.filter(field => !config[field]);

  if (missingFields.length > 0) {
    console.error(`Firebase配置不完整，缺少以下字段: ${missingFields.join(', ')}`);
    console.error('请检查.env文件中的Firebase配置是否正确');
    return false;
  }
  return config;
}

// 初始化 Firebase
const firebaseConfig = checkFirebaseConfig();

if (firebaseConfig) {
  const firebase = initializeApp(firebaseConfig);
} else {
  console.log('使用模拟的Firebase Auth进行开发');
}

//定义 ADMIN_CONFIG
const ADMIN_CONFIG = {
  username: process.env.ADMIN_USERNAME || 'MonkeyKingdomCEO',
  password: process.env.ADMIN_PASSWORD || 'default_password'
};

// 只有配置完整时才初始化Firebase
let app, auth;
if (checkFirebaseConfig()) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
} else {
  // 开发环境下提供降级处理
  console.warn('使用模拟的Firebase Auth进行开发');
  auth = {
    currentUser: null,
    onAuthStateChanged: (callback) => {
      callback(null);
    },
    signInWithEmailAndPassword: () => Promise.reject(new Error('Firebase未配置')),
    signInWithPopup: () => Promise.reject(new Error('Firebase未配置')),
    createUserWithEmailAndPassword: () => Promise.reject(new Error('Firebase未配置')),
    sendEmailVerification: () => Promise.reject(new Error('Firebase未配置')),
    signOut: () => Promise.resolve()
  };
}

// 应用程序状态管理
const AppState = {
  // 当前用户信息
  currentUser: null,
  currentAdmin: null,
  
  // 所有用户数据 (模拟数据库)
  users: {},
  
  // 所有激活码数据
  activationCodes: {},
  
  // 当前语言
  currentLang: 'zh',
  
  // 当前选中的百宝袋
  selectedPocketId: null,
  
  // 选中的远程取物物品
  selectedItemsForRetrieval: [],
  
  // 活动页面
  activePage: 'dashboard',
  
  // 邮箱验证码相关
  emailVerificationCodes: {},
  
  // 管理员设置
  adminUsername: ADMIN_CONFIG.username,
  adminPassword: ADMIN_CONFIG.password,

  // 初始化应用程序
  init() {
    this.loadUsersFromStorage();
    this.loadActivationCodesFromStorage();
    this.checkAutoLogin();
    this.checkAdminAutoLogin();
    this.setupEventListeners();
    this.initLanguage();
    this.showAuthPage();
    
    if (Object.keys(this.activationCodes).length === 0) {
      this.createDemoActivationCodes();
    }
    
       // 检查URL哈希是否包含adminLogin
     if (window.location.hash.includes('adminLogin')) {
    this.showAdminLoginForm();
     }
    this.setupFirebaseAuthListener();
  },
  
  // 添加显示管理员登录表单的方法
showAdminLoginForm() {
  document.getElementById('firebaseAuthContainer').classList.add('hidden');
  document.getElementById('adminLoginForm').classList.remove('hidden');
},
  // 设置Firebase auth状态监听
  setupFirebaseAuthListener() {
    onAuthStateChanged(auth, user => {
      if (user) {
        // 用户已登录，检查邮箱是否已验证
        if (user.emailVerified) {
          this.handleFirebaseLogin(user);
        } else {
          this.showVerificationModal();
        }
      } else {
        // 用户已登出
        if (!this.currentAdmin) {
          this.showAuthPage();
        }
      }
    });
  },
  
  // 处理Firebase登录成功
  handleFirebaseLogin(user) {
    this.currentUser = {
      id: user.uid,
      email: user.email,
      username: user.displayName || user.email.split('@')[0],
      photoURL: user.photoURL,
      emailVerified: user.emailVerified
    };
    
    // 检查用户数据是否存在，不存在则初始化
    if (!this.users[this.currentUser.email]) {
      this.users[this.currentUser.email] = this.currentUser;
      localStorage.setItem('monkeyPocketUsers', JSON.stringify(this.users));
      
      // 初始化用户数据
      const userData = {
        pockets: [],
        recentActivity: []
      };
        // 显示导航栏
  document.getElementById('navbar').classList.add('visible');
      localStorage.setItem(`user_${this.currentUser.id}_data`, JSON.stringify(userData));
    }
    
    this.showMainContent();
    this.updateDashboard();
    this.showPage('dashboard');
  },

  handleAdminLogin() {
  // ... 现有登录验证代码
  
  // 显示导航栏
  document.getElementById('navbar').classList.add('visible');
},
  
  // 处理用户注册
  handleRegister() {
    const emailInput = document.getElementById('registerEmail');
    const passwordInput = document.getElementById('registerPassword');
    const confirmPasswordInput = document.getElementById('registerConfirmPassword');
    const agreeTermsInput = document.getElementById('termsAgree');
    const authError = document.getElementById('authError');
    const authErrorMsg = document.getElementById('authErrorMsg');

    // 先检查元素是否存在
    if (!emailInput || !passwordInput || !confirmPasswordInput || !agreeTermsInput || !authError || !authErrorMsg) {
      console.error('注册表单元素缺失');
      return;
    }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();
    const agreeTerms = agreeTermsInput.checked;
    
    // 表单验证
    if (!email || !password || !confirmPassword) {
      authErrorMsg.textContent = this.getTranslation('authRegisterErrorEmpty');
      authError.classList.remove('hidden');
      return;
    }
    
    if (password !== confirmPassword) {
      authErrorMsg.textContent = this.getTranslation('authPasswordMismatch');
      authError.classList.remove('hidden');
      return;
    }
    
    if (password.length < 6) {
      authErrorMsg.textContent = this.getTranslation('authPasswordTooShort');
      authError.classList.remove('hidden');
      return;
    }
    
    if (!agreeTerms) {
      authErrorMsg.textContent = this.getTranslation('authAgreeTermsError');
      authError.classList.remove('hidden');
      return;
    }
    
    // 使用Firebase创建用户
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        // 注册成功，发送验证邮件
        const user = userCredential.user;
        this.sendVerificationEmail(user);
        
        // 隐藏错误提示
        authError.classList.add('hidden');
        
        // 显示验证模态框
        this.showVerificationModal();
      })
      .catch((error) => {
        authErrorMsg.textContent = this.getFirebaseErrorMsg(error.code);
        authError.classList.remove('hidden');
      });
  },
  
  // 发送验证邮件
  sendVerificationEmail(user) {
    sendEmailVerification(user)
      .then(() => {
        console.log('验证邮件已发送');
      })
      .catch((error) => {
        console.error('发送验证邮件失败:', error);
        const errorMsg = document.getElementById('verificationError');
        if (errorMsg) {
          errorMsg.textContent = this.getTranslation('authVerifySendError');
          errorMsg.classList.remove('hidden');
          
          // 3秒后隐藏错误消息
          setTimeout(() => {
            errorMsg.classList.add('hidden');
          }, 3000);
        }
      });
  },
  
  // 重新发送验证邮件
  resendVerificationEmail() {
    const user = auth.currentUser;
    if (user) {
      this.sendVerificationEmail(user);
      
      const successMsg = document.getElementById('verificationSuccess');
      if (successMsg) {
        successMsg.textContent = this.getTranslation('authVerifyResent');
        successMsg.classList.remove('hidden');
        
        // 3秒后隐藏成功消息
        setTimeout(() => {
          successMsg.classList.add('hidden');
        }, 3000);
      }
    }
  },
  
  // 显示验证模态框
  showVerificationModal() {
    const verificationModal = document.getElementById('verificationModal');
    const firebaseAuthContainer = document.getElementById('firebaseAuthContainer');
    if (verificationModal) verificationModal.classList.remove('hidden');
    if (firebaseAuthContainer) firebaseAuthContainer.classList.add('hidden');
  },
  
  // 隐藏验证模态框
  hideVerificationModal() {
    const verificationModal = document.getElementById('verificationModal');
    const firebaseAuthContainer = document.getElementById('firebaseAuthContainer');
    if (verificationModal) verificationModal.classList.add('hidden');
    if (firebaseAuthContainer) firebaseAuthContainer.classList.remove('hidden');
  },
  
  // Firebase邮箱登录
  handleEmailLogin() {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const authError = document.getElementById('authError');
    const authErrorMsg = document.getElementById('authErrorMsg');

    if (!emailInput || !passwordInput || !authError || !authErrorMsg) {
      console.error('登录表单元素缺失');
      return;
    }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();
    const rememberMe = document.querySelector('input[type="checkbox"]')?.checked || false;
    
    if (!email || !password) {
      authErrorMsg.textContent = this.getTranslation('authLoginErrorEmpty');
      authError.classList.remove('hidden');
      return;
    }
    
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        authError.classList.add('hidden');
      })
      .catch((error) => {
        authErrorMsg.textContent = this.getFirebaseErrorMsg(error.code);
        authError.classList.remove('hidden');
      });
  },
  
  // Firebase Google登录
  handleGoogleLogin() {
    const provider = new GoogleAuthProvider();
    
    signInWithPopup(auth, provider)
      .then((result) => {
        const authError = document.getElementById('authError');
        if (authError) authError.classList.add('hidden');
      })
      .catch((error) => {
        const authError = document.getElementById('authError');
        const authErrorMsg = document.getElementById('authErrorMsg');
        if (authErrorMsg) authErrorMsg.textContent = this.getFirebaseErrorMsg(error.code);
        if (authError) authError.classList.remove('hidden');
      });
  },
  
  // 处理Firebase错误消息
  getFirebaseErrorMsg(errorCode) {
    const translations = this.getTranslations();
    const errors = {
      'auth/invalid-email': translations.authErrorInvalidEmail,
      'auth/user-disabled': translations.authErrorUserDisabled,
      'auth/user-not-found': translations.authErrorUserNotFound,
      'auth/wrong-password': translations.authErrorWrongPassword,
      'auth/popup-closed-by-user': translations.authErrorPopupClosed,
      'auth/network-request-failed': translations.authErrorNetwork,
      'auth/email-already-in-use': translations.authErrorEmailInUse,
      'auth/weak-password': translations.authErrorWeakPassword
    };
    
    return errors[errorCode] || translations.authErrorGeneric;
  },
  
  // 从本地存储加载用户数据
  loadUsersFromStorage() {
    const storedUsers = localStorage.getItem('monkeyPocketUsers');
    if (storedUsers) {
      this.users = JSON.parse(storedUsers);
    }
    
    if (Object.keys(this.users).length === 0) {
      this.createDemoData();
    }
  },
  
  // 从本地存储加载激活码数据
  loadActivationCodesFromStorage() {
    const storedCodes = localStorage.getItem('monkeyPocketActivationCodes');
    if (storedCodes) {
      this.activationCodes = JSON.parse(storedCodes);
    }
  },
  
  // 检查自动登录
  checkAutoLogin() {
    const user = auth.currentUser;
    if (user) {
      if (user.emailVerified) {
        this.handleFirebaseLogin(user);
      } else {
        this.showVerificationModal();
      }
    }
  },
  
  // 检查管理员自动登录
  checkAdminAutoLogin() {
    const savedAdminLogin = sessionStorage.getItem('monkeyPocketAdmin');
    if (savedAdminLogin) {
      const { adminUsername, expiry } = JSON.parse(savedAdminLogin);
      
      if (new Date().getTime() < expiry) {
        this.currentAdmin = { username: adminUsername };
        this.showAdminContent();
        this.updateAdminDashboard();
        this.showAdminPage('adminDashboard');
          document.getElementById('navbar').classList.add('visible');
      } else {
        sessionStorage.removeItem('monkeyPocketAdmin');
      }
    }
  },
  
  // 设置事件监听器
  setupEventListeners() {
    // 绑定this上下文
    this.handleScroll = this.handleScroll.bind(this);
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleMenuClick = this.handleMenuClick.bind(this);
    this.handleAnchorClick = this.handleAnchorClick.bind(this);
    this.handleLogoClick = this.handleLogoClick.bind(this);

    // 语言切换
    this.bindLanguageEvents();
    
    // 用户和管理员菜单相关
    this.bindMenuEvents();
    
    // 登录/注册相关
    this.bindAuthEvents();
    
    // 滚动事件
    window.addEventListener('scroll', this.handleScroll);
    
    // 移动端菜单（先检查元素是否存在）
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', this.handleMenuClick);
    }
    
    // 平滑滚动和页面切换
    document.querySelectorAll('.page-link').forEach(anchor => {
      anchor.addEventListener('click', this.handleAnchorClick);
    });
    
    // Logo点击返回首页
    const logoHome = document.getElementById('logoHome');
    if (logoHome) {
      logoHome.addEventListener('click', this.handleLogoClick);
    }
  },

  // 语言切换事件绑定
  bindLanguageEvents() {
    const langEN = document.getElementById('langEN');
    const langZH = document.getElementById('langZH');
    
    if (langEN) {
      langEN.addEventListener('click', () => this.changeLanguage('en'));
    }
    if (langZH) {
      langZH.addEventListener('click', () => this.changeLanguage('zh'));
    }
  },

  // 菜单相关事件绑定（核心修复：添加空值检查）
  bindMenuEvents() {
    // 用户菜单切换
    const userMenuBtn = document.getElementById('userMenuBtn');
    if (userMenuBtn) {
      userMenuBtn.addEventListener('click', () => {
        const userDropdown = document.getElementById('userDropdown');
        if (userDropdown) userDropdown.classList.toggle('hidden');
      });
    }
    
    // 管理员菜单切换
    const adminMenuBtn = document.getElementById('adminMenuBtn');
    if (adminMenuBtn) {
      adminMenuBtn.addEventListener('click', () => {
        const adminDropdown = document.getElementById('adminDropdown');
        if (adminDropdown) adminDropdown.classList.toggle('hidden');
      });
    }
    
    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', this.handleDocumentClick);
    
    // 注册相关事件
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
      registerBtn.addEventListener('click', () => this.handleRegister());
    }
    
    const resendVerification = document.getElementById('resendVerification');
    if (resendVerification) {
      resendVerification.addEventListener('click', () => this.resendVerificationEmail());
    }
    
    // 密码强度检测
    const passwordInput = document.getElementById('registerPassword');
    if (passwordInput) {
      passwordInput.addEventListener('input', (e) => this.checkPasswordStrength(e.target.value));
    }
  },
  
  // 绑定认证相关事件（添加空值检查）
  bindAuthEvents() {
    // 登录/注册选项卡切换
    const showLogin = document.getElementById('showLogin');
    if (showLogin) {
      showLogin.addEventListener('click', () => this.showLoginForm());
    }
    
    const showRegister = document.getElementById('showRegister');
    if (showRegister) {
      showRegister.addEventListener('click', () => this.showRegisterForm());
    }
    
    // 登录按钮
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.handleEmailLogin());
    }
    
    // Google登录按钮
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    if (googleLoginBtn) {
      googleLoginBtn.addEventListener('click', () => this.handleGoogleLogin());
    }
    
    // 管理员登录切换
    const showAdminLogin = document.getElementById('showAdminLogin');
    if (showAdminLogin) {
      showAdminLogin.addEventListener('click', () => this.showAdminLoginForm());
    }
    
    const backToUserLogin = document.getElementById('backToUserLogin');
    if (backToUserLogin) {
      backToUserLogin.addEventListener('click', () => this.showUserLoginForm());
    }
  },
  
  // 显示登录表单
  showLoginForm() {
    const emailLoginForm = document.getElementById('emailLoginForm');
    const registerForm = document.getElementById('registerForm');
    const showLogin = document.getElementById('showLogin');
    const showRegister = document.getElementById('showRegister');
    const authError = document.getElementById('authError');
    
    if (emailLoginForm) emailLoginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
    if (showLogin) {
      showLogin.classList.add('bg-monkey-blue', 'text-white');
      showLogin.classList.remove('text-gray-300');
    }
    if (showRegister) {
      showRegister.classList.remove('bg-monkey-blue', 'text-white');
      showRegister.classList.add('text-gray-300');
    }
    if (authError) authError.classList.add('hidden');
  },
  
  // 显示注册表单
  showRegisterForm() {
    const emailLoginForm = document.getElementById('emailLoginForm');
    const registerForm = document.getElementById('registerForm');
    const showLogin = document.getElementById('showLogin');
    const showRegister = document.getElementById('showRegister');
    const authError = document.getElementById('authError');
    
    if (emailLoginForm) emailLoginForm.classList.add('hidden');
    if (registerForm) registerForm.classList.remove('hidden');
    if (showRegister) {
      showRegister.classList.add('bg-monkey-blue', 'text-white');
      showRegister.classList.remove('text-gray-300');
    }
    if (showLogin) {
      showLogin.classList.remove('bg-monkey-blue', 'text-white');
      showLogin.classList.add('text-gray-300');
    }
    if (authError) authError.classList.add('hidden');
  },
  
  // 检查密码强度
  checkPasswordStrength(password) {
    const strengthBar = document.querySelector('.strength-bar');
    const strengthText = document.querySelector('.strength-text');
    if (!strengthBar || !strengthText) return;
    
    let strength = 0;
    
    // 基本长度检查
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    
    // 包含数字
    if (/\d/.test(password)) strength++;
    
    // 包含小写字母
    if (/[a-z]/.test(password)) strength++;
    
    // 包含大写字母
    if (/[A-Z]/.test(password)) strength++;
    
    // 包含特殊字符
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    // 更新强度条
    strengthBar.className = 'strength-bar';
    if (strength <= 2) {
      strengthBar.classList.add('weak');
      strengthText.textContent = this.getTranslation('authPasswordWeak');
    } else if (strength <= 4) {
      strengthBar.classList.add('medium');
      strengthText.textContent = this.getTranslation('authPasswordMedium');
    } else if (strength <= 5) {
      strengthBar.classList.add('strong');
      strengthText.textContent = this.getTranslation('authPasswordStrong');
    } else {
      strengthBar.classList.add('very-strong');
      strengthText.textContent = this.getTranslation('authPasswordVeryStrong');
    }
  },
  
  // 获取当前语言的翻译
  getTranslations() {
    return translations[this.currentLang] || translations.zh;
  },
  
  // 获取单个翻译文本
  getTranslation(key) {
    return this.getTranslations()[key] || key;
  },
  
  // 切换语言
  changeLanguage(lang) {
    this.currentLang = lang;
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.getTranslation(key);
      if (translation) {
        if (translation.includes('<a ')) {
          element.innerHTML = translation;
        } else {
          element.textContent = translation;
        }
      }
    });
    
    // 更新语言按钮样式
    const langEN = document.getElementById('langEN');
    const langZH = document.getElementById('langZH');
    
    if (langEN) {
      langEN.classList.toggle('bg-monkey-blue', lang === 'en');
      langEN.classList.toggle('text-white', lang === 'en');
      langEN.classList.toggle('text-gray-300', lang !== 'en');
    }
    if (langZH) {
      langZH.classList.toggle('bg-monkey-blue', lang === 'zh');
      langZH.classList.toggle('text-white', lang === 'zh');
      langZH.classList.toggle('text-gray-300', lang !== 'zh');
    }
  },
  
  // 初始化语言
  initLanguage() {
    const savedLang = localStorage.getItem('monkeyPocketLang');
    if (savedLang && ['zh', 'en'].includes(savedLang)) {
      this.currentLang = savedLang;
    } else {
      const browserLang = navigator.language || navigator.userLanguage;
      this.currentLang = browserLang.includes('zh') ? 'zh' : 'en';
    }
    
    this.changeLanguage(this.currentLang);
  },
  
  // 显示认证页面
  showAuthPage() {
    const mainContent = document.getElementById('mainContent');
    const adminContent = document.getElementById('adminContent');
    const authPage = document.getElementById('authPage');
    
    if (mainContent) mainContent.classList.add('hidden');
    if (adminContent) adminContent.classList.add('hidden');
    if (authPage) authPage.classList.remove('hidden');
    
    this.showLoginForm();
  },
  
  // 显示主内容
  showMainContent() {
    const authPage = document.getElementById('authPage');
    const adminContent = document.getElementById('adminContent');
    const mainContent = document.getElementById('mainContent');
    
    if (authPage) authPage.classList.add('hidden');
    if (adminContent) adminContent.classList.add('hidden');
    if (mainContent) mainContent.classList.remove('hidden');
  },
  
  // 显示管理员内容
  showAdminContent() {
    const authPage = document.getElementById('authPage');
    const mainContent = document.getElementById('mainContent');
    const adminContent = document.getElementById('adminContent');
    
    if (authPage) authPage.classList.add('hidden');
    if (mainContent) mainContent.classList.add('hidden');
    if (adminContent) adminContent.classList.remove('hidden');
  },
  
  // 空实现方法（避免报错）
  showPage(pageId) {
    this.activePage = pageId;
  },
  
  updateDashboard() {},
  
  createDemoData() {},
  
  createDemoActivationCodes() {},
  
  handleScroll() {},
  
  handleDocumentClick(event) {},
  
  handleMenuClick() {},
  
  handleAnchorClick(event) {},
  
  handleLogoClick() {},
  
  showAdminLoginForm() {
    const firebaseAuthContainer = document.getElementById('firebaseAuthContainer');
    const adminLoginForm = document.getElementById('adminLoginForm');
    
    if (firebaseAuthContainer) firebaseAuthContainer.classList.add('hidden');
    if (adminLoginForm) adminLoginForm.classList.remove('hidden');
  },
  
  showUserLoginForm() {
    const adminLoginForm = document.getElementById('adminLoginForm');
    const firebaseAuthContainer = document.getElementById('firebaseAuthContainer');
    
    if (adminLoginForm) adminLoginForm.classList.add('hidden');
    if (firebaseAuthContainer) firebaseAuthContainer.classList.remove('hidden');
  },
  
  updateAdminDashboard() {},
  
  showAdminPage(pageId) {}
};

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  AppState.init();
});