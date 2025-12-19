// 路由管理
class Router {
  constructor(appState) {
    this.appState = appState;
    this.routes = {
      '/': this.handleRoot.bind(this),
      '/login': this.handleLogin.bind(this),
      '/dashboard': this.handleDashboard.bind(this),
      '/adminlogin': this.handleAdminLogin.bind(this)
    };
    
    this.init();
  }
  
  init() {
    // 监听路由变化
    window.addEventListener('popstate', () => this.handleRouteChange());
    
    // 初始路由处理
    this.handleRouteChange();
  }
  
  handleRouteChange() {
    const path = window.location.pathname;
    const routeHandler = this.routes[path] || this.handleNotFound;
    routeHandler();
  }
  
  navigate(path) {
    window.history.pushState({}, '', path);
    this.handleRouteChange();
  }
  
  handleRoot() {
    if (this.appState.currentUser || this.appState.currentAdmin) {
      this.navigate('/dashboard');
    } else {
      this.navigate('/login');
    }
  }
  
  handleLogin() {
    if (this.appState.currentUser || this.appState.currentAdmin) {
      this.navigate('/dashboard');
    } else {
      this.appState.showAuthPage();
    }
  }
  
  handleDashboard() {
    if (!this.appState.currentUser && !this.appState.currentAdmin) {
      this.navigate('/login');
    } else {
      if (this.appState.currentAdmin) {
        this.appState.showAdminContent();
        this.appState.showAdminPage('adminDashboard');
      } else {
        this.appState.showMainContent();
        this.appState.showPage('dashboard');
      }
    }
  }
  
  handleAdminLogin() {
    if (this.appState.currentUser || this.appState.currentAdmin) {
      this.navigate('/dashboard');
    } else {
      // 显示管理员登录表单
      document.getElementById('authPage').classList.remove('hidden');
      document.getElementById('emailLoginForm').classList.add('hidden');
      document.getElementById('registerForm').classList.add('hidden');
      document.getElementById('adminLoginForm').classList.remove('hidden');
    }
  }
  
  handleNotFound() {
    this.navigate('/');
  }
}

export default Router;