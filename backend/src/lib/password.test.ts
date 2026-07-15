import { describe, expect, it } from "bun:test";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("hashes a password to a non-plaintext value", async () => {
    const hash = await hashPassword("s3cret-pw");
    expect(hash).not.toBe("s3cret-pw");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("s3cret-pw");
    expect(await verifyPassword("s3cret-pw", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("s3cret-pw");
    expect(await verifyPassword("wrong-pw", hash)).toBe(false);
  });
});
