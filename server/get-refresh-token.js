const { google } = require('googleapis');
const readline = require('readline');

// 你的客户端ID和密钥
const CLIENT_ID = "843743281672-m0cdh4llgcna2qioq09ngjldv86h79pu.apps.googleusercontent.com";
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3001/oauth2callback';

// 初始化 OAuth2 客户端
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// 需要的权限范围
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify'
];

// 生成授权URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // 获取刷新令牌
  scope: SCOPES,
  prompt: 'consent' // 确保每次都获取刷新令牌
});

console.log('请访问以下URL授权:');
console.log(authUrl);
console.log('\n');

// 创建命令行界面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 请求授权码
rl.question('输入授权后获得的授权码: ', async (code) => {
  try {
    // 交换授权码获取令牌
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('\n✅ 令牌获取成功！');
    console.log('访问令牌:', tokens.access_token);
    console.log('刷新令牌:', tokens.refresh_token);
    console.log('过期时间:', tokens.expiry_date);
    
    // 测试发送邮件
    if (tokens.refresh_token) {
      console.log('\n测试发送邮件...');
      await testSendEmail(tokens.refresh_token);
    }
    
    rl.close();
  } catch (error) {
    console.error('获取令牌失败:', error);
    rl.close();
  }
});

async function testSendEmail(refreshToken) {
  // 使用刷新令牌创建新的 OAuth2 客户端
  const testOAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );
  
  testOAuth2Client.setCredentials({
    refresh_token: refreshToken
  });
  
  // 创建 Gmail API 客户端
  const gmail = google.gmail({ version: 'v1', auth: testOAuth2Client });
  
  // 创建邮件内容
  const message = [
    'From: "MonkeyPocket" <YOUR_EMAIL@gmail.com>',
    'To: YOUR_EMAIL@gmail.com',
    'Subject: 测试邮件 - Gmail API',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<h1>测试成功！</h1><p>Gmail API 已成功配置。</p>'
  ].join('\n');
  
  // Base64 编码
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });
    console.log('✅ 测试邮件发送成功！');
  } catch (error) {
    console.error('发送测试邮件失败:', error.message);
  }
}