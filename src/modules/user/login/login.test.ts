import { createTestConn } from "../../../testUtils/createTestConn";
import { Connection } from "typeorm";
import { User } from "../../../entity/User";
import { invalidLogin, confirmEmailError } from "./errorMessage";
import { TestClient } from "../../../utils/TestClient";
import * as faker from "faker";

faker.seed(Date.now() + 1);
const email = faker.internet.email();
const password = faker.internet.password();

const client = new TestClient(process.env.TEST_HOST as string);

let conn: Connection;

beforeAll(async () => {
  conn = await createTestConn();
});

afterAll(async () => {
  await conn.close();
});

const loginExpectError = async (e: string, p: string, errMsg: string) => {
  const response = await client.login(e, p);

  expect(response.data).toEqual({
    login: [
      {
        path: "email",
        message: errMsg
      }
    ]
  });
};

describe("login", () => {
  test("email not found send back error", async () => {
    await loginExpectError(
      faker.internet.email(),
      faker.internet.password(),
      invalidLogin
    );
  });

  test("email not confirmed", async () => {
    await client.register(email, password);
    await loginExpectError(email, password, confirmEmailError);

    await User.update({ email }, { confirmed: true }); // cheat to auto confirm email

    await loginExpectError(email, faker.internet.password(), invalidLogin);

    const response = await client.login(email, password);

    expect(response.data).toEqual({ login: null });
  });
});
