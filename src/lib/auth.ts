import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import prisma from "./prisma";
import { sendAuthEmail } from "./email";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
}

function getBaseUrl() {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "重置你的博麗の夢账号密码",
        text: `请打开以下链接重置密码：\n\n${url}\n\n如果这不是你本人操作，请忽略这封邮件。`
      });
    }
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail({
        to: user.email,
        subject: "验证你的博麗の夢账号邮箱",
        text: `请打开以下链接完成邮箱验证：\n\n${url}\n\n验证后即可登录。`
      });
    }
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = typeof user.email === "string" ? normalizeEmail(user.email) : "";
          const role = getAdminEmails().has(email) ? "admin" : "user";

          return {
            data: {
              ...user,
              email,
              role
            }
          };
        }
      }
    }
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      bannedUserMessage: "账号已被停用，请联系管理员。"
    }),
    nextCookies()
  ]
});

export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;
