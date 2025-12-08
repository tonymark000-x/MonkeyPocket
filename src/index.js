import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";

// 导入自定义样式
import './styles.css';

// 简化配置，直接从环境变量读取
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Deno 部署的后端地址
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

// 验证码相关变量
let codeTimer = null;
let countdown = 60;

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

function initApp() {
  console.log('初始化登录系统...');
  createCustomAuthUI();
  initAuthStateListener();
  checkSignInLink();
}

// 创建自定义登录/注册界面
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM加载完成，初始化登录系统...');
  createCustomAuthUI();
  initAuthStateListener();
  checkSignInLink();
});

// 创建自定义登录/注册界面
function createCustomAuthUI() {
  const container = document.getElementById('firebaseui-auth-container');
  if (!container) {
    console.error('找不到firebaseui-auth-container元素');
    return;
  }
  
  container.innerHTML = `
    <div class="auth-container">
      <!-- 标签切换 -->
      <div class="tabs">
        <button id="tab-login" class="tab active">登录</button>
        <button id="tab-register" class="tab">注册</button>
      </div>
      
      <!-- 登录表单 -->
      <form id="login-form" class="auth-form active-form">
        <div class="form-group">
          <label for="login-email">邮箱</label>
          <input type="email" id="login-email" placeholder="请输入邮箱" required>
        </div>
        
        <div class="form-group">
          <label for="login-password">密码</label>
          <div class="password-input-wrapper">
            <input type="password" id="login-password" placeholder="请输入密码" required>
            <button type="button" class="password-toggle-btn" id="toggle-login-password">
              <svg id="login-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="form-options">
          <label class="remember-me">
            <input type="checkbox" id="remember-me">
            <span>记住我</span>
          </label>
          <a href="#" id="forgot-password" class="forgot-password">忘记密码？</a>
        </div>
        
        <button type="submit" class="btn-primary">
          登录
        </button>
        
        <div class="divider">
          <span>或</span>
        </div>
        
        <button type="button" id="google-login-btn" class="btn-social btn-google">
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          使用 Google 登录
        </button>
      </form>
      
      <!-- 注册表单 -->
      <form id="register-form" class="auth-form">
        <div class="form-group">
          <label for="register-name">用户名</label>
          <input type="text" id="register-name" placeholder="请输入用户名" required>
        </div>
        
        <div class="form-group">
          <label for="register-email">邮箱</label>
          <input type="email" id="register-email" placeholder="请输入邮箱" required>
        </div>
        
        <div class="form-group verification-code-group">
          <div class="verification-code-input">
            <label for="verification-code">验证码</label>
            <input type="text" id="verification-code" placeholder="请输入验证码" required maxlength="6">
          </div>
          <button type="button" id="get-code-btn" class="get-code-btn">获取验证码</button>
        </div>
        <div id="code-countdown" class="code-countdown"></div>
        
        <div class="form-group">
          <label for="register-password">密码</label>
          <div class="password-input-wrapper">
            <input type="password" id="register-password" placeholder="至少6个字符" required>
            <button type="button" class="password-toggle-btn" id="toggle-register-password">
              <svg id="register-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
          <div class="password-strength">
            <div class="strength-bar"></div>
            <span class="strength-text">密码强度：无</span>
          </div>
        </div>
        
        <div class="form-group">
          <label for="register-confirm-password">确认密码</label>
          <div class="password-input-wrapper">
            <input type="password" id="register-confirm-password" placeholder="请再次输入密码" required>
            <button type="button" class="password-toggle-btn" id="toggle-confirm-password">
              <svg id="confirm-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="form-group checkbox-group">
          <input type="checkbox" id="accept-terms" required>
          <label for="accept-terms">我同意 <a href="/terms-of-service" target="_blank">服务条款</a> 和 <a href="/privacy-policy" target="_blank">隐私政策</a></label>
        </div>
        
        <button type="submit" class="btn-primary">
          注册
        </button>
      </form>
      
      <div id="auth-message" class="auth-message"></div>
    </div>
  `;
  
  // 添加事件监听
  setupEventListeners();
}

// 设置事件监听器
function setupEventListeners() {
  // 标签切换
  document.getElementById('tab-login').addEventListener('click', () => switchTab('login'));
  document.getElementById('tab-register').addEventListener('click', () => switchTab('register'));
  
  // 登录表单提交
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  
  // 注册表单提交
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  
  // 社交登录按钮
  document.getElementById('google-login-btn').addEventListener('click', handleGoogleLogin);
  
  // 忘记密码
  document.getElementById('forgot-password').addEventListener('click', handleForgotPassword);
  
  // 获取验证码按钮
  document.getElementById('get-code-btn').addEventListener('click', handleGetVerificationCode);
  
  // 眼睛图标切换密码显示
  setupPasswordToggles();
  
  // 密码强度检查
  const registerPassword = document.getElementById('register-password');
  if (registerPassword) {
    registerPassword.addEventListener('input', checkPasswordStrength);
  }
  
  // 确认密码检查
  const confirmPassword = document.getElementById('register-confirm-password');
  if (confirmPassword) {
    confirmPassword.addEventListener('input', checkPasswordMatch);
  }
  
  // 邮箱输入时检查
  const registerEmail = document.getElementById('register-email');
  if (registerEmail) {
    registerEmail.addEventListener('blur', validateEmailFormat);
  }
}

// 切换标签
function switchTab(tab) {
  const loginTab = document.getElementById('tab-login');
  const registerTab = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  
  if (tab === 'login') {
    loginTab.classList.add('active');
    registerTab.classList.remove('active');
    loginForm.classList.add('active-form');
    registerForm.classList.remove('active-form');
  } else {
    registerTab.classList.add('active');
    loginTab.classList.remove('active');
    registerForm.classList.add('active-form');
    loginForm.classList.remove('active-form');
  }
}

// 设置密码眼睛图标切换
function setupPasswordToggles() {
  // 登录密码眼睛图标
  const toggleLoginPassword = document.getElementById('toggle-login-password');
  const loginPassword = document.getElementById('login-password');
  const loginEyeIcon = document.getElementById('login-eye-icon');
  
  if (toggleLoginPassword && loginPassword) {
    toggleLoginPassword.addEventListener('click', () => {
      const type = loginPassword.getAttribute('type') === 'password' ? 'text' : 'password';
      loginPassword.setAttribute('type', type);
      
      // 切换眼睛图标
      if (type === 'text') {
        loginEyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      } else {
        loginEyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    });
  }
  
  // 注册密码眼睛图标
  const toggleRegisterPassword = document.getElementById('toggle-register-password');
  const registerPassword = document.getElementById('register-password');
  const registerEyeIcon = document.getElementById('register-eye-icon');
  
  if (toggleRegisterPassword && registerPassword) {
    toggleRegisterPassword.addEventListener('click', () => {
      const type = registerPassword.getAttribute('type') === 'password' ? 'text' : 'password';
      registerPassword.setAttribute('type', type);
      
      // 切换眼睛图标
      if (type === 'text') {
        registerEyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      } else {
        registerEyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    });
  }
  
  // 确认密码眼睛图标
  const toggleConfirmPassword = document.getElementById('toggle-confirm-password');
  const confirmPassword = document.getElementById('register-confirm-password');
  const confirmEyeIcon = document.getElementById('confirm-eye-icon');
  
  if (toggleConfirmPassword && confirmPassword) {
    toggleConfirmPassword.addEventListener('click', () => {
      const type = confirmPassword.getAttribute('type') === 'password' ? 'text' : 'password';
      confirmPassword.setAttribute('type', type);
      
      // 切换眼睛图标
      if (type === 'text') {
        confirmEyeIcon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      } else {
        confirmEyeIcon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    });
  }
}

// 处理获取验证码（使用Gmail SMTP发送）
async function handleGetVerificationCode() {
  const email = document.getElementById('register-email').value.trim();
  const getCodeBtn = document.getElementById('get-code-btn');
  const codeCountdown = document.getElementById('code-countdown');
  
  // 验证邮箱格式
  if (!validateEmailFormat()) {
    showMessage('请输入有效的邮箱地址', 'error');
    return;
  }
  
  // 检查后端服务是否可用
  if (!await checkBackendHealth()) {
    showMessage('邮件服务暂时不可用，请稍后重试', 'error');
    return;
  }
  
  // 禁用按钮并开始倒计时
  getCodeBtn.disabled = true;
  getCodeBtn.textContent = '发送中...';
  countdown = 60;
  
  try {
    // 调用后端 API 发送验证码
    const response = await fetch(`${API_BASE_URL}/send-verification-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showMessage(`验证码已发送到 ${email}，请查收邮件`, 'success');
      
      // 开发环境：显示验证码便于测试
      if (result.code && process.env.NODE_ENV === 'development') {
        console.log(`开发环境验证码: ${result.code}`);
        showMessage(`测试验证码: ${result.code} (仅开发环境)`, 'info');
      }
      
      // 显示倒计时
      codeCountdown.textContent = `${countdown}秒后可重新获取`;
      getCodeBtn.textContent = '重新获取验证码';
      
      // 启动倒计时
      codeTimer = setInterval(() => {
        countdown--;
        codeCountdown.textContent = `${countdown}秒后可重新获取`;
        
        if (countdown <= 0) {
          clearInterval(codeTimer);
          getCodeBtn.disabled = false;
          getCodeBtn.textContent = '获取验证码';
          codeCountdown.textContent = '';
        }
      }, 1000);
      
    } else {
      showMessage(`发送失败: ${result.message}`, 'error');
      getCodeBtn.disabled = false;
      getCodeBtn.textContent = '获取验证码';
    }
    
  } catch (error) {
    console.error('发送验证码失败:', error);
    showMessage('网络错误，请检查后端服务是否运行', 'error');
    getCodeBtn.disabled = false;
    getCodeBtn.textContent = '获取验证码';
  }
}

// 检查后端服务健康状态
async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.status === 'ok';
    }
    return false;
  } catch (error) {
    console.warn('后端服务健康检查失败:', error);
    return false;
  }
}

// 验证验证码（调用后端API）
async function verifyVerificationCode(email, code) {
  try {
    const response = await fetch(`${API_BASE_URL}/verify-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, code })
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('验证验证码失败:', error);
    return { 
      success: false, 
      message: '网络错误，验证失败' 
    };
  }
}

// 检查密码强度
function checkPasswordStrength() {
  const password = document.getElementById('register-password').value;
  const strengthBar = document.querySelector('.strength-bar');
  const strengthText = document.querySelector('.strength-text');
  
  if (!strengthBar || !strengthText) return;
  
  if (!password) {
    strengthBar.style.width = '0%';
    strengthBar.style.backgroundColor = '#ddd';
    strengthText.textContent = '密码强度：无';
    return;
  }
  
  let score = 0;
  
  // 长度检查
  if (password.length >= 8) score += 25;
  if (password.length >= 12) score += 15;
  
  // 复杂度检查
  if (/[a-z]/.test(password)) score += 10;
  if (/[A-Z]/.test(password)) score += 10;
  if (/[0-9]/.test(password)) score += 10;
  if (/[^A-Za-z0-9]/.test(password)) score += 10;
  
  // 设置强度和颜色
  let strength = '弱';
  let color = '#ff4757';
  
  if (score >= 60) {
    strength = '强';
    color = '#2ed573';
  } else if (score >= 30) {
    strength = '中';
    color = '#ffa502';
  }
  
  strengthBar.style.width = Math.min(score, 100) + '%';
  strengthBar.style.backgroundColor = color;
  strengthText.textContent = `密码强度：${strength}`;
}

// 检查密码是否匹配
function checkPasswordMatch() {
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;
  const confirmInput = document.getElementById('register-confirm-password');
  
  if (!confirmPassword) return;
  
  if (password === confirmPassword) {
    confirmInput.style.borderColor = '#2ed573';
  } else {
    confirmInput.style.borderColor = '#ff4757';
  }
}

// 验证邮箱格式
function validateEmailFormat() {
  const email = document.getElementById('register-email').value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (email && !emailRegex.test(email)) {
    showMessage('邮箱格式不正确', 'error');
    return false;
  }
  
  return true;
}

// 处理登录
async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  
  if (!email || !password) {
    showMessage('请输入邮箱和密码', 'error');
    return;
  }
  
  showMessage('正在登录...', 'info');
  
  try {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, password);
    showMessage('登录成功！', 'success');
  } catch (error) {
    console.error('登录失败:', error);
    showMessage(getErrorMessage(error), 'error');
  }
}

// 处理注册
async function handleRegister(e) {
  e.preventDefault();
  
  const name = document.getElementById('register-name').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;
  const inputCode = document.getElementById('verification-code').value.trim();
  const acceptTerms = document.getElementById('accept-terms').checked;
  
  // 验证输入
  if (!name || !email || !password || !confirmPassword || !inputCode) {
    showMessage('请填写所有字段', 'error');
    return;
  }
  
  if (!acceptTerms) {
    showMessage('请同意服务条款和隐私政策', 'error');
    return;
  }
  
  if (password !== confirmPassword) {
    showMessage('两次输入的密码不一致', 'error');
    return;
  }
  
  if (password.length < 6) {
    showMessage('密码至少需要6个字符', 'error');
    return;
  }
  
  // 验证验证码
  showMessage('正在验证验证码...', 'info');
  
  const verificationResult = await verifyVerificationCode(email, inputCode);
  
  if (!verificationResult.success) {
    showMessage(verificationResult.message, 'error');
    return;
  }
  
  showMessage('正在注册...', 'info');
  
  try {
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // 更新用户显示名称
    await updateProfile(userCredential.user, {
      displayName: name
    });
    
    // 清除验证码输入
    document.getElementById('verification-code').value = '';
    
    // 停止倒计时
    if (codeTimer) {
      clearInterval(codeTimer);
    }
    
    showMessage('注册成功！已自动登录', 'success');
    
    // 切换回登录标签页
    setTimeout(() => {
      switchTab('login');
    }, 2000);
    
  } catch (error) {
    console.error('注册失败:', error);
    showMessage(getErrorMessage(error), 'error');
  }
}

// 处理Google登录
async function handleGoogleLogin() {
  showMessage('正在使用Google登录...', 'info');
  
  try {
    const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    showMessage('Google登录成功！', 'success');
  } catch (error) {
    console.error('Google登录失败:', error);
    showMessage(getErrorMessage(error), 'error');
  }
}

// 处理忘记密码
async function handleForgotPassword(e) {
  e.preventDefault();
  
  const email = prompt('请输入您的邮箱地址以重置密码:');
  if (!email) return;
  
  if (!validateEmail(email)) {
    alert('邮箱格式不正确');
    return;
  }
  
  try {
    const { sendPasswordResetEmail } = await import('firebase/auth');
    await sendPasswordResetEmail(auth, email);
    alert('重置密码邮件已发送到您的邮箱，请查收。');
  } catch (error) {
    console.error('发送重置密码邮件失败:', error);
    alert('发送重置密码邮件失败: ' + getErrorMessage(error));
  }
}

// 显示消息
function showMessage(message, type) {
  const messageEl = document.getElementById('auth-message');
  messageEl.textContent = message;
  messageEl.className = `auth-message ${type}`;
  messageEl.style.display = 'block';
  
  // 3秒后自动隐藏（成功消息）或5秒后（错误消息）
  const hideTime = type === 'success' ? 3000 : 5000;
  setTimeout(() => {
    messageEl.style.display = 'none';
  }, hideTime);
}

// 获取错误信息
function getErrorMessage(error) {
  const errorCode = error.code || '';
  const errorMessage = error.message || '';
  
  console.log('错误代码:', errorCode);
  
  switch (errorCode) {
    case 'auth/invalid-email':
      return '邮箱格式不正确';
    case 'auth/user-disabled':
      return '账号已被禁用';
    case 'auth/user-not-found':
      return '用户不存在，请先注册';
    case 'auth/wrong-password':
      return '密码错误';
    case 'auth/email-already-in-use':
      return '邮箱已被注册';
    case 'auth/weak-password':
      return '密码太弱，请使用更复杂的密码（至少6个字符）';
    case 'auth/operation-not-allowed':
      return '该登录方式暂未启用';
    case 'auth/too-many-requests':
      return '尝试次数过多，请稍后再试';
    case 'auth/network-request-failed':
      return '网络连接失败，请检查网络';
    case 'auth/popup-closed-by-user':
      return '登录窗口被关闭';
    case 'auth/cancelled-popup-request':
      return '登录请求被取消';
    case 'auth/popup-blocked':
      return '登录窗口被浏览器阻止，请允许弹出窗口';
    case 'auth/account-exists-with-different-credential':
      return '该邮箱已与其他登录方式关联';
    default:
      return errorMessage || '操作失败，请重试';
  }
}

// 邮箱验证
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// 监听认证状态变化
function initAuthStateListener() {
  onAuthStateChanged(auth, (user) => {
    console.log('认证状态变化:', user ? '已登录' : '未登录');
    
    const authContainer = document.getElementById('firebaseui-auth-container');
    const userInfoContainer = document.getElementById('user-info');
    
    if (user) {
      // 用户已登录
      console.log('用户信息:', user);
      
      // 显示用户信息
      if (userInfoContainer) {
        userInfoContainer.innerHTML = `
          <div class="user-profile">
            <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || user.email) + '&background=667eea&color=fff'}" 
                 alt="${user.displayName || user.email}" 
                 class="avatar">
            <div>
              <h3>${user.displayName || user.email}</h3>
              <p>${user.email}</p>
              <button id="sign-out-btn" class="btn-logout">退出登录</button>
            </div>
          </div>
        `;
        
        // 添加退出登录事件监听
        const signOutBtn = document.getElementById('sign-out-btn');
        if (signOutBtn) {
          signOutBtn.addEventListener('click', handleSignOut);
        }
      }
      
      // 隐藏登录界面
      if (authContainer) {
        authContainer.style.display = 'none';
      }
    } else {
      // 用户未登录
      if (userInfoContainer) {
        userInfoContainer.innerHTML = '';
      }
      
      if (authContainer) {
        authContainer.style.display = 'block';
      }
    }
  });
}

// 处理退出登录
async function handleSignOut() {
  try {
    await firebaseSignOut(auth);
    console.log('退出登录成功');
    showMessage('已退出登录', 'success');
  } catch (error) {
    console.error('退出登录失败:', error);
    showMessage('退出登录失败，请重试', 'error');
  }
}

// 检查URL中的登录链接
function checkSignInLink() {
  if (isSignInWithEmailLink(auth, window.location.href)) {
    console.log('检测到邮箱登录链接');
    
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      email = prompt('请输入您的邮箱地址以完成登录:');
    }
    
    if (email) {
      signInWithEmailLink(auth, email, window.location.href)
        .then((result) => {
          window.localStorage.removeItem('emailForSignIn');
          console.log('邮箱链接登录成功:', result.user);
          alert('邮箱链接登录成功！');
          
          // 清除URL中的认证参数
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch((error) => {
          console.error('邮箱链接登录失败:', error);
          alert('邮箱链接登录失败: ' + getErrorMessage(error));
        });
    }
  }
}

// 导出供其他模块使用
export { auth, handleSignOut };