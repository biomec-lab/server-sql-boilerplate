import { createTestConn } from "./testUtils/createTestConn";
import { User } from "./entity/User";
import "dotenv/config";
import "reflect-metadata";
import { GraphQLServer } from "graphql-yoga";
import * as session from "express-session";
import * as connectRedis from "connect-redis";

import { redis } from "./utils/redis";
import { createTypeormConn } from "./utils/createTypeormConn";
import { confirmEmail } from "./routes/confirmEmail";
import { genSchema } from "./utils/genSchema";
import { redisSessionPrefix } from "./constants/prefix";
import * as RateLimit from "express-rate-limit";
import * as RateLimitRedisStore from "rate-limit-redis";
import * as passport from "passport";
import { Strategy } from "passport-twitter";

const SESSION_SECRET = "ajslkjalksjdfkl";
const RedisStore = connectRedis(session);
const port = process.env.NODE_ENV === "test" ? 0 : 4000;

export const startServer = async () => {
  if (process.env.NODE_ENV === "test") {
    await redis.flushall(); // release memory from old session
  }

  const server = new GraphQLServer({
    schema: genSchema(),
    context: ({ request }) => ({
      redis,
      url: request.protocol + "://" + request.get("host"),
      session: request.session,
      req: request
    })
  });

  server.express.use(
    session({
      store: new RedisStore({
        client: redis as any,
        prefix: redisSessionPrefix
      }),
      name: "qid",
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
      }
    })
  );

  server.express.use(
    new RateLimit({
      store: new RateLimitRedisStore({
        client: redis
      }),
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    })
  );

  const cors = {
    credentials: true,
    origin:
      process.env.NODE_ENV === "test"
        ? "*"
        : (process.env.FRONTEND_HOST as string)
  };

  server.express.get("/confirm/:id", confirmEmail);

  const connection =
    process.env.NODE_ENV === "test"
      ? await createTestConn(true)
      : await createTypeormConn();

  passport.use(
    new Strategy(
      {
        consumerKey: process.env.TWITTER_CONSUMER_KEY as string,
        consumerSecret: process.env.TWITTER_CONSUMER_SECRET as string,
        callbackURL: "http://127.0.0.1:4000/auth/twitter/callback",
        includeEmail: true
      },
      async (_, __, profile, cb) => {
        const { id, emails } = profile;

        const query = connection
          .getRepository(User)
          .createQueryBuilder("user")
          .where("user.twitterId = :id", { id });

        let email: string | null = null;

        if (emails) {
          email = emails[0].value;
          query.orWhere("user.email = :email", { email });
        }
        let user = await query.getOne();

        // this user need to be registered
        if (!user) {
          user = await User.create({
            twitterId: id,
            email
          }).save();
        } else if (!user.twitterId) {
          // merge account
          // we found user by email
          user.twitterId = id;
          await user.save();
        } else {
          // we have a twitterId
          // login
        }

        return cb(null, { id: user.id });
      }
    )
  );

  server.express.use(passport.initialize());

  server.express.get("/auth/twitter", passport.authenticate("twitter"));

  server.express.get(
    "/auth/twitter/callback",
    passport.authenticate("twitter", { session: false }),
    (req, res) => {
      (req.session as any).userId = req.user.id;
      // @todo: Successful authentication, redirect to frontend.
      res.redirect("/");
    }
  );

  const app = await server.start({
    cors,
    port
  });
  console.log(`Server is running on http://localhost:${port}`);

  return app;
};
