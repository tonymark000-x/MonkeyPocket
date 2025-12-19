import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import '../styles.css';
import translations from '../translations.json';
import Router from './router';
import AuthManager from './auth';
import DashboardManager from './dashboard';

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

// 定义 ADMIN_CONFIG
const ADMIN_CONFIG = {
  username: process.env.ADMIN_USERNAME || 'MonkeyKingdomCEO',
  password: process.env.ADMIN_PASSWORD || 'default_password'
};

// 初始化 Firebase
let app, auth;
const firebaseConfig = checkFirebaseConfig();
if (firebaseConfig) {
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
  init(router) {
    this.router = router;
    this.loadUsersFromStorage();
    this.loadActivationCodesFromStorage();
    this.checkAutoLogin();
    this.checkAdminAutoLogin();
    this.setupEventListeners();
    this.initLanguage();
    
    if (Object.keys(this.activationCodes).length === 0) {
      this.createDemoActivationCodes();
    }
    
    this.setupFirebaseAuthListener();
    
    // 初始化仪表板管理器
    this.dashboardManager = new DashboardManager(this);
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
          this.router.navigate('/login');
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
    
    this.dashboardManager.updateDashboard();
    this.router.navigate('/dashboard');
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
        this.router.navigate('/dashboard');
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
  },
  
  // 其他方法保持不变...
  showAuthPage() {
    document.getElementById('authPage').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('adminContent').classList.add('hidden');
  },
  
  showMainContent() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    document.getElementById('adminContent').classList.add('hidden');
  },
  
  showAdminContent() {
    document.getElementById('authPage').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('adminContent').classList.remove('hidden');
  },
  
  showPage(pageId) {
    // 隐藏所有页面
    document.querySelectorAll('.page-section').forEach(section => {
      section.classList.add('hidden');
    });
    
    // 显示选中页面
    document.getElementById(pageId).classList.remove('hidden');
    this.activePage = pageId;
  },
  
  showAdminPage(pageId) {
    // 隐藏所有管理员页面
    document.querySelectorAll('#adminContent .page-section').forEach(section => {
      section.classList.add('hidden');
    });
    
    // 显示选中页面
    document.getElementById(pageId).classList.remove('hidden');
    this.activePage = pageId;
  },
  
  // 语言相关方法
  initLanguage() {
    // 尝试从本地存储获取语言设置
    const savedLang = localStorage.getItem('monkeyPocketLang');
    if (savedLang) {
      this.changeLanguage(savedLang);
    } else {
      this.applyTranslations();
    }
  },
  
  changeLanguage(lang) {
    if (!translations[lang]) return;
    
    this.currentLang = lang;
    localStorage.setItem('monkeyPocketLang', lang);
    
    // 更新语言按钮样式
    document.getElementById('langEN').classList.remove('bg-monkey-blue', 'text-white');
    document.getElementById('langZH').classList.remove('bg-monkey-blue', 'text-white');
    document.getElementById('langEN').classList.add('text-gray-300');
    document.getElementById('langZH').classList.add('text-gray-300');
    document.getElementById(`lang${lang.toUpperCase()}`).classList.add('bg-monkey-blue', 'text-white');
    document.getElementById(`lang${lang.toUpperCase()}`).classList.remove('text-gray-300');
    
    this.applyTranslations();
  },
  
  getTranslations() {
    return translations[this.currentLang] || translations.zh;
  },
  
  getTranslation(key) {
    return this.getTranslations()[key] || key;
  },
  
  applyTranslations() {
    const translations = this.getTranslations();
    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.getAttribute('data-i18n');
      if (translations[key]) {
        element.innerHTML = translations[key];
      }
    });
  },
  
  // 处理滚动事件
  handleScroll() {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 10) {
      navbar.classList.add('py-2', 'shadow-md');
      navbar.classList.remove('py-4');
    } else {
      navbar.classList.add('py-4');
      navbar.classList.remove('py-2', 'shadow-md');
    }
  },
  
  // 处理点击其他地方关闭下拉菜单
  handleDocumentClick(event) {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const adminMenuBtn = document.getElementById('adminMenuBtn');
    const adminDropdown = document.getElementById('adminDropdown');
    
    if (!userMenuBtn.contains(event.target) && !userDropdown.contains(event.target)) {
      userDropdown.classList.add('hidden');
    }
    
    if (!adminMenuBtn.contains(event.target) && !adminDropdown.contains(event.target)) {
      adminDropdown.classList.add('hidden');
    }
  },
  
  // 移动端菜单切换
  handleMenuClick() {
    const mobileMenu = document.getElementById('mobileMenu');
    mobileMenu.classList.toggle('hidden');
  },
  
  // 处理页面链接点击
  handleAnchorClick(event) {
    event.preventDefault();
    const targetId = event.currentTarget.getAttribute('href').substring(1);
    this.router.navigate(`/${targetId}`);
    
    // 关闭移动端菜单
    document.getElementById('mobileMenu').classList.add('hidden');
  },
  
  // 处理Logo点击
  handleLogoClick(event) {
    event.preventDefault();
    this.router.navigate('/');
  },
  
  // 创建演示数据
  createDemoData() {
    // 创建演示用户
    this.users['demo@example.com'] = {
      id: 'demo123',
      email: 'demo@example.com',
      username: 'Demo User',
      photoURL: ''
    };
    
    localStorage.setItem('monkeyPocketUsers', JSON.stringify(this.users));
    
    // 初始化演示用户数据
    const demoUserData = {
      pockets: [
        { id: 'p1', name: '我的第一个百宝袋', activated: true, items: 5 },
        { id: 'p2', name: '备用百宝袋', activated: true, items: 2 }
      ],
      recentActivity: [
        { id: 'a1', action: '添加了物品', item: '笔记本电脑', time: new Date().toISOString() },
        { id: 'a2', action: '激活了百宝袋', item: '我的第一个百宝袋', time: new Date().toISOString() }
      ]
    };
    
    localStorage.setItem('user_demo123_data', JSON.stringify(demoUserData));
  },
  
  // 创建演示激活码
  createDemoActivationCodes() {
    const codes = [];
    for (let i = 1; i <= 10; i++) {
      codes.push({
        code: `MK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        created: new Date().toISOString(),
        used: i > 7,
        usedBy: i > 7 ? `user${i}@example.com` : null,
        usedAt: i > 7 ? new Date(Date.now() - (i * 86400000)).toISOString() : null
      });
    }
    
    this.activationCodes = codes;
    localStorage.setItem('monkeyPocketActivationCodes', JSON.stringify(codes));
  }
};

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  const router = new Router(AppState);
  AppState.init(router);
  
  // 初始化认证管理器
  new AuthManager(AppState, auth, router);
});