// server.ts - Deno 后端服务，使用 Gmail SMTP 发送邮箱验证码

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { createHash, randomBytes } from "https://deno.land/std@0.177.0/crypto/mod.ts";

// 环境变量配置
const PORT = Deno.env.get("PORT") || "3001";
const GMAIL_USER = Deno.env.get("GMAIL_USER") || "";
const GMAIL_PASS = Deno.env.get("GMAIL_PASS") || "";
const API_BASE_URL = Deno.env.get("API_BASE_URL") || "http://localhost:3001";

// 验证码存储（实际生产环境应该使用数据库）
const verificationCodes = new Map<string, { code: string; expires: number; attempts: number }>();

// 生成6位随机验证码
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 初始化 SMTP 客户端
const client = new SmtpClient();

// 健康检查端点
async function handleHealthCheck(): Promise<Response> {
  return new Response(
    JSON.stringify({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      service: "email-verification-service"
    }),
    { 
      headers: { "Content-Type": "application/json" },
      status: 200
    }
  );
}

// 发送验证码端点
async function handleSendVerificationCode(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { email } = body;
    
    if (!email || !validateEmail(email)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "无效的邮箱地址" 
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 400
        }
      );
    }
    
    // 检查是否在冷却期内（60秒内只能发送一次）
    const existingCode = verificationCodes.get(email);
    if (existingCode && Date.now() < existingCode.expires - 9 * 60 * 1000) {
      const cooldown = Math.ceil((existingCode.expires - 9 * 60 * 1000 - Date.now()) / 1000);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `请等待 ${cooldown} 秒后再发送验证码` 
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 429
        }
      );
    }
    
    // 生成验证码
    const verificationCode = generateVerificationCode();
    const expires = Date.now() + 10 * 60 * 1000; // 10分钟有效期
    
    // 存储验证码
    verificationCodes.set(email, {
      code: verificationCode,
      expires,
      attempts: 0
    });
    
    // 清理过期验证码
    cleanupExpiredCodes();
    
    // 准备邮件内容
    const mailOptions = {
      from: GMAIL_USER,
      to: email,
      subject: "您的验证码 - MonkeyPocket 登录系统",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .code { background: #fff; border: 2px dashed #667eea; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; color: #667eea; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin-top: 20px; color: #856404; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>MonkeyPocket</h1>
              <p>邮箱验证码</p>
            </div>
            <div class="content">
              <h2>您好！</h2>
              <p>您正在注册或登录 MonkeyPocket 账户，请输入以下验证码完成验证：</p>
              
              <div class="code">${verificationCode}</div>
              
              <p>验证码将在 <strong>10分钟</strong> 后失效，请尽快使用。</p>
              
              <div class="warning">
                <p><strong>安全提示：</strong></p>
                <ul>
                  <li>请勿将此验证码告诉任何人</li>
                  <li>MonkeyPocket 工作人员不会向您索要验证码</li>
                  <li>如果您没有请求此验证码，请忽略此邮件</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} MonkeyPocket. 保留所有权利。</p>
              <p>此邮件为系统自动发送，请勿直接回复。</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    
    // 发送邮件
    try {
      await client.connectTLS({
        hostname: "smtp.gmail.com",
        port: 465,
        username: GMAIL_USER,
        password: GMAIL_PASS,
      });
      
      await client.send(mailOptions);
      await client.close();
      
      console.log(`验证码已发送到 ${email}`);
      
      // 开发环境下，也返回验证码便于测试
      const responseData: any = { 
        success: true, 
        message: "验证码已发送到您的邮箱" 
      };
      
      // 如果是开发环境，返回验证码便于测试
      if (Deno.env.get("NODE_ENV") === "development") {
        responseData.code = verificationCode;
        console.log(`开发环境验证码: ${verificationCode}`);
      }
      
      return new Response(
        JSON.stringify(responseData),
        { 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          },
          status: 200
        }
      );
      
    } catch (smtpError) {
      console.error("SMTP 发送失败:", smtpError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "邮件发送失败，请检查邮箱地址或稍后重试" 
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 500
        }
      );
    }
    
  } catch (error) {
    console.error("处理请求失败:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: "服务器内部错误" 
      }),
      { 
        headers: { "Content-Type": "application/json" },
        status: 500
      }
    );
  }
}

// 验证验证码端点
async function handleVerifyCode(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { email, code } = body;
    
    if (!email || !code) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "邮箱和验证码不能为空" 
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 400
        }
      );
    }
    
    const storedData = verificationCodes.get(email);
    
    if (!storedData) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "验证码不存在或已过期，请重新获取" 
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 400
        }
      );
    }
    
    // 检查是否过期
    if (Date.now() > storedData.expires) {
      verificationCodes.delete(email);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "验证码已过期，请重新获取" 
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 400
        }
      );
    }
    
    // 检查尝试次数
    if (storedData.attempts >= 5) {
      verificationCodes.delete(email);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "验证码尝试次数过多，请重新获取" 
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 400
        }
      );
    }
    
    // 验证验证码
    if (storedData.code === code) {
      // 验证成功，删除验证码
      verificationCodes.delete(email);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "验证码验证成功" 
        }),
        { 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
          },
          status: 200
        }
      );
    } else {
      // 验证失败，增加尝试次数
      storedData.attempts++;
      verificationCodes.set(email, storedData);
      
      const remainingAttempts = 5 - storedData.attempts;
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `验证码错误，还有 ${remainingAttempts} 次尝试机会` 
        }),
        { 
          headers: { "Content-Type": "application/json" },
          status: 400
        }
      );
    }
    
  } catch (error) {
    console.error("验证验证码失败:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: "服务器内部错误" 
      }),
      { 
        headers: { "Content-Type": "application/json" },
        status: 500
      }
    );
  }
}

// 清理过期的验证码
function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expires) {
      verificationCodes.delete(email);
    }
  }
}

// 邮箱格式验证
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// 主请求处理器
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 设置 CORS 头部
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  
  // 处理预检请求
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
      status: 204
    });
  }
  
  console.log(`${new Date().toISOString()} ${request.method} ${path}`);
  
  // 路由处理
  switch (path) {
    case "/api/health":
    case "/health":
      return handleHealthCheck();
      
    case "/api/send-verification-code":
      if (request.method === "POST") {
        return handleSendVerificationCode(request);
      }
      break;
      
    case "/api/verify-code":
      if (request.method === "POST") {
        return handleVerifyCode(request);
      }
      break;
  }
  
  // 默认返回 404
  return new Response(
    JSON.stringify({ 
      success: false, 
      message: "端点不存在" 
    }),
    { 
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      },
      status: 404
    }
  );
}

// 启动服务器
console.log(`🚀 邮件验证服务启动中...`);
console.log(`📧 Gmail 用户: ${GMAIL_USER ? "已设置" : "未设置"}`);
console.log(`🔐 Gmail 密码: ${GMAIL_PASS ? "已设置" : "未设置"}`);
console.log(`🌐 服务地址: http://localhost:${PORT}`);
console.log(`📤 API 基础地址: ${API_BASE_URL}`);

if (!GMAIL_USER || !GMAIL_PASS) {
  console.warn("⚠️  警告: GMAIL_USER 或 GMAIL_PASS 环境变量未设置，邮件发送功能将不可用！");
  console.warn("   请在 .env 文件中设置以下环境变量：");
  console.warn("   GMAIL_USER=your-email@gmail.com");
  console.warn("   GMAIL_PASS=your-app-password");
}

serve(handleRequest, { port: parseInt(PORT) });