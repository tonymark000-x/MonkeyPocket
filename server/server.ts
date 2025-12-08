// server.ts - 使用 Gmail API Service Account 发送邮件
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.177.0/encoding/base64.ts";
import { createHash } from "https://deno.land/std@0.177.0/crypto/mod.ts";

// 环境变量配置
const PORT = Deno.env.get("PORT") || "3001";
const SERVICE_ACCOUNT_EMAIL = Deno.env.get("SERVICE_ACCOUNT_EMAIL") || "";
const SERVICE_ACCOUNT_PRIVATE_KEY = Deno.env.get("SERVICE_ACCOUNT_PRIVATE_KEY") || "";
const TARGET_USER_EMAIL = Deno.env.get("TARGET_USER_EMAIL") || ""; // 模拟的用户邮箱
const API_BASE_URL = Deno.env.get("API_BASE_URL") || "http://localhost:3001";

// 验证码存储
const verificationCodes = new Map<string, { code: string; expires: number; attempts: number }>();

// 生成6位随机验证码
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 使用服务账户获取访问令牌
async function getServiceAccountAccessToken(): Promise<string> {
  try {
    // 1. 创建 JWT 头部
    const header = {
      alg: "RS256",
      typ: "JWT"
    };
    
    // 2. 创建 JWT 声明
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: SERVICE_ACCOUNT_EMAIL,
      scope: "https://www.googleapis.com/auth/gmail.send",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600, // 1小时有效期
      iat: now,
      sub: TARGET_USER_EMAIL // 模拟的用户邮箱
    };
    
    // 3. 编码 JWT
    const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const encodedClaims = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const message = `${encodedHeader}.${encodedClaims}`;
    
    // 4. 使用私钥签名（这里需要实现 RSA-SHA256 签名）
    // 注意：Deno 标准库不直接支持 RSA 签名，我们需要使用 Web Crypto API 或第三方库
    const signature = await signJWT(message, SERVICE_ACCOUNT_PRIVATE_KEY);
    
    // 5. 完整的 JWT
    const jwt = `${message}.${signature}`;
    
    // 6. 获取访问令牌
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("获取访问令牌失败:", errorText);
      throw new Error(`获取访问令牌失败: ${response.status}`);
    }
    
    const data = await response.json();
    console.log("成功获取访问令牌");
    return data.access_token;
    
  } catch (error) {
    console.error("获取服务账户访问令牌错误:", error);
    throw error;
  }
}

// 使用 Web Crypto API 进行 RSA-SHA256 签名
async function signJWT(message: string, privateKeyPEM: string): Promise<string> {
  try {
    // 移除 PEM 格式的头部和尾部
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const pemContents = privateKeyPEM
      .replace(pemHeader, "")
      .replace(pemFooter, "")
      .replace(/\n/g, "")
      .trim();
    
    // 将 Base64 解码为 ArrayBuffer
    const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    // 导入私钥
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" }
      },
      false,
      ["sign"]
    );
    
    // 签名消息
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const signature = await crypto.subtle.sign(
      {
        name: "RSASSA-PKCS1-v1_5"
      },
      cryptoKey,
      data
    );
    
    // 将签名转换为 Base64 URL 安全格式
    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    return signatureBase64;
  } catch (error) {
    console.error("JWT 签名错误:", error);
    throw error;
  }
}

// 使用 Gmail API 发送邮件
async function sendEmailWithGmailAPI(
  to: string, 
  subject: string, 
  html: string
): Promise<boolean> {
  try {
    // 1. 获取访问令牌
    const accessToken = await getServiceAccountAccessToken();
    
    // 2. 构建邮件内容
    const emailLines = [
      `From: "MonkeyPocket" <${TARGET_USER_EMAIL}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      html
    ];
    
    const email = emailLines.join("\r\n");
    
    // 3. Base64 编码（URL安全的）
    // 注意：Deno 中的 btoa 不支持 Unicode，需要先编码
    const emailBytes = new TextEncoder().encode(email);
    let base64Email = "";
    for (let i = 0; i < emailBytes.length; i += 3) {
      const chunk = emailBytes.slice(i, i + 3);
      base64Email += btoa(String.fromCharCode(...chunk))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
    
    // 4. 调用 Gmail API 发送邮件
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: base64Email,
        }),
      }
    );
    
    if (response.ok) {
      console.log(`✅ 邮件已通过 Gmail API 发送到 ${to}`);
      return true;
    } else {
      const errorText = await response.text();
      console.error("Gmail API 错误:", errorText);
      return false;
    }
    
  } catch (error) {
    console.error("调用 Gmail API 失败:", error);
    return false;
  }
}

// 简化版：使用现有的 JWT 库
// 由于上述 RSA 签名实现较复杂，推荐使用现有的 JWT 库

// 安装：deno add jsr:@david/djwt
import { create, verify } from "jsr:@david/djwt@v3.0.1";

async function getAccessTokenWithDJWT(): Promise<string> {
  try {
    const now = Math.floor(Date.now() / 1000);
    
    // 创建 JWT
    const jwt = await create(
      { alg: "RS256", typ: "JWT" },
      {
        iss: SERVICE_ACCOUNT_EMAIL,
        scope: "https://www.googleapis.com/auth/gmail.send",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now,
        sub: TARGET_USER_EMAIL
      },
      SERVICE_ACCOUNT_PRIVATE_KEY
    );
    
    // 获取访问令牌
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`获取令牌失败: ${errorText}`);
    }
    
    const data = await response.json();
    return data.access_token;
    
  } catch (error) {
    console.error("DJWT 获取令牌失败:", error);
    throw error;
  }
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
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
          status: 400
        }
      );
    }
    
    // 检查冷却期
    const existingCode = verificationCodes.get(email);
    if (existingCode && Date.now() < existingCode.expires - 9 * 60 * 1000) {
      const cooldown = Math.ceil((existingCode.expires - 9 * 60 * 1000 - Date.now()) / 1000);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `请等待 ${cooldown} 秒后再发送验证码` 
        }),
        { 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
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
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                    color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .code { background: #fff; border: 2px dashed #667eea; padding: 15px; 
                  text-align: center; font-size: 32px; font-weight: bold; 
                  letter-spacing: 5px; margin: 20px 0; color: #667eea; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; 
                     padding: 10px; border-radius: 5px; margin-top: 20px; color: #856404; }
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
    `;
    
    // 使用 Gmail API 发送邮件
    const emailSent = await sendEmailWithGmailAPI(
      email,
      "您的验证码 - MonkeyPocket 登录系统",
      htmlContent
    );
    
    if (emailSent) {
      const responseData: any = { 
        success: true, 
        message: "验证码已发送到您的邮箱" 
      };
      
      // 开发环境下，返回验证码便于测试
      if (Deno.env.get("DENO_ENV") === "development") {
        responseData.code = verificationCode;
        console.log(`开发环境验证码: ${verificationCode}`);
      }
      
      return new Response(
        JSON.stringify(responseData),
        { 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
          status: 200
        }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "邮件发送失败，请稍后重试" 
        }),
        { 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          },
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
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        status: 500
      }
    );
  }
}

// 辅助函数
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [email, data] of verificationCodes.entries()) {
    if (now > data.expires) {
      verificationCodes.delete(email);
    }
  }
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
      return new Response(
        JSON.stringify({ 
          status: "ok", 
          timestamp: new Date().toISOString(),
          service: "gmail-service-account-verification",
          service_account: SERVICE_ACCOUNT_EMAIL,
          impersonating: TARGET_USER_EMAIL
        }),
        { 
          headers: { 
            "Content-Type": "application/json",
            ...corsHeaders
          },
          status: 200
        }
      );
      
    case "/api/send-verification-code":
      if (request.method === "POST") {
        return handleSendVerificationCode(request);
      }
      break;
      
    case "/api/verify-code":
      if (request.method === "POST") {
        // 验证验证码的逻辑
        try {
          const body = await request.json();
          const { email, code } = body;
          
          const storedData = verificationCodes.get(email);
          
          if (!storedData) {
            return new Response(
              JSON.stringify({ 
                success: false, 
                message: "验证码不存在或已过期，请重新获取" 
              }),
              { 
                headers: { 
                  "Content-Type": "application/json",
                  ...corsHeaders
                },
                status: 400
              }
            );
          }
          
          if (Date.now() > storedData.expires) {
            verificationCodes.delete(email);
            return new Response(
              JSON.stringify({ 
                success: false, 
                message: "验证码已过期，请重新获取" 
              }),
              { 
                headers: { 
                  "Content-Type": "application/json",
                  ...corsHeaders
                },
                status: 400
              }
            );
          }
          
          if (storedData.attempts >= 5) {
            verificationCodes.delete(email);
            return new Response(
              JSON.stringify({ 
                success: false, 
                message: "验证码尝试次数过多，请重新获取" 
              }),
              { 
                headers: { 
                  "Content-Type": "application/json",
                  ...corsHeaders
                },
                status: 400
              }
            );
          }
          
          if (storedData.code === code) {
            verificationCodes.delete(email);
            return new Response(
              JSON.stringify({ 
                success: true, 
                message: "验证码验证成功" 
              }),
              { 
                headers: { 
                  "Content-Type": "application/json",
                  ...corsHeaders
                },
                status: 200
              }
            );
          } else {
            storedData.attempts++;
            verificationCodes.set(email, storedData);
            
            const remainingAttempts = 5 - storedData.attempts;
            return new Response(
              JSON.stringify({ 
                success: false, 
                message: `验证码错误，还有 ${remainingAttempts} 次尝试机会` 
              }),
              { 
                headers: { 
                  "Content-Type": "application/json",
                  ...corsHeaders
                },
                status: 400
              }
            );
          }
        } catch (error) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              message: "验证请求格式错误" 
            }),
            { 
              headers: { 
                "Content-Type": "application/json",
                ...corsHeaders
              },
              status: 400
            }
          );
        }
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
console.log(`🚀 Gmail Service Account 邮件验证服务启动中...`);
console.log(`📧 服务账户: ${SERVICE_ACCOUNT_EMAIL}`);
console.log(`👤 模拟用户: ${TARGET_USER_EMAIL}`);
console.log(`🌐 服务地址: http://localhost:${PORT}`);

if (!SERVICE_ACCOUNT_EMAIL || !SERVICE_ACCOUNT_PRIVATE_KEY || !TARGET_USER_EMAIL) {
  console.warn("⚠️  警告: 服务账户配置不完整！");
  console.warn("   请在环境变量中设置以下变量：");
  console.warn("   SERVICE_ACCOUNT_EMAIL=服务账户邮箱");
  console.warn("   SERVICE_ACCOUNT_PRIVATE_KEY=服务账户私钥");
  console.warn("   TARGET_USER_EMAIL=要模拟的用户邮箱");
}

serve(handleRequest, { port: parseInt(PORT) });