import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

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
  // 模拟 Auth 逻辑（可选）
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
      // 模拟空用户状态
      callback(null);
    },
    signInWithEmailAndPassword: () => Promise.reject(new Error('Firebase未配置')),
    signInWithPopup: () => Promise.reject(new Error('Firebase未配置')),
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
  
  // 管理员设置 - 使用从环境变量加载的配置
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
    
    this.setupFirebaseAuthListener();
  },
  
  // 设置Firebase auth状态监听
  setupFirebaseAuthListener() {
    onAuthStateChanged(auth, user => {
      if (user) {
        // 用户已登录
        this.handleFirebaseLogin(user);
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
      photoURL: user.photoURL
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
      
      localStorage.setItem(`user_${this.currentUser.id}_data`, JSON.stringify(userData));
    }
    
    this.showMainContent();
    this.updateDashboard();
    this.showPage('dashboard');
  },
  
  // Firebase邮箱登录
  handleEmailLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const rememberMe = document.querySelector('input[type="checkbox"]').checked;
    
    const authError = document.getElementById('authError');
    const authErrorMsg = document.getElementById('authErrorMsg');
    
    if (!email || !password) {
      authErrorMsg.textContent = this.getTranslation('authLoginErrorEmpty');
      authError.classList.remove('hidden');
      return;
    }
    
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        // 登录成功，由auth状态监听处理
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
        // 登录成功，由auth状态监听处理
        document.getElementById('authError').classList.add('hidden');
      })
      .catch((error) => {
        const authError = document.getElementById('authError');
        const authErrorMsg = document.getElementById('authErrorMsg');
        authErrorMsg.textContent = this.getFirebaseErrorMsg(error.code);
        authError.classList.remove('hidden');
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
      'auth/network-request-failed': translations.authErrorNetwork
    };
    
    return errors[errorCode] || translations.authErrorGeneric;
  },
  
  // 从本地存储加载用户数据
  loadUsersFromStorage() {
    const storedUsers = localStorage.getItem('monkeyPocketUsers');
    if (storedUsers) {
      this.users = JSON.parse(storedUsers);
    }
    
    // 初始化演示数据
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
    // Firebase会自动处理自动登录
    // 这里只需要检查是否有当前用户
    const user = auth.currentUser;
    if (user) {
      this.handleFirebaseLogin(user);
    }
  },
  
  // 检查管理员自动登录
  checkAdminAutoLogin() {
    const savedAdminLogin = sessionStorage.getItem('monkeyPocketAdmin');
    if (savedAdminLogin) {
      const { adminUsername, expiry } = JSON.parse(savedAdminLogin);
      
      // 检查是否过期 (12小时)
      if (new Date().getTime() < expiry) {
        this.currentAdmin = { username: adminUsername };
        this.showAdminContent();
        this.updateAdminDashboard();
        this.showAdminPage('adminDashboard');
      } else {
        sessionStorage.removeItem('monkeyPocketAdmin');
      }
    }
  },
  
// 设置事件监听器
setupEventListeners() {
    // 绑定this上下文，方便后续移除监听器
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
    
    // 滚动事件 - 导航栏样式变化
    window.addEventListener('scroll', this.handleScroll);
    
    // 移动端菜单
    document.getElementById('menuBtn').addEventListener('click', this.handleMenuClick);
    
    // 平滑滚动和页面切换
    document.querySelectorAll('.page-link').forEach(anchor => {
      anchor.addEventListener('click', this.handleAnchorClick);
    });
    
    // Logo点击返回首页
    document.getElementById('logoHome').addEventListener('click', this.handleLogoClick);
  },

  // 语言切换事件绑定
  bindLanguageEvents() {
    document.getElementById('langEN').addEventListener('click', () => this.changeLanguage('en'));
    document.getElementById('langZH').addEventListener('click', () => this.changeLanguage('zh'));
  },

  // 菜单相关事件绑定
  bindMenuEvents() {
    // 用户菜单切换
    document.getElementById('userMenuBtn').addEventListener('click', () => {
      document.getElementById('userDropdown').classList.toggle('hidden');
    });
    
    // 管理员菜单切换
    document.getElementById('adminMenuBtn').addEventListener('click', () => {
      document.getElementById('adminDropdown').classList.toggle('hidden');
    });
    
    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', this.handleDocumentClick);
    
    // 登出按钮
    document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
    document.getElementById('mobileLogoutBtn').addEventListener('click', () => this.logout());

    // 管理员登出
    document.getElementById('adminLogoutBtn').addEventListener('click', () => this.adminLogout());
    document.getElementById('mobileAdminLogoutBtn').addEventListener('click', () => this.adminLogout());
  },

  // 认证相关事件绑定
  bindAuthEvents() {
    // 登录/注册切换
    document.getElementById('showLogin').addEventListener('click', () => this.showLoginForm());
    document.getElementById('showRegister').addEventListener('click', () => this.showRegisterForm());
    
    // 管理员登录切换
    document.getElementById('showAdminLogin').addEventListener('click', () => this.showAdminLoginForm());
    document.getElementById('backToUserLogin').addEventListener('click', () => this.showLoginForm());
    
    // Firebase登录按钮
    document.getElementById('emailLoginBtn').addEventListener('click', () => this.handleEmailLogin());
    document.getElementById('googleLoginBtn').addEventListener('click', () => this.handleGoogleLogin());
    
    // 管理员登录表单提交
    document.getElementById('adminLoginFormElement').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAdminLogin();
    });
  },

  // 处理滚动事件
  handleScroll() {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 10) {
      navbar.classList.add('py-2', 'bg-monkey-darker/95');
      navbar.classList.remove('py-4');
    } else {
      navbar.classList.remove('py-2', 'bg-monkey-darker/95');
      navbar.classList.add('py-4');
    }
},

// 处理文档点击事件（关闭下拉菜单）
handleDocumentClick(e) {
    const userMenu = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const adminMenu = document.getElementById('adminMenuBtn');
    const adminDropdown = document.getElementById('adminDropdown');
    
    if (!userMenu.contains(e.target) && !userDropdown.contains(e.target)) {
      userDropdown.classList.add('hidden');
    }
    
    if (!adminMenu.contains(e.target) && !adminDropdown.contains(e.target)) {
      adminDropdown.classList.add('hidden');
    }
},

// 处理菜单点击事件
handleMenuClick() {
    const mobileMenu = document.getElementById('mobileMenu');
    const menuBtn = document.getElementById('menuBtn');
    
    mobileMenu.classList.toggle('hidden');
    if (mobileMenu.classList.contains('hidden')) {
      menuBtn.innerHTML = '<i class="fa fa-bars text-2xl"></i>';
    } else {
      menuBtn.innerHTML = '<i class="fa fa-times text-2xl"></i>';
    }
},

// 处理锚点点击事件
handleAnchorClick(e) {
    e.preventDefault();
    
    const targetId = e.currentTarget.getAttribute('href').substring(1);
    const mobileMenu = document.getElementById('mobileMenu');
    const menuBtn = document.getElementById('menuBtn');
    
    if (this.currentAdmin) {
      this.showAdminPage(targetId);
    } else if (this.currentUser) {
      this.showPage(targetId);
    } else {
      // 如果用户未登录，显示登录页面
      this.showAuthPage();
    }
    
    // 关闭移动端菜单
    if (!mobileMenu.classList.contains('hidden')) {
      mobileMenu.classList.add('hidden');
      menuBtn.innerHTML = '<i class="fa fa-bars text-2xl"></i>';
    }
    
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
},

// 处理Logo点击事件
handleLogoClick() {
    if (this.currentAdmin) {
      this.showAdminPage('adminDashboard');
    } else if (this.currentUser) {
      this.showPage('dashboard');
    } else {
      this.showAuthPage();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
},

// 移除事件监听器（在组件销毁时调用）
removeEventListeners() {
    window.removeEventListener('scroll', this.handleScroll);
    document.removeEventListener('click', this.handleDocumentClick);
    
    const menuBtn = document.getElementById('menuBtn');
    menuBtn.removeEventListener('click', this.handleMenuClick);
    
    document.querySelectorAll('.page-link').forEach(anchor => {
      anchor.removeEventListener('click', this.handleAnchorClick);
    });
    
    document.getElementById('logoHome').removeEventListener('click', this.handleLogoClick);
  },
  
  // 初始化语言
  initLanguage() {
    // 尝试从本地存储获取语言设置
    const savedLang = localStorage.getItem('monkeyPocketLang');
    if (savedLang) {
      this.changeLanguage(savedLang);
    } else {
      // 默认为中文
      this.changeLanguage('zh');
    }
  },
  
  // 切换语言
  changeLanguage(lang) {
    this.currentLang = lang;
    localStorage.setItem('monkeyPocketLang', lang);
    
    // 更新语言按钮样式
    if (lang === 'en') {
      document.getElementById('langEN').classList.add('bg-monkey-blue', 'text-white');
      document.getElementById('langEN').classList.remove('text-gray-300');
      document.getElementById('langZH').classList.remove('bg-monkey-blue', 'text-white');
      document.getElementById('langZH').classList.add('text-gray-300');
    } else {
      document.getElementById('langZH').classList.add('bg-monkey-blue', 'text-white');
      document.getElementById('langZH').classList.remove('text-gray-300');
      document.getElementById('langEN').classList.remove('bg-monkey-blue', 'text-white');
      document.getElementById('langEN').classList.add('text-gray-300');
    }
    
    // 更新页面文本
    this.updateTranslations();
  },
  
  // 加载翻译文件
  getTranslations() {
    return fetch('./translations.json')
      .then(response => response.json())
      .then(translations => {
        this.translations = translations;
        return translations[this.currentLang];
      });
  },
  
  // 更新页面翻译
  updateTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[this.currentLang] && translations[this.currentLang][key]) {
        el.innerHTML = translations[this.currentLang][key];
    }
    });
  },
  
  // 获取翻译文本
  getTranslation(key) {
    const translations = this.translations?.[this.currentLang] || {};
    return translations[key] || key;
  },
  
  // 显示认证页面
  showAuthPage() {
    document.getElementById('authPage').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('adminContent').classList.add('hidden');
    document.getElementById('userMenu').classList.add('hidden');
    document.getElementById('adminMenu').classList.add('hidden');
    document.getElementById('mobileUserMenu').classList.add('hidden');
    document.getElementById('mobileAdminMenu').classList.add('hidden');
    document.getElementById('adminNavLink').classList.remove('hidden');
    document.getElementById('mobileAdminNavLink').classList.remove('hidden');
    this.showLoginForm();
  },
  
  // 显示主内容
  showMainContent() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('adminContent').classList.add('hidden');
    document.getElementById('userMenu').classList.remove('hidden');
    document.getElementById('adminMenu').classList.add('hidden');
    document.getElementById('mobileUserMenu').classList.remove('hidden');
    document.getElementById('mobileAdminMenu').classList.add('hidden');
    document.getElementById('adminNavLink').classList.add('hidden');
    document.getElementById('mobileAdminNavLink').classList.add('hidden');
    
    // 更新用户信息显示
    if (this.currentUser) {
      const username = this.currentUser.username;
      document.getElementById('usernameDisplay').textContent = username;
      document.getElementById('dropdownUsername').textContent = username;
      document.getElementById('dropdownEmail').textContent = this.currentUser.email;
      document.getElementById('userInitial').textContent = username.charAt(0).toUpperCase();
    }
  },
  
  // 显示管理员内容
  showAdminContent() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('adminContent').classList.remove('hidden');
    document.getElementById('userMenu').classList.add('hidden');
    document.getElementById('adminMenu').classList.remove('hidden');
    document.getElementById('mobileUserMenu').classList.add('hidden');
    document.getElementById('mobileAdminMenu').classList.remove('hidden');
    document.getElementById('adminNavLink').classList.add('hidden');
    document.getElementById('mobileAdminNavLink').classList.add('hidden');
  },
  
  // 显示登录表单
  showLoginForm() {
    document.getElementById('emailLoginForm').classList.remove('hidden');
    document.getElementById('adminLoginForm').classList.add('hidden');
    document.getElementById('showLogin').classList.add('bg-monkey-blue', 'text-white');
    document.getElementById('showLogin').classList.remove('text-gray-300');
    document.getElementById('showRegister').classList.remove('bg-monkey-blue', 'text-white');
    document.getElementById('showRegister').classList.add('text-gray-300');
  },
  
  // 显示注册表单
  showRegisterForm() {
    // 实际应用中实现注册逻辑
    alert('注册功能请通过邮箱或Google账号登录流程完成');
    this.showLoginForm();
  },
  
  // 显示管理员登录表单
  showAdminLoginForm() {
    document.getElementById('adminLoginForm').classList.remove('hidden');
    document.getElementById('emailLoginForm').classList.add('hidden');
    document.getElementById('showLogin').classList.remove('bg-monkey-blue', 'text-white');
    document.getElementById('showLogin').classList.add('text-gray-300');
    document.getElementById('showRegister').classList.remove('bg-monkey-blue', 'text-white');
    document.getElementById('showRegister').classList.add('text-gray-300');
  },
  
  // 显示页面
  showPage(pageId) {
    // 隐藏所有页面
    document.querySelectorAll('.page-section').forEach(section => {
      section.classList.remove('active');
      setTimeout(() => {
        section.classList.add('hidden');
      }, 50);
    });
    
    // 显示目标页面
    setTimeout(() => {
      const targetPage = document.getElementById(pageId);
      if (targetPage) {
        targetPage.classList.remove('hidden');
        setTimeout(() => {
          targetPage.classList.add('active');
        }, 50);
      }
    }, 100);
    
    // 更新活动页面
    this.activePage = pageId;
    
    // 更新页面内容
    if (pageId === 'dashboard') {
      this.updateDashboard();
    } else if (pageId === 'myPockets') {
      this.renderPocketsList();
    } else if (pageId === 'items') {
      this.updatePocketSelectors();
      this.renderItemsList();
    } else if (pageId === 'retrieve') {
      this.updateRetrievePocketSelector();
      this.renderAvailableItemsList();
    }
  },
  
  // 显示管理员页面
  showAdminPage(pageId) {
    // 管理员页面逻辑
  },
  
  // 处理管理员登录
  handleAdminLogin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value.trim();
    
    const adminLoginError = document.getElementById('adminLoginError');
    const adminLoginErrorMsg = document.getElementById('adminLoginErrorMsg');
    
    // 验证管理员凭据（从环境变量读取）
    if (username === this.adminUsername && password === this.adminPassword) {
      // 登录成功
      adminLoginError.classList.add('hidden');
      this.saveCurrentAdmin({ username });
    } else {
      // 登录失败
      adminLoginErrorMsg.textContent = '管理员账号或密码不正确';
      adminLoginError.classList.remove('hidden');
    }
  },
  
  // 保存当前管理员
  saveCurrentAdmin(admin) {
    this.currentAdmin = admin;
    
    // 设置会话过期时间 (12小时)
    const expiry = new Date().getTime() + (12 * 60 * 60 * 1000);
    sessionStorage.setItem('monkeyPocketAdmin', JSON.stringify({
      adminUsername: admin.username,
      expiry
    }));
    
    this.showAdminContent();
    this.updateAdminDashboard();
    this.showAdminPage('adminDashboard');
  },
  
  // 退出登录
  logout() {
    signOut(auth).then(() => {
      this.currentUser = null;
      localStorage.removeItem('monkeyPocketCurrentUser');
      sessionStorage.removeItem('monkeyPocketCurrentUser');
      this.showAuthPage();
    });
  },
  
  // 退出管理员
  adminLogout() {
    this.currentAdmin = null;
    sessionStorage.removeItem('monkeyPocketAdmin');
    this.showAuthPage();
  },
  
  // 更新仪表板
  updateDashboard() {
    // 仪表板更新逻辑
  },
  
  // 更新管理员仪表板
  updateAdminDashboard() {
    // 管理员仪表板更新逻辑
  },
  
  // 创建演示数据
  createDemoData() {
    // 创建演示用户数据
  },
  
  // 创建演示激活码
  createDemoActivationCodes() {
    // 创建演示激活码
  }
};

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  AppState.init();
});