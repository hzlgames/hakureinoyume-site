// ZJU 账号凭据：加密存取、验证与解密读取。
import prisma from "../prisma";
import { buildCoursesClient, decryptSecret, encryptSecret } from "./shared";
import type { StoredZjuSecret } from "./shared";

async function validateCoursesSecret(secret: StoredZjuSecret) {
  const attempts: Array<() => Promise<void>> = [
    async () => {
      const client = await buildCoursesClient(secret);
      const response = await client.fetch(
        "https://courses.zju.edu.cn/api/my-semesters?fields=id,name,sort,is_active,code"
      );
      if (!response.ok) throw new Error("semesters validation failed");
      await response.json();
    },
    async () => {
      const client = await buildCoursesClient(secret);
      const response = await client.fetch("https://courses.zju.edu.cn/api/my-courses", {
        headers: { "Content-Type": "application/json" },
        method: "POST",
        body: JSON.stringify({
          fields: "id,name,course_code,status",
          page: 1,
          page_size: 1,
          conditions: {
            status: ["ongoing", "notStarted", "closed"],
            keyword: "",
            classify_type: "recently_started",
            display_studio_list: false
          },
          showScorePassedStatus: false
        })
      });
      if (!response.ok) throw new Error("courses validation failed");
      await response.json();
    },
    async () => {
      const client = await buildCoursesClient(secret);
      const response = await client.fetch("https://courses.zju.edu.cn/user/index");
      if (!response.ok) throw new Error("index validation failed");
    }
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch {
      // Try the next authenticated endpoint; transient ZJU failures are common.
    }
  }

  throw new Error("ZJU 账号验证失败，请检查学号或密码后重试。");
}

export async function getStoredZjuAccount(userId: string) {
  const account = await prisma.zjuAccount.findUnique({
    where: { userId }
  });

  if (!account) return null;

  return {
    id: account.id,
    username: account.username,
    hasPintiaCookie: Boolean(account.pintiaCiphertext),
    isValid: Boolean(account.lastValidatedAt),
    lastValidatedAt: account.lastValidatedAt,
    updatedAt: account.updatedAt
  };
}

export async function saveStoredZjuAccount(input: {
  clearPintiaCookie?: boolean;
  password?: string;
  pintiaCookie?: string;
  userId: string;
  username: string;
}) {
  const existing = await prisma.zjuAccount.findUnique({
    where: { userId: input.userId }
  });

  if (!existing && !input.password) {
    throw new Error("首次保存 ZJU 账号时密码不能为空。");
  }

  const currentSecret = existing
    ? await getZjuSecret(input.userId)
    : null;
  const nextSecret: StoredZjuSecret = {
    username: input.username,
    password: input.password || currentSecret?.password || "",
    pintiaCookie: input.clearPintiaCookie
      ? null
      : input.pintiaCookie?.trim()
        ? input.pintiaCookie.trim()
        : currentSecret?.pintiaCookie ?? null
  };

  await validateCoursesSecret(nextSecret);

  const password = input.password ? encryptSecret(input.password) : null;
  const pintiaCookie = input.clearPintiaCookie
    ? null
    : input.pintiaCookie?.trim()
      ? encryptSecret(input.pintiaCookie.trim())
      : undefined;
  const lastValidatedAt = new Date();

  if (existing) {
    await prisma.zjuAccount.update({
      where: { userId: input.userId },
      data: {
        username: input.username,
        lastValidatedAt,
        ...(password ? {
          passwordCiphertext: password.ciphertext,
          passwordIv: password.iv,
          passwordTag: password.tag
        } : {}),
        ...(pintiaCookie === undefined ? {} : {
          pintiaCiphertext: pintiaCookie?.ciphertext ?? null,
          pintiaIv: pintiaCookie?.iv ?? null,
          pintiaTag: pintiaCookie?.tag ?? null
        })
      }
    });
    return;
  }

  if (!password) {
    throw new Error("首次保存 ZJU 账号时密码不能为空。");
  }

  await prisma.zjuAccount.create({
    data: {
      userId: input.userId,
      username: input.username,
      passwordCiphertext: password.ciphertext,
      passwordIv: password.iv,
      passwordTag: password.tag,
      pintiaCiphertext: pintiaCookie?.ciphertext,
      pintiaIv: pintiaCookie?.iv,
      pintiaTag: pintiaCookie?.tag,
      lastValidatedAt
    }
  });
}

export async function deleteStoredZjuAccount(userId: string) {
  await prisma.zjuAccount.deleteMany({
    where: { userId }
  });
}

async function getZjuSecret(userId: string): Promise<StoredZjuSecret> {
  const account = await prisma.zjuAccount.findUnique({
    where: { userId }
  });

  if (!account) {
    throw new Error("请先保存 ZJU 学号和密码。");
  }

  const pintiaCookie = account.pintiaCiphertext && account.pintiaIv && account.pintiaTag
    ? decryptSecret({
      ciphertext: account.pintiaCiphertext,
      iv: account.pintiaIv,
      tag: account.pintiaTag
    })
    : null;

  return {
    username: account.username,
    password: decryptSecret({
      ciphertext: account.passwordCiphertext,
      iv: account.passwordIv,
      tag: account.passwordTag
    }),
    pintiaCookie
  };
}

export { getZjuSecret };
