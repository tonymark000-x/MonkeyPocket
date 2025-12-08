import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

async function sendEmailWithAppPassword(
  to: string, 
  subject: string, 
  html: string
): Promise<boolean> {
  const client = new SmtpClient();
  
  const GMAIL_USER = Deno.env.get("GMAIL_USER") || "";
  const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") || "";
  
  try {
    await client.connectTLS({
      hostname: "smtp.gmail.com",
      port: 465,
      username: GMAIL_USER,
      password: GMAIL_APP_PASSWORD,
    });
    
    await client.send({
      from: `MonkeyPocket <${GMAIL_USER}>`,
      to: to,
      subject: subject,
      content: html,
      html: true,
    });
    
    await client.close();
    return true;
  } catch (error) {
    console.error("SMTP发送失败:", error);
    return false;
  }
}