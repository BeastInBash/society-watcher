import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { prisma } from "./prisma.ts";
import type { NotificationType, Prisma } from "@prisma/client";

const expo = new Expo();

interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

/**
 * Persist an in-app notification for each user and fire an Expo push
 * notification to their registered devices. Push failures are logged, not thrown.
 */
export async function notifyUsers({ userIds, type, title, body, data }: NotifyInput) {
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, type, title, body, data })),
  });

  try {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: userIds } },
      select: { token: true },
    });

    const messages: ExpoPushMessage[] = tokens
      .filter((t) => Expo.isExpoPushToken(t.token))
      .map((t) => ({
        to: t.token,
        sound: "default",
        title,
        body,
        data: { type, ...(data as object) },
      }));

    for (const chunk of expo.chunkPushNotifications(messages)) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    console.error("[push] failed to send:", err);
  }
}
