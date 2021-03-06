import { Redis } from "ioredis";
import { userSessionIdPrefix, redisSessionPrefix } from "../constants/prefix";

export const removeAllUserSessions = async (userId: string, redis: Redis) => {
  const sessionIds = await redis.lrange(
    `${userSessionIdPrefix}${userId}`,
    0,
    -1
  );

  const promises: Array<Promise<number>> = [];
  sessionIds.forEach((sessionId: any) => {
    promises.push(redis.del(`${redisSessionPrefix}${sessionId}`));
  });
  await Promise.all(promises);
};
